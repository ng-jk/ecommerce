"""Explicit real PostgreSQL/Docker gate; absent prerequisites fail, never skip."""

import asyncio
import io
import json
import os
import subprocess
import threading
import time
import urllib.request
import uuid
import zipfile
from http.server import ThreadingHTTPServer

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict
from psycopg.rows import dict_row

from extensions.runtime.contracts import Registry, digest
from extensions.runtime.package import build
from extensions.runtime.sandbox import DockerSandbox
from extensions.runtime.service import Service, handler
from extensions.runtime.storage import Storage


@pytest.fixture
def runtime(tmp_path):
    dsn = os.environ.get("PLUGIN_TEST_DATABASE_URL")
    image = os.environ.get("PLUGIN_TEST_SANDBOX_IMAGE")
    if not dsn or not image:
        pytest.fail(
            "BLOCKED: PLUGIN_TEST_DATABASE_URL and PLUGIN_TEST_SANDBOX_IMAGE are required for real PostgreSQL/Docker verification"
        )
    if conninfo_to_dict(dsn).get("dbname") != "plugin_runtime_test":
        pytest.fail("Use a dedicated database named plugin_runtime_test")
    probe = subprocess.run(
        ["docker", "version", "--format", "{{.Server.Version}}"],
        capture_output=True,
        timeout=15,
        check=False,
    )
    if probe.returncode:
        pytest.fail("BLOCKED: Docker engine unavailable; no host execution fallback")
    schema = "plugin_test_" + uuid.uuid4().hex
    with psycopg.connect(dsn) as db:
        db.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
    store = Storage(dsn)
    store.connect = lambda: psycopg.connect(
        dsn,
        row_factory=dict_row,
        options=f"-c search_path={schema} -c statement_timeout=3000 -c lock_timeout=1000",
    )
    store.migrate()
    package = tmp_path / "pricing.zip"
    package_hash = build(package)
    token = "test-caller-" + uuid.uuid4().hex
    entries = {
        name: {
            "tenant": tenant,
            "enabled": True,
            "package": str(package),
            "sha256": package_hash,
            "callers_sha256": [digest(token.encode())],
            "capabilities": ["quote.adjustments", "storage.read", "storage.write"],
        }
        for name, tenant in [("a", "company-a"), ("b", "company-b")]
    }
    registry = tmp_path / "registry.json"
    registry.write_text(json.dumps(entries))
    service = Service(Registry(registry), store, DockerSandbox(image))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler(service))
    http = threading.Thread(target=server.serve_forever, daemon=True)
    http.start()
    try:
        yield service, server.server_port, token
    finally:
        server.shutdown()
        server.server_close()
        http.join()
        with psycopg.connect(dsn) as db:
            db.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))


def test_real_http_worker_storage_isolation_and_replay(runtime):
    service, port, token = runtime
    payload = {
        "operation": "quote.adjustments",
        "input": {"subtotal_minor": 10000, "currency": "MYR"},
    }

    def invoke(installation, key):
        url = f"http://127.0.0.1:{port}/v1/installations/{installation}/operations"
        headers = {
            "Authorization": "Bearer " + token,
            "Idempotency-Key": key,
            "Content-Type": "application/json",
        }
        request = urllib.request.Request(url, json.dumps(payload).encode(), headers)
        with urllib.request.urlopen(request, timeout=5) as response:
            assert response.status == 202
            accepted = json.load(response)
        service.once()
        with urllib.request.urlopen(
            urllib.request.Request(url + "/" + accepted["id"], headers=headers),
            timeout=5,
        ) as response:
            result = json.load(response)
        assert result["status"] == "succeeded", result
        return result

    first = invoke("a", "first")
    assert first["result"]["proposal"] == {
        "fee_minor": 50,
        "discount_minor": 500,
        "currency": "MYR",
    }
    assert invoke("a", "first") == first
    assert invoke("b", "first")["result"] == first["result"]
    with service.storage.connect() as db:
        db.execute(
            "UPDATE plugin_values SET value=jsonb_set(value,'{packaging_fee_minor}','75'::jsonb) WHERE tenant='company-a' AND installation='a' AND key='pricing'"
        )
    assert invoke("a", "next")["result"]["proposal"]["fee_minor"] == 75
    assert invoke("b", "next")["result"]["proposal"]["fee_minor"] == 50


def test_real_sandbox_system_access_denied(runtime):
    service, _, _ = runtime
    source = """import json,os,socket
checks=[]
checks.append(not any('DATABASE' in key or 'TOKEN' in key for key in os.environ))
checks.append(not os.path.exists('/var/run/docker.sock'))
try:
    open('/etc/plugin-probe','w')
    checks.append(False)
except OSError:
    checks.append(True)
try:
    socket.socket()
    checks.append(False)
except OSError:
    checks.append(True)
print(json.dumps({'result':{'fee_minor':int(all(checks)),'discount_minor':0,'currency':'MYR'}}),flush=True)
"""
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as package:
        package.writestr("__main__.py", source)
    result = asyncio.run(
        service.sandbox.execute(
            archive.getvalue(),
            {"input": {"subtotal_minor": 1, "currency": "MYR"}},
            lambda *args: pytest.fail("unexpected SDK call"),
        )
    )
    assert result["fee_minor"] == 1
    infinite = io.BytesIO()
    with zipfile.ZipFile(infinite, "w") as package:
        package.writestr("__main__.py", "while True: pass\n")
    start = time.monotonic()
    with pytest.raises(TimeoutError):
        asyncio.run(
            service.sandbox.execute(
                infinite.getvalue(),
                {"input": {"subtotal_minor": 1, "currency": "MYR"}},
                lambda *args: None,
            )
        )
    assert time.monotonic() - start < 20
