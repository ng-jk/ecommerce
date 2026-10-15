"""Test secret preservation, certificate failure gates, and isolated migration ordering."""

from pathlib import Path

import pytest

from tools.pipeline import service_runtime as runtime


@pytest.fixture
def calls(monkeypatch):
    commands = []

    def execute(args, **kwargs):
        commands.append(args)
        if "-out" in args or "-keyout" in args:
            mount = args[args.index("--mount") + 1]
            directory = Path(mount.split("source=", 1)[1].split(",target=", 1)[0])
            for flag in ("-out", "-keyout"):
                if flag in args:
                    (directory / Path(args[args.index(flag) + 1]).name).write_text(
                        "fixture"
                    )
        return ""

    monkeypatch.setattr(runtime, "run", execute)
    return commands


def keys():
    return [
        f"{prefix}{service.upper()}{suffix}"
        for service in runtime.SERVICES
        for prefix, suffix in (
            ("PLATFORM_", "_SERVICE_KEY"),
            ("", "_BOOTSTRAP_PASSWORD"),
            ("", "_DATABASE_PASSWORD"),
            ("", "_APP_KEY"),
        )
    ]


def seed(directory, certificate_names):
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "runtime.env").write_text(
        "# preserved\n" + "".join(f"{key}=existing\n" for key in keys()),
        encoding="utf-8",
    )
    certs = directory / "certificates"
    certs.mkdir(exist_ok=True)
    for name in certificate_names:
        (certs / name).write_text("fixture", encoding="utf-8")


def test_first_boot_generates_separate_secrets_and_restricted_test_authority(
    tmp_path, calls
):
    environment = runtime.prepare(tmp_path)
    values = dict(line.split("=", 1) for line in environment.read_text().splitlines())
    assert set(values) == set(keys())
    assert len(set(values.values())) == len(values)
    assert values["CRM_APP_KEY"].startswith("base64:")
    assert sum("req" in cmd for cmd in calls) == 2
    assert all("--network" in cmd and "none" in cmd for cmd in calls)
    assert any("-checkend" in command for command in calls)
    assert any("verify" in command for command in calls)
    assert (
        "DNS:helpdesk-internal" in (tmp_path / "certificates/services.ext").read_text()
    )


def test_existing_material_is_preserved(tmp_path, calls, monkeypatch):
    seed(tmp_path, ["ca.key", "ca.crt", "services.key", "services.crt"])
    before = (tmp_path / "runtime.env").read_bytes()
    monkeypatch.setattr(runtime, "ROOT", tmp_path.parent)
    assert runtime.prepare(tmp_path).read_bytes() == before
    assert len(calls) == 4 + len(runtime.SERVICES)
    assert not any("req" in cmd for cmd in calls)


@pytest.mark.parametrize(
    "files,message",
    [
        (["ca.key"], "Incomplete test CA"),
        (["ca.key", "ca.crt", "services.key"], "Incomplete test service certificate"),
    ],
)
def test_partial_certificate_material_fails_closed(tmp_path, calls, files, message):
    seed(tmp_path, files)
    with pytest.raises(RuntimeError, match=message):
        runtime.prepare(tmp_path)


def test_partial_environment_is_not_rotated(tmp_path, calls):
    (tmp_path / "runtime.env").write_text(
        "CRM_DATABASE_PASSWORD=preserve\n", encoding="utf-8"
    )
    with pytest.raises(RuntimeError, match="preserve DB credentials"):
        runtime.prepare(tmp_path)
    assert not calls


def test_default_path_compose_and_migration_order(tmp_path, calls, monkeypatch):
    monkeypatch.setattr(runtime, "ROOT", tmp_path)
    seed(
        tmp_path / "test-results/service-runtime",
        ["ca.key", "ca.crt", "services.key", "services.crt"],
    )
    command = runtime.compose()
    assert "commerce-tests" in command and "compose.helpdesk-test.yaml" in command
    assert ".env" not in command
    (tmp_path / ".env").write_text("APP_KEY=configured\n")
    assert ".env" in runtime.compose()
    calls.clear()
    runtime.start(command)
    assert calls[0][-2 * len(runtime.SERVICES) :] == [
        *(f"{name}-db" for name in runtime.SERVICES),
        *runtime.SERVICES,
    ]
    assert [cmd[-2] for cmd in calls[1:]] == [
        path
        for name in runtime.SERVICES
        for path in (
            "--path=database/migrations/2026_10_13_015300_create_service_exchange_tables.php",
            f"--path=database/migrations/services/{name}",
        )
    ]


def test_expired_certificate_aborts_before_start(tmp_path, monkeypatch):
    seed(tmp_path, ["ca.key", "ca.crt", "services.key", "services.crt"])

    def fail(args, **kwargs):
        raise RuntimeError("expired authority")

    monkeypatch.setattr(runtime, "run", fail)
    with pytest.raises(RuntimeError, match="expired authority"):
        runtime.prepare(tmp_path)
