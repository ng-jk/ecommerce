"""Server-only service release safety and orchestration; no Docker/SSH mutations."""

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from tools import service_release as release

SHA = "a" * 40
CORE = {"DB_DATABASE": "commerce_test", "DB_USERNAME": "commerce_test", "DB_HOST": "db"}
SNAPSHOT = {
    "databases": [
        {
            "name": "postgres",
            "owner": "supabase_admin",
            "acl": None,
            "allow_connections": True,
        },
        {
            "name": "commerce_test",
            "owner": "commerce_test",
            "acl": "{commerce_test=CTc}",
            "allow_connections": True,
        },
    ],
    "connections": [
        {"role": "supabase_admin", "database": "postgres"},
        {"role": "authenticator", "database": "postgres"},
        {"role": "commerce_test", "database": "commerce_test"},
    ],
    "service_roles": [],
}


@pytest.fixture
def state(tmp_path):
    root = tmp_path / "server-secrets"
    return root, release.runtime(root, "testing", "shop3i-test", CORE)


def test_runtime_is_persistent_and_environment_bound(state):
    root, current = state
    assert release.runtime(root, "testing", "shop3i-test", CORE) == current
    passwords = [entry["password"] for entry in current["services"].values()]
    assert len(set(passwords)) == 8
    for args in [("production", "shop3i-test"), ("testing", "other-project")]:
        with pytest.raises(ValueError, match="different environment"):
            release.runtime(root, *args, CORE)


@pytest.mark.parametrize("value", ["bad;drop", "Bad", "", "x" * 64, None])
def test_database_identifiers_reject_injection(value):
    with pytest.raises(ValueError):
        release.identifier(value)


@pytest.mark.parametrize(
    "environment,project", [("staging", "x"), ("testing", "UPPER"), ("testing", "../x")]
)
def test_runtime_rejects_untrusted_environment(tmp_path, environment, project):
    with pytest.raises(ValueError):
        release.runtime(tmp_path / "secrets", environment, project, CORE)


def test_runtime_rejects_relative_path_and_symlink(tmp_path, monkeypatch):
    with pytest.raises(ValueError):
        release.runtime(Path("relative"), "testing", "project", CORE)
    monkeypatch.setattr(Path, "is_symlink", lambda self: True)
    with pytest.raises(ValueError):
        release.runtime(tmp_path / "link", "testing", "project", CORE)
    with pytest.raises(ValueError):
        release.private_write(tmp_path / "link", "secret")


@pytest.mark.parametrize("mutation", ["missing", "collision", "password", "key"])
def test_runtime_never_repairs_corrupt_credentials_by_rotating(state, mutation):
    root, current = state
    if mutation == "missing":
        del current["services"]["crm"]
    elif mutation == "collision":
        current["services"]["crm"]["database"] = CORE["DB_DATABASE"]
    elif mutation == "password":
        current["services"]["crm"]["password"] = "short"
    else:
        current["services"]["crm"]["app_key"] = "bad"
    (root / "state.json").write_text(json.dumps(current))
    before = (root / "state.json").read_bytes()
    with pytest.raises(ValueError):
        release.runtime(root, "testing", "shop3i-test", CORE)
    assert (root / "state.json").read_bytes() == before


def test_environment_parser_and_atomic_private_files(tmp_path):
    path = tmp_path / "core.env"
    path.write_text(
        "# comment\n\nDB_HOST=\"db\"\nDB_PASSWORD=contains=equals\nAPP_NAME='Shop'\n"
    )
    assert release.read_environment(path) == {
        "DB_HOST": "db",
        "DB_PASSWORD": "contains=equals",
        "APP_NAME": "Shop",
    }
    release.private_write(path, "fresh")
    release.private_write(path, "replacement")
    assert path.read_text() == "replacement"
    for bad in ["INVALID", "bad=x", "KEY=x\nKEY=y", 'KEY="mismatch', "KEY=\x00"]:
        path.write_text(bad)
        with pytest.raises(ValueError):
            release.read_environment(path)


def test_generated_envs_are_partitioned_and_disabled_until_ready(state):
    root, current = state
    release.write_environments(root, current, CORE)
    platform = release.read_environment(root / "platform.env")
    for service, value in current["services"].items():
        domain = release.read_environment(root / (service + ".env"))
        assert domain["DB_USERNAME"] == value["role"]
        assert domain["DB_PASSWORD"] == value["password"]
        assert domain["APP_KEY"] == value["app_key"]
        assert domain["SERVICE_NAME"] == service
        assert platform[service.upper() + "_SERVICE_PROVISIONED"] == "false"
        assert "DB_PASSWORD" not in platform
        for foreign in current["services"].values():
            if foreign != value:
                assert (
                    foreign["password"] not in (root / (service + ".env")).read_text()
                )
                assert (
                    foreign["signing_key"]
                    not in (root / (service + ".env")).read_text()
                )
    release.write_environments(root, current, CORE, enabled=True)
    assert (
        release.read_environment(root / "platform.env")["HR_SERVICE_PROVISIONED"]
        == "true"
    )
    assert "pm.max_children = 1" in (root / "pool.conf").read_text()
    with pytest.raises(ValueError):
        release.write_environments(root, current, {**CORE, "DB_HOST": "db\nFORGED=yes"})


def test_preflight_requires_capacity_for_all_services_plus_reserve():
    release.preflight("MemAvailable: 3000000 kB\n")
    for memory in ["MemAvailable: 1000000 kB\n", "MemFree: 9000000 kB"]:
        with pytest.raises(RuntimeError):
            release.preflight(memory)


def certificate_runner(calls):
    def invoke(command, **kwargs):
        calls.append(command)
        for flag in ["-keyout", "-out"]:
            if flag in command:
                Path(command[command.index(flag) + 1]).write_text("certificate fixture")
        return b""

    return invoke


def test_certificate_creation_reuses_trust_and_validates_every_hostname(state):
    root, _ = state
    calls = []
    release.certificates(root, certificate_runner(calls))
    assert sum("-verify_hostname" in call for call in calls) == 9
    assert sum("-newkey" in call for call in calls) == 2
    calls.clear()
    release.certificates(root, certificate_runner(calls))
    assert not any("-newkey" in call for call in calls)
    (root / "certificates/services.key").unlink()
    with pytest.raises(RuntimeError, match="Partial"):
        release.certificates(root, certificate_runner(calls))


def test_provisioning_sql_preserves_existing_roles_but_not_cross_service_authority(
    state,
):
    _, current = state
    snapshot = json.loads(json.dumps(SNAPSHOT))
    snapshot["connections"] += [
        {"role": "old_domain", "database": "postgres"},
        {"role": 'odd"role', "database": 'odd"db'},
    ]
    snapshot["service_roles"] = ["old_domain"]
    sql = release.provisioning_sql(current, snapshot)
    assert 'GRANT CONNECT ON DATABASE "postgres" TO "authenticator"' in sql
    assert 'GRANT CONNECT ON DATABASE "postgres" TO old_domain' not in sql
    assert 'TO "old_domain"' not in sql
    assert 'TO "odd""role"' in sql
    assert 'REVOKE CONNECT ON DATABASE "postgres" FROM PUBLIC' in sql
    assert (
        "rolbypassrls" in sql
        and "pg_auth_members" in sql
        and "shobj_description" in sql
    )
    assert (
        sql.index("BEGIN;")
        < sql.index('GRANT CONNECT ON DATABASE "postgres"')
        < sql.index("COMMIT;")
    )
    for service in release.SERVICES:
        assert "CREATE DATABASE shop3i_test_" + service in sql
    assert release.literal("it's") == "'it''s'"
    assert "datacl::text" in release.database_snapshot_sql()


def database_runner(calls, *, foreign="0", preserved="1", correct_password=True):
    def invoke(command, **kwargs):
        calls.append((command, kwargs))
        if "verify" in command:
            return (
                command[command.index("-U") + 1] if correct_password else "wrong"
            ).encode()
        query = kwargs.get("input", b"").decode()
        if query.startswith("SELECT json_build_object"):
            return json.dumps(SNAPSHOT).encode()
        if query.startswith("SELECT count(*)"):
            return foreign.encode()
        if query.startswith("SELECT has_database_privilege"):
            return preserved.encode()
        return b""

    return invoke


def test_provision_snapshots_acl_checks_credentials_and_keeps_supabase_access(state):
    root, current = state
    calls = []
    release.provision(
        root, current, ["sudo", "-n", "docker"], "supabase-db", database_runner(calls)
    )
    assert len(list(root.glob("acl-before-*.json"))) == 1
    assert json.loads(next(root.glob("acl-before-*.json")).read_text()) == SNAPSHOT
    credential_calls = [
        (command, data) for command, data in calls if "verify" in command
    ]
    assert len(credential_calls) == 8
    for command, data in credential_calls:
        assert len(data["input"].decode().strip()) == 64
        assert data["input"].decode().strip() not in " ".join(command)
    # A second run reuses existing identities and captures a separate recovery snapshot.
    release.provision(root, current, ["docker"], "supabase-db", database_runner([]))
    assert len(list(root.glob("acl-before-*.json"))) == 2


@pytest.mark.parametrize("failure", ["foreign", "credentials", "supabase"])
def test_provision_fails_closed_on_isolation_or_existing_user_regression(
    state, failure
):
    root, current = state
    runner = database_runner(
        [],
        foreign="1" if failure == "foreign" else "0",
        preserved="0" if failure == "supabase" else "1",
        correct_password=failure != "credentials",
    )
    with pytest.raises(RuntimeError):
        release.provision(root, current, ["docker"], "supabase-db", runner)
    assert not (root / "ready.json").exists()


def test_compose_command_uses_external_runtime_and_both_manifests(state):
    root, _ = state
    command = release.compose_command(["docker"], "/secrets/core.env", root, "test")
    assert command.count("--env-file") == 2
    assert command[-4:] == [
        "-f",
        "compose.server.yaml",
        "-f",
        "compose.server.services.yaml",
    ]


def test_domain_backups_are_verified_before_migration(state):
    root, current = state
    calls = []

    def runner(command, **kwargs):
        calls.append((command, kwargs))
        if "stdout_path" in kwargs:
            kwargs["stdout_path"].write_bytes(b"PGDMP fixture")
        return b""

    release.backup_domains(root, current, ["docker"], "db", SHA, runner)
    assert len(list((root / "backups").glob("*.dump"))) == 8
    assert sum("pg_restore" in command for command, _ in calls) == 8
    with pytest.raises(ValueError):
        release.backup_domains(root, current, ["docker"], "db", "invalid", runner)
    with pytest.raises(RuntimeError):
        release.backup_domains(
            root, current, ["docker"], "db", SHA, lambda *args, **kwargs: b""
        )


def processes():
    return [
        {"Service": name, "State": "running", "Health": ""}
        for name in [
            "service-worker",
            "service-gateway",
            *release.SERVICES,
            *(s + "-worker" for s in release.SERVICES),
        ]
    ]


@pytest.mark.parametrize("ndjson", [True, False])
def test_probe_requires_durable_roundtrip_and_all_workers(ndjson):
    calls = []
    output = (
        "\n".join(json.dumps(row) for row in processes())
        if ndjson
        else json.dumps(processes())
    )

    def runner(command, **kwargs):
        calls.append((command, kwargs))
        return output.encode() if "ps" in command else b""

    release.probe(["docker", "compose"], runner)
    assert "ps" in calls[0][0]
    assert calls[1][1]["timeout"] == 180
    script = calls[1][0][-1]
    assert "transport.health" in script
    assert "->deliver(" in script
    assert "service_inboxes" in script
    assert "status==='succeeded'" not in script
    assert "status!=='succeeded'" in script
    assert "microtime(true)+45" in script
    assert all(f'"{service}"' in script for service in release.SERVICES)

    with pytest.raises(RuntimeError):
        release.probe(
            ["docker", "compose"],
            lambda command, **kwargs: b"[]" if "ps" in command else b"",
        )


def test_deploy_activates_only_after_isolation_backups_migrations_and_readiness(
    state, monkeypatch
):
    root, current = state
    steps = []
    monkeypatch.setattr(release, "provision", lambda *args: steps.append("provision"))
    monkeypatch.setattr(
        release, "backup_domains", lambda *args: steps.append("backups")
    )
    monkeypatch.setattr(release, "probe", lambda *args: steps.append("probe"))
    monkeypatch.setattr(
        release, "isolation_probe", lambda *args: steps.append("isolation")
    )

    def runner(command, **kwargs):
        enabled = release.read_environment(root / "platform.env")[
            "CRM_SERVICE_PROVISIONED"
        ]
        if "up" in command and "worker" in command:
            assert enabled == "true"
        else:
            assert enabled == "false"
        steps.append(command)
        return b""

    release.deploy(root, current, CORE, ["compose"], ["docker"], "db", SHA, runner)
    assert steps[:2] == ["provision", "backups"]
    assert (
        len([step for step in steps if isinstance(step, list) and "migrate" in step])
        == 16
    )
    first_up, final_up = [
        step for step in steps if isinstance(step, list) and "up" in step
    ]
    assert "backend" in first_up and "--force-recreate" in first_up
    assert {"backend", "worker", "service-worker"} <= set(final_up)
    assert "--force-recreate" in final_up
    assert steps[-2] == "probe" and steps[-1] == final_up
    assert json.loads((root / "ready.json").read_text())["release"] == SHA
    assert (
        release.read_environment(root / "platform.env")["CRM_SERVICE_PROVISIONED"]
        == "true"
    )
    monkeypatch.setattr(
        release, "probe", lambda *args: (_ for _ in ()).throw(RuntimeError("unready"))
    )
    with pytest.raises(RuntimeError):
        release.deploy(root, current, CORE, ["compose"], ["docker"], "db", SHA, runner)
    assert (
        release.read_environment(root / "platform.env")["CRM_SERVICE_PROVISIONED"]
        == "false"
    )


def test_runner_sanitizes_failures_and_returns_bytes(monkeypatch):
    calls = []

    def success(command, **kwargs):
        calls.append(kwargs)
        return SimpleNamespace(returncode=0, stdout=b"ok")

    monkeypatch.setattr(release.subprocess, "run", success)
    assert release.run(["docker"], input=b"secret", env={"A": "B"}) == b"ok"
    assert calls[0]["stderr"] == release.subprocess.PIPE and calls[0]["timeout"] == 600
    monkeypatch.setattr(
        release.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(returncode=1, stdout=b"password"),
    )
    with pytest.raises(RuntimeError) as error:
        release.run(["docker"])
    assert "password" not in str(error.value)


def test_server_topology_has_no_host_ports_or_shared_domain_credentials():
    import yaml

    document = yaml.safe_load(Path("compose.server.services.yaml").read_text())
    assert document["networks"]["service_transport"]["internal"] is True
    for service in release.SERVICES:
        for name in [service, service + "-worker"]:
            config = document["services"][name]
            assert "ports" not in config
            assert config["env_file"] == [
                "${SERVICE_RUNTIME_DIR:?Prepare service runtime}/" + service + ".env"
            ]
            assert config["cap_drop"] == ["ALL"]
    assert "ports" not in document["services"]["service-gateway"]
    gateway = Path("docker/services/server.Caddyfile").read_text()
    assert "authorize" in gateway and "tls /certificates/services.crt" in gateway
    assert "file_server" not in gateway


def test_certificate_does_not_silently_replace_missing_ca(state):
    root, _ = state
    directory = root / "certificates"
    directory.mkdir()
    for name in ["services.crt", "services.key"]:
        (directory / name).write_text("existing")
    with pytest.raises(RuntimeError, match="no trusted CA"):
        release.certificates(root, certificate_runner([]))


def isolation_runner(state, *, tables=None, foreign_allowed=False, unavailable=False):
    by_role = {
        value["role"]: (service, value) for service, value in state["services"].items()
    }

    def runner(command, **kwargs):
        role = command[command.index("-U") + 1]
        database = command[command.index("-d") + 1]
        service, value = by_role[role]
        if database != value["database"]:
            if foreign_allowed:
                return role.encode()
            raise RuntimeError("permission denied fixture")
        if command[-1] == "SELECT current_user":
            return b"wrong" if unavailable else role.encode()
        shared = [
            "public.migrations",
            "public.service_inboxes",
            "public.service_deliveries",
            "public.service_request_nonces",
        ]
        domain = (
            "public." + ("insight" if service == "insights" else service) + "_records"
        )
        return "\n".join(tables if tables is not None else [*shared, domain]).encode()

    return runner


def test_actual_runtime_credentials_cannot_connect_to_foreign_databases(state):
    _, current = state
    release.isolation_probe(
        current, ["sudo", "-n", "docker"], "db", isolation_runner(current)
    )
    for options in [
        {"tables": ["public.users"]},
        {"foreign_allowed": True},
        {"unavailable": True},
    ]:
        with pytest.raises(RuntimeError):
            release.isolation_probe(
                current, ["docker"], "db", isolation_runner(current, **options)
            )


def test_streaming_subprocess_does_not_load_database_dumps_into_memory(
    tmp_path, monkeypatch
):
    source = tmp_path / "dump"
    source.write_bytes(b"input")
    target = tmp_path / "copy"

    def invoke(command, **kwargs):
        assert kwargs["stdin"].read() == b"input"
        kwargs["stdout"].write(b"output")
        return SimpleNamespace(returncode=0, stdout=None)

    monkeypatch.setattr(release.subprocess, "run", invoke)
    assert release.run(["docker"], stdin_path=source, stdout_path=target) == b""
    assert target.read_bytes() == b"output"


def test_core_effective_access_to_domain_database_is_rejected(state):
    root, current = state
    normal = database_runner([])

    def invoke(command, **kwargs):
        if b"datname IN (" in kwargs.get("input", b""):
            return b"1"
        return normal(command, **kwargs)

    with pytest.raises(RuntimeError, match="Core role"):
        release.provision(root, current, ["docker"], "db", invoke)


def test_provision_preserves_only_nondomain_prior_connections(state, monkeypatch):
    root, current = state
    snapshot = {
        **SNAPSHOT,
        "connections": [
            *SNAPSHOT["connections"],
            {
                "role": current["services"]["crm"]["role"],
                "database": current["services"]["crm"]["database"],
            },
        ],
    }
    normal = database_runner([])

    def invoke(command, **kwargs):
        if kwargs.get("input", b"").startswith(b"SELECT json_build_object"):
            return json.dumps(snapshot).encode()
        return normal(command, **kwargs)

    release.provision(root, current, ["docker"], "db", invoke)


def test_main_prepare_and_deploy_hooks_use_only_server_local_secret_state(
    tmp_path, monkeypatch
):
    checkout = tmp_path / "release"
    checkout.mkdir()
    root = tmp_path / "secrets"
    core = tmp_path / "core.env"
    core.write_text("\n".join(f"{key}={value}" for key, value in CORE.items()))
    monkeypatch.setattr(Path, "cwd", lambda: checkout)
    original = Path.read_text
    monkeypatch.setattr(
        Path,
        "read_text",
        lambda self, *args, **kwargs: (
            "MemAvailable: 3000000 kB\n"
            if self.as_posix() == "/proc/meminfo"
            else original(self, *args, **kwargs)
        ),
    )
    monkeypatch.setattr(release, "certificates", lambda *args: None)
    deployed = []
    monkeypatch.setattr(release, "deploy", lambda *args: deployed.append(args))
    args = [
        "--environment",
        "testing",
        "--project",
        "shop3i-test",
        "--env-file",
        str(core),
        "--runtime",
        str(root),
    ]
    release.main(["prepare", *args])
    assert (root / "state.json").exists() and not deployed
    release.main(["deploy", *args, "--release", SHA, "--sudo-docker"])
    assert deployed[0][4] == ["sudo", "-n", "docker"]
    with pytest.raises(ValueError, match="verified release"):
        release.main(["deploy", *args])
    with pytest.raises(ValueError, match="Invalid database container"):
        release.main(["prepare", *args, "--database-container", "bad;command"])
    with pytest.raises(ValueError, match="outside"):
        release.main(["prepare", *args, "--runtime", str(checkout / "secrets")])


def test_module_cli_help_is_import_safe(monkeypatch):
    import runpy
    import sys

    monkeypatch.setattr(sys, "argv", ["tools.service_release", "--help"])
    monkeypatch.delitem(sys.modules, "tools.service_release")
    with pytest.raises(SystemExit) as stopped:
        runpy.run_module("tools.service_release", run_name="__main__")
    assert stopped.value.code == 0


def test_image_identity_survives_sudo_through_compose_environment(state):
    root, current = state
    release.write_environments(
        root, current, {**CORE, "RELEASE_ID": SHA, "APP_IMAGE_PREFIX": "shop3i"}
    )
    values = release.read_environment(root / "compose.env")
    assert values["RELEASE_ID"] == SHA and values["APP_IMAGE_PREFIX"] == "shop3i"
    with pytest.raises(ValueError, match="image identity"):
        release.write_environments(root, current, {**CORE, "RELEASE_ID": "injected"})


def test_gateway_uses_private_key_owner_without_dac_bypass(state, monkeypatch):
    import os

    import yaml

    root, current = state
    monkeypatch.setattr(release.os, "getuid", lambda: 1000, raising=False)
    monkeypatch.setattr(release.os, "getgid", lambda: 1000, raising=False)
    release.write_environments(root, current, CORE)
    values = release.read_environment(root / "compose.env")
    assert values["SERVICE_RUNTIME_UID"] == values["SERVICE_RUNTIME_GID"] == "1000"
    original_stat = Path.stat

    def owned_stat(path, *args, **kwargs):
        result = original_stat(path, *args, **kwargs)
        if path.suffix == ".key":
            fields = list(result)
            fields[4] = fields[5] = 1000
            return os.stat_result(fields)
        return result

    monkeypatch.setattr(Path, "stat", owned_stat)
    modes = {}
    original_chmod = Path.chmod

    def record_mode(path, mode, **kwargs):
        modes[path.name] = mode
        return original_chmod(path, mode, **kwargs)

    monkeypatch.setattr(Path, "chmod", record_mode)
    release.certificates(root, certificate_runner([]))
    assert modes["services.key"] == modes["ca.key"] == 0o600
    assert (root / "certificates/services.key").stat().st_uid == int(
        values["SERVICE_RUNTIME_UID"]
    )
    gateway = yaml.safe_load(Path("compose.server.services.yaml").read_text())[
        "services"
    ]["service-gateway"]
    assert (
        gateway["user"]
        == "${SERVICE_RUNTIME_UID:?Prepare service runtime}:${SERVICE_RUNTIME_GID:?Prepare service runtime}"
    )
    assert gateway["cap_drop"] == ["ALL"] and "cap_add" not in gateway
    assert gateway["sysctls"]["net.ipv4.ip_unprivileged_port_start"] == "0"
    assert gateway["read_only"] is True and "ports" not in gateway
    assert all(
        "uid=${SERVICE_RUNTIME_UID},gid=${SERVICE_RUNTIME_GID},mode=0700" in mount
        for mount in gateway["tmpfs"]
    )
    # A persisted key owned by another identity is not made world-readable or bypassed.
    monkeypatch.setattr(release.os, "getuid", lambda: 2000)
    with pytest.raises(RuntimeError, match="different runtime identity"):
        release.certificates(root, certificate_runner([]))
    assert modes["services.key"] == 0o600
