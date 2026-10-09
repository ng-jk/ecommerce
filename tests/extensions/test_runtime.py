import asyncio
import importlib
import io
import json
import runpy
import sys
import threading
import urllib.error
import urllib.request
import uuid
import zipfile
from dataclasses import replace
from http.server import ThreadingHTTPServer
from unittest.mock import AsyncMock, Mock, patch

import pytest

from extensions.runtime import contracts as c
from extensions.runtime.package import build
from extensions.runtime.sandbox import DockerSandbox
from extensions.runtime.service import Service, handler
from extensions.runtime.storage import Storage

TOKEN = "x" * 40
PAYLOAD = {
    "operation": "quote.adjustments",
    "input": {"subtotal_minor": 10000, "currency": "MYR"},
}
RESULT = {"fee_minor": 50, "discount_minor": 500, "currency": "MYR"}
IMAGE = "python@sha256:" + "a" * 64


@pytest.fixture
def binding(tmp_path):
    package = tmp_path / "plugin.zip"
    sha = build(package)
    return c.Binding(
        "install-a",
        "tenant-a",
        c.digest(TOKEN.encode()),
        str(package),
        sha,
        frozenset({"quote.adjustments", "storage.read", "storage.write"}),
    )


def test_reproducible_package_and_registry(binding, tmp_path):
    assert build(tmp_path / "second.zip") == binding.sha256
    assert c.package_bytes(binding)
    path = tmp_path / "registry.json"
    row = {
        "enabled": True,
        "tenant": binding.tenant,
        "package": binding.package,
        "sha256": binding.sha256,
        "callers_sha256": [binding.caller],
        "capabilities": list(binding.capabilities),
    }
    path.write_text(json.dumps({binding.installation: row}))
    registry = c.Registry(path)
    assert registry.resolve(binding.installation, binding.caller) == binding
    for change, error in [
        ({"enabled": False}, "installation_unavailable"),
        ({"callers_sha256": []}, "forbidden"),
        ({"capabilities": ["system.exec"]}, "invalid_capabilities"),
        ({"capabilities": []}, "forbidden"),
    ]:
        path.write_text(json.dumps({binding.installation: {**row, **change}}))
        with pytest.raises(c.Rejected, match=error):
            registry.resolve(binding.installation, binding.caller)


@pytest.mark.parametrize(
    "value",
    [
        None,
        {},
        {"operation": "other", "input": {}},
        {
            "operation": "quote.adjustments",
            "input": {"subtotal_minor": True, "currency": "MYR"},
        },
        {
            "operation": "quote.adjustments",
            "input": {"subtotal_minor": 2, "currency": "myr"},
        },
    ],
)
def test_invocation_rejects(value):
    with pytest.raises(c.Rejected):
        c.invocation(value)


def test_contracts():
    assert c.invocation(PAYLOAD) == PAYLOAD
    assert c.proposal(RESULT, PAYLOAD["input"]) == RESULT
    for value in [
        {**RESULT, "currency": "USD"},
        {**RESULT, "discount_minor": 10001},
        {**RESULT, "fee_minor": True},
    ]:
        with pytest.raises(c.Rejected):
            c.proposal(value, PAYLOAD["input"])
    for value in [None, "../a", "", "a" * 81]:
        with pytest.raises(c.Rejected):
            c.identifier(value)
    with pytest.raises(ValueError):
        c.canonical(float("nan"))


def test_archive_rejections(binding):
    with pytest.raises(c.Rejected, match="digest"):
        c.package_bytes(replace(binding, sha256="wrong"))
    with zipfile.ZipFile(binding.package) as archive:
        original = {name: archive.read(name) for name in archive.namelist()}
    for name, content in [
        ("../escape.py", b"x"),
        ("nested/a.py", b"x"),
        ("binary.exe", b"x"),
    ]:
        with zipfile.ZipFile(binding.package, "w") as archive:
            for key, value in {**original, name: content}.items():
                archive.writestr(key, value)
        from pathlib import Path

        data = Path(binding.package).read_bytes()
        with pytest.raises(c.Rejected, match="invalid_path"):
            c.package_bytes(replace(binding, sha256=c.digest(data)))


class Cursor:
    def __init__(self, value=None, count=1):
        self.value, self.rowcount = value, count

    def fetchone(self):
        return self.value


class Database:
    def __init__(self, values):
        self.values = iter(values)
        self.calls = []
        self.autocommit = False

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def execute(self, query, params=None):
        self.calls.append((query, params))
        value = next(self.values)
        return value if isinstance(value, Cursor) else Cursor(value)

    def notifies(self, **kwargs):
        return []


def database(values):
    store = Storage("postgresql://plugin-only")
    db = Database(values)
    store.connect = Mock(return_value=db)
    return store, db


def test_acceptance_and_scoped_poll(binding):
    store, db = database([None, None, {"n": 0}, None, None])
    operation = store.accept(binding, "key", PAYLOAD)
    assert uuid.UUID(operation)
    assert db.calls[3][1][1:4] == (binding.tenant, binding.installation, binding.caller)
    fingerprint = c.digest(c.canonical(PAYLOAD).encode())
    store, _ = database([None, {"id": operation, "payload_hash": fingerprint}])
    assert store.accept(binding, "key", PAYLOAD) == operation
    store, _ = database([None, {"id": operation, "payload_hash": "different"}])
    with pytest.raises(c.Rejected, match="conflict"):
        store.accept(binding, "key", PAYLOAD)
    store, _ = database([None, None, {"n": 20}])
    with pytest.raises(c.Rejected, match="queue_full"):
        store.accept(binding, "key", PAYLOAD)
    store, db = database([{"id": operation, "status": "queued", "result": None}])
    assert store.poll(binding, operation)["status"] == "queued"
    assert db.calls[0][1][1:] == (binding.tenant, binding.installation, binding.caller)
    store, _ = database([None])
    with pytest.raises(c.Rejected, match="missing"):
        store.poll(binding, operation)


def test_claim_fencing_wait_and_migrate():
    store, _ = database([None, None])
    assert store.claim() is None
    store, _ = database([None, {"id": "job"}, None])
    assert uuid.UUID(store.claim()["fence"])
    store, _ = database([None])
    store.complete({"id": "job", "fence": "f"}, "succeeded", {})
    store, _ = database([Cursor(count=0)])
    with pytest.raises(c.Rejected, match="stale"):
        store.complete({"id": "job", "fence": "f"}, "succeeded", {})
    for pending in [None, {"id": 1}]:
        store, db = database([None, pending])
        store.wait()
        assert db.autocommit
    store, _ = database([None])
    store.migrate()
    with patch(
        "extensions.runtime.storage.psycopg.connect", return_value="db"
    ) as connect:
        assert Storage("plugin").connect() == "db"
        assert connect.call_args.args == ("plugin",)


def test_storage_capabilities_fence_quota_and_replay(binding):
    job = {"id": "job", "fence": "f"}
    get = {"method": "storage.get", "params": {"key": "pricing"}}
    put = {"method": "storage.set", "params": {"key": "pricing", "value": {"fee": 50}}}
    for value in [None, {"value": 5}]:
        store, db = database([{"id": "job"}, None, None, value, None])
        assert store.rpc(binding, job, 0, get) == {
            "value": None if value is None else 5
        }
        assert db.calls[3][1][:2] == (binding.tenant, binding.installation)
    for count, existing in [(0, None), (1000, {"key": "pricing"})]:
        store, _ = database(
            [{"id": "job"}, None, None, {"n": count}, existing, None, None]
        )
        assert store.rpc(binding, job, 0, put) == {"saved": True}
    store, _ = database([{"id": "job"}, None, None, {"n": 1000}, None])
    with pytest.raises(c.Rejected, match="storage_full"):
        store.rpc(binding, job, 0, put)
    store, _ = database([None])
    with pytest.raises(c.Rejected, match="stale"):
        store.rpc(binding, job, 0, get)
    for fingerprint in [c.digest(c.canonical(get).encode()), "different"]:
        store, _ = database(
            [{"id": "job"}, {"request_hash": fingerprint, "result": {"value": 5}}]
        )
        if fingerprint == "different":
            with pytest.raises(c.Rejected, match="replay_mismatch"):
                store.rpc(binding, job, 0, get)
        else:
            assert store.rpc(binding, job, 0, get) == {"value": 5}
    for request, granted in [
        ({"method": "core.sql", "params": {}}, binding),
        (get, replace(binding, capabilities=frozenset())),
        ({"method": "storage.get", "params": {"key": "k", "tenant": "b"}}, binding),
        (
            {"method": "storage.set", "params": {"key": "k", "value": "x" * 8192}},
            binding,
        ),
    ]:
        with pytest.raises(c.Rejected):
            Storage("unused").rpc(granted, job, 0, request)


def fake_process(messages, code=0):
    process = Mock()
    process.stdout.readline = AsyncMock(
        side_effect=[(json.dumps(item) + "\n").encode() for item in messages]
    )
    process.stdin.drain = AsyncMock()
    process.wait = AsyncMock(return_value=code)
    process.returncode = None
    return process


def test_sandbox_protocol_and_flags():
    sandbox = DockerSandbox(IMAGE)
    command = sandbox.command("safe")
    for flag in [
        "--network=none",
        "--read-only",
        "--cap-drop=ALL",
        "--user=65534:65534",
        "--pids-limit=16",
        "--pull=never",
    ]:
        assert flag in command
    with pytest.raises(c.Rejected):
        DockerSandbox("python:latest")
    rpc = Mock(return_value={"value": None})
    process = fake_process(
        [
            {"rpc": {"method": "storage.get", "params": {"key": "key"}}},
            {"result": RESULT},
        ]
    )
    assert asyncio.run(sandbox.exchange(process, b"zip", PAYLOAD, rpc)) == RESULT
    rpc.assert_called_once_with(0, {"method": "storage.get", "params": {"key": "key"}})
    for messages, code in [
        ([{"unexpected": 1}], 0),
        ([{"result": RESULT}], 1),
        ([{"rpc": {}}] * 33, 0),
    ]:
        with pytest.raises(c.Rejected):
            asyncio.run(
                sandbox.exchange(fake_process(messages, code), b"zip", PAYLOAD, rpc)
            )
    process = fake_process([])
    process.stdout.readline = AsyncMock(return_value=b"")
    with pytest.raises(c.Rejected):
        asyncio.run(sandbox.exchange(process, b"zip", PAYLOAD, rpc))


def test_sandbox_cleanup():
    sandbox = DockerSandbox(IMAGE)
    for running in [None, 0]:
        process = fake_process([{"result": RESULT}])
        process.returncode = running
        cleanup = fake_process([])
        with patch(
            "extensions.runtime.sandbox.asyncio.create_subprocess_exec",
            AsyncMock(side_effect=[process, cleanup]),
        ):
            assert asyncio.run(sandbox.execute(b"zip", PAYLOAD, Mock())) == RESULT
            assert process.kill.called == (running is None)
    cleanup = fake_process([])
    cleanup.wait.side_effect = [TimeoutError(), 0]
    with (
        patch(
            "extensions.runtime.sandbox.asyncio.create_subprocess_exec",
            AsyncMock(side_effect=[fake_process([{"result": RESULT}]), cleanup]),
        ),
        pytest.raises(RuntimeError, match="cleanup"),
    ):
        asyncio.run(sandbox.execute(b"zip", PAYLOAD, Mock()))
    with (
        patch(
            "extensions.runtime.sandbox.asyncio.create_subprocess_exec",
            AsyncMock(side_effect=[OSError(), fake_process([])]),
        ),
        pytest.raises(OSError),
    ):
        asyncio.run(sandbox.execute(b"zip", PAYLOAD, Mock()))


def test_worker_authority_and_failure(binding):
    registry, storage, sandbox = Mock(), Mock(), Mock()
    registry.resolve.return_value = binding
    sandbox.execute = AsyncMock(return_value=RESULT)
    service = Service(registry, storage, sandbox)
    storage.claim.return_value = None
    assert service.once() is False
    job = {
        "id": "job",
        "installation": binding.installation,
        "tenant": binding.tenant,
        "caller": binding.caller,
        "package_hash": binding.sha256,
        "payload": PAYLOAD,
    }
    storage.claim.return_value = job
    assert service.once()
    assert storage.complete.call_args.args[2]["authority"] == "requires_core_validation"
    rpc = sandbox.execute.call_args.args[2]
    rpc(0, {"method": "storage.get", "params": {"key": "pricing"}})
    assert storage.rpc.call_args.args[0] == binding
    registry.resolve.return_value = replace(binding, tenant="other")
    with pytest.raises(c.Rejected, match="changed"):
        rpc(1, {})
    service.once()
    assert storage.complete.call_args.args[1] == "rejected"
    registry.resolve.return_value = binding
    sandbox.execute.side_effect = RuntimeError("secret")
    service.once()
    assert storage.complete.call_args.args[2] == {"error": "plugin_execution_failed"}
    with pytest.raises(c.Rejected, match="unauthenticated"):
        service.authenticate("install", None)
    storage.accept.return_value = str(uuid.uuid4())
    assert (
        service.accept(binding.installation, "Bearer " + TOKEN, "key", PAYLOAD)[
            "status"
        ]
        == "accepted"
    )
    service.poll(binding.installation, "Bearer " + TOKEN, storage.accept.return_value)


def test_http_transport(binding):
    registry, storage = Mock(), Mock()
    registry.resolve.return_value = binding
    storage.accept.return_value = str(uuid.uuid4())
    storage.poll.return_value = {"status": "queued"}
    service = Service(registry, storage, Mock())
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler(service))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{server.server_port}/v1/installations/install-a/operations"
    headers = {
        "Authorization": "Bearer " + TOKEN,
        "Idempotency-Key": "key",
        "Content-Type": "application/json",
    }
    try:
        request = urllib.request.Request(url, json.dumps(PAYLOAD).encode(), headers)
        with urllib.request.urlopen(request) as response:
            assert response.status == 202
        with urllib.request.urlopen(
            urllib.request.Request(
                url + "/" + storage.accept.return_value, headers=headers
            )
        ) as response:
            assert response.status == 200
        for endpoint, body, changed, status in [
            (url, b"{}", {}, 422),
            (url, b"{", headers, 422),
            (url + "/bad", None, headers, 422),
            (url + "/other/path", None, headers, 404),
        ]:
            with pytest.raises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(urllib.request.Request(endpoint, body, changed))
            assert error.value.code == status
        storage.accept.side_effect = RuntimeError("private")
        with pytest.raises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(request)
        assert error.value.code == 503
        assert b"private" not in error.value.read()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_entrypoints(tmp_path):
    from pathlib import Path

    from extensions.runtime import package, service

    with patch.object(sys, "argv", ["package", str(tmp_path / "sample.zip")]):
        package.main()
        runpy.run_path(str(Path(package.__file__)), run_name="__main__")
    environment = {
        "PLUGIN_DATABASE_URL": "plugin",
        "PLUGIN_REGISTRY": "registry",
        "PLUGIN_SANDBOX_IMAGE": IMAGE,
    }
    with (
        patch.dict("os.environ", environment),
        patch.object(service, "Storage") as store,
        patch.object(service, "ThreadingHTTPServer") as server,
    ):
        with patch.object(sys, "argv", ["service", "migrate"]):
            service.main()
        store.return_value.migrate.assert_called_once()
        with patch.object(sys, "argv", ["service", "api"]):
            service.main()
        server.return_value.serve_forever.assert_called_once()
        with (
            patch.object(sys, "argv", ["service", "worker"]),
            patch.object(
                service.Service, "once", side_effect=[True, False, KeyboardInterrupt()]
            ),
            pytest.raises(KeyboardInterrupt),
        ):
            service.main()
        store.return_value.wait.assert_called_once()
        with (
            patch.object(sys, "argv", ["service", "unknown"]),
            pytest.raises(c.Rejected),
        ):
            service.main()
    with (
        patch.dict("os.environ", environment),
        patch("extensions.runtime.storage.Storage.migrate"),
        patch.object(sys, "argv", ["service", "migrate"]),
        pytest.warns(RuntimeWarning, match="found in sys.modules"),
    ):
        runpy.run_module("extensions.runtime.service", run_name="__main__")


def test_reference_script_and_sdk():
    from extensions.runtime.reference import sdk

    with (
        patch.object(
            sys, "stdin", io.StringIO('{"ok":{"value":5}}\n{"ok":{"saved":true}}\n')
        ),
        patch.object(sys, "stdout", io.StringIO()) as output,
    ):
        assert sdk.get("key") == 5
        assert sdk.set_value("key", 5) == {"saved": True}
        sdk.finish(RESULT)
        assert len(output.getvalue().splitlines()) == 3
    for settings, subtotal in [
        (None, 10000),
        (
            {
                "packaging_fee_minor": 100,
                "discount_threshold_minor": 10000,
                "discount_basis_points": 500,
            },
            100,
        ),
    ]:
        mock_sdk = Mock()
        mock_sdk.get.return_value = settings
        with (
            patch.dict(sys.modules, {"sdk": mock_sdk}),
            patch.object(
                sys,
                "argv",
                ["plugin", json.dumps({"subtotal_minor": subtotal, "currency": "MYR"})],
            ),
        ):
            sys.modules.pop("extensions.runtime.reference.__main__", None)
            importlib.import_module("extensions.runtime.reference.__main__")
        result = mock_sdk.finish.call_args.args[0]
        assert result["discount_minor"] == (500 if subtotal == 10000 else 0)
        assert mock_sdk.set_value.called == (settings is None)
