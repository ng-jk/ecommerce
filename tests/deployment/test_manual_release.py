"""Manual deployment ordering and refusal gates; no network or Docker execution."""

import io
import json
import tarfile

import pytest

from tools import manual_release as release

SHA = "a" * 40


@pytest.fixture
def setup(tmp_path, monkeypatch):
    monkeypatch.setattr(release, "ROOT", tmp_path)
    (tmp_path / "test-results").mkdir()
    (tmp_path / "test-results/verified.json").write_text(
        json.dumps({"commit": SHA, "gates": release.GATES})
    )
    key = tmp_path / "key"
    known = tmp_path / "known"
    key.write_text("test key")
    known.write_text("pinned host key fixture")
    config = {}
    for env in ["production", "testing"]:
        config[env] = {
            "host": "example.test",
            "user": "deploy",
            "port": 22,
            "directory": "/srv/" + env,
            "env_file": "/srv/secrets/" + env + ".env",
            "project": "shop3i-" + env,
            "database": "commerce_" + env,
            "database_user": "commerce_" + env,
            "identity_file": str(key),
            "known_hosts": str(known),
            "readiness_urls": ["https://" + env + ".example.test/up"],
            "worker_readiness_url": "https://"
            + env
            + ".example.test/api/v1/shops/fashion/products",
        }
    path = tmp_path / "config.json"
    path.write_text(json.dumps(config))
    calls = []

    def run(args, **kwargs):
        calls.append((args, kwargs))
        if args[:3] == ["git", "branch", "--show-current"]:
            return "deployment"
        if args[:2] == ["git", "rev-parse"]:
            return SHA
        if args[:4] == ["git", "remote", "get-url", "origin"]:
            return "git@github.com:ng-jk/ecommerce.git"
        if args[:2] == ["git", "archive"]:
            target = next(a.split("=", 1)[1] for a in args if a.startswith("--output="))
            with tarfile.open(target, "w") as archive:
                data = b"valid source"
                member = tarfile.TarInfo("README.md")
                member.size = len(data)
                archive.addfile(member, io.BytesIO(data))
        if args[0] == "ssh" and args[-1] == "sh -s":
            return SHA
        return ""

    return path, config, calls, run


def test_first_production_creates_main_only_after_remote_readiness(setup):
    path, _config, calls, run = setup
    assert release.deploy(path, "production", run) == SHA
    commands = [c[0] for c in calls]
    remote = next(
        i for i, a in enumerate(commands) if a[0] == "ssh" and a[-1] == "sh -s"
    )
    promotion = next(
        i for i, a in enumerate(commands) if a[:2] == ["git", "update-ref"]
    )
    push = next(a for a in commands if a[:2] == ["git", "push"])
    assert remote < promotion
    assert not any(a[:2] == ["git", "fetch"] for a in commands)
    assert push == ["git", "push", "origin", "refs/heads/main:refs/heads/main"]
    script = calls[remote][1]["input"]
    assert "config --quiet" in script and "migrate --force" in script
    assert (
        script.index("build")
        < script.index("migrate --force")
        < script.index("up -d")
        < script.index("curl")
    )
    assert "up -d --no-build --wait &&" in script
    assert "StrictHostKeyChecking=yes" in commands[remote]
    assert "RELEASE_ID=" + SHA in script


def test_testing_never_promotes_or_pushes(setup):
    path, _, calls, runner = setup

    def run(args, **kwargs):
        if args[:3] == ["git", "branch", "--show-current"]:
            return "testing"
        return runner(args, **kwargs)

    release.deploy(path, "testing", run)
    assert not any(a[:2] in [["git", "push"], ["git", "update-ref"]] for a, _ in calls)


@pytest.mark.parametrize("failure", ["dirty", "branch", "evidence", "remote"])
def test_refusals_never_promote(setup, failure):
    path, _, calls, runner = setup
    if failure == "evidence":
        (release.ROOT / "test-results/verified.json").write_text("{}")

    def run(args, **kwargs):
        if failure == "dirty" and args[:2] == ["git", "status"]:
            return " M source"
        if failure == "branch" and args[:2] == ["git", "branch"]:
            return "developement"
        if failure == "remote" and args[0] == "ssh" and args[-1] == "sh -s":
            raise RuntimeError("health failed")
        return runner(args, **kwargs)

    with pytest.raises((ValueError, RuntimeError)):
        release.deploy(path, "production", run)
    assert not any(a[:2] == ["git", "update-ref"] for a, _ in calls)


def test_wrong_acknowledgement_never_promotes(setup):
    path, _, calls, runner = setup

    def run(args, **kwargs):
        if args[0] == "ssh" and args[-1] == "sh -s":
            return "not ready"
        return runner(args, **kwargs)

    with pytest.raises(RuntimeError, match="acknowledge"):
        release.deploy(path, "production", run)
    assert not any(a[:2] == ["git", "push"] for a, _ in calls)


@pytest.mark.parametrize(
    "change",
    [
        {"directory": "/"},
        {"directory": "/srv/../root"},
        {"host": "x;touch /tmp/x"},
        {"port": 0},
        {"worker_readiness_url": "https://other.test/products"},
        {"database_container": "bad;command"},
        {"sudo_docker": "yes"},
        {"worker_readiness_url": "http://example.test/products"},
        {"profiles": ["unsafe"]},
        {"known_hosts": "missing"},
        {"readiness_urls": ["http://shop.test/up"]},
        {"readiness_urls": []},
        {"backward_compatible_migrations": "yes"},
    ],
)
def test_config_security_refusals(setup, change):
    path, config, _, _ = setup
    config["production"].update(change)
    path.write_text(json.dumps(config))
    with pytest.raises(ValueError):
        release.configuration(path, "production")


def test_testing_isolation_and_safe_rollback(setup):
    path, config, _, _ = setup
    config["testing"]["project"] = config["production"]["project"]
    path.write_text(json.dumps(config))
    with pytest.raises(ValueError, match="separate"):
        release.configuration(path, "testing")
    config["production"]["backward_compatible_migrations"] = True
    config["production"]["profiles"] = ["assistant"]
    config["production"]["sudo_docker"] = True
    script = release.remote_script(config["production"], SHA)
    assert 'cd "$previous"' in script
    assert "--profile assistant" in script
    assert "sudo -n docker" in script
    assert 'env RELEASE_ID="$RELEASE_ID" COMPOSE_PARALLEL_LIMIT=1 docker' in script
    assert script.index("pg_dump") < script.index("migrate --force")
    assert 'pg_restore --list < "$backup"' in script
    assert script.index("stop -t 40 worker") < script.index("migrate --force")
    assert "python3 tools/release_probe.py" in script
    assert "db:seed --class=ShopSeeder --force" in script
    assert '--write-out "%{http_code}"' in script
    assert "migrate:rollback" not in script and " down" not in script


def test_archive_excludes_tracked_secrets(tmp_path):
    target = tmp_path / "release.tar"

    def run(args):
        with tarfile.open(target, "w") as archive:
            archive.addfile(tarfile.TarInfo(".env"))

    with pytest.raises(ValueError, match="secret"):
        release.archive(SHA, target, run)


def test_failed_push_checks_remote_before_retry(setup):
    _, _, _calls, runner = setup
    attempts = []

    def run(args, **kwargs):
        if args[:2] == ["git", "push"]:
            attempts.append(args)
            raise RuntimeError("uncertain transport")
        if args[:2] == ["git", "ls-remote"]:
            return SHA + "\trefs/heads/main"
        return runner(args, **kwargs)

    release.promote(SHA, run)
    assert len(attempts) == 1


def test_authentication_retries_stop_at_three():
    attempts = []

    def run(args):
        attempts.append(args)
        raise RuntimeError("authentication")

    with pytest.raises(RuntimeError):
        release.git_authenticated(["git", "fetch", "origin", "main"], run)
    assert len(attempts) == 3


def test_command_failure_does_not_disclose_stderr(monkeypatch):
    from types import SimpleNamespace

    monkeypatch.setattr(
        release.subprocess,
        "run",
        lambda *a, **k: SimpleNamespace(returncode=1, stdout="", stderr="secret"),
    )
    with pytest.raises(RuntimeError, match="exit code 1") as error:
        release.run(["ssh", "host"])
    assert "secret" not in str(error.value)
    monkeypatch.setattr(
        release.subprocess,
        "run",
        lambda *a, **k: SimpleNamespace(returncode=0, stdout=" ready\n"),
    )
    assert release.run(["git", "status"]) == "ready"


def test_configuration_requires_both_environments_and_distinct_urls(setup):
    path, config, _, _ = setup
    path.write_text("{}")
    with pytest.raises(ValueError, match="isolated"):
        release.configuration(path, "production")
    config["testing"]["readiness_urls"] = config["production"]["readiness_urls"]
    config["testing"]["worker_readiness_url"] = config["production"][
        "worker_readiness_url"
    ]
    path.write_text(json.dumps(config))
    with pytest.raises(ValueError, match="share"):
        release.configuration(path, "production")


def test_invalid_environment_and_commit_are_refused(setup):
    _, _, _, runner = setup
    with pytest.raises(ValueError, match="explicitly"):
        release.verified_commit("main", runner)

    def run(args):
        return "not-a-commit" if args[:2] == ["git", "rev-parse"] else runner(args)

    with pytest.raises(ValueError, match="Git commit"):
        release.verified_commit("production", run)


def test_archive_refuses_escaping_paths(tmp_path):
    target = tmp_path / "release.tar"

    def run(args):
        with tarfile.open(target, "w") as archive:
            archive.addfile(tarfile.TarInfo("../outside"))

    with pytest.raises(ValueError, match="Unsafe"):
        release.archive(SHA, target, run)


def test_promotion_refuses_wrong_repository_and_nonfastforward(setup):
    _, _, calls, runner = setup

    def wrong(args):
        return (
            "git@github.com:other/repository.git"
            if args[:3] == ["git", "remote", "get-url"]
            else runner(args)
        )

    with pytest.raises(ValueError, match="origin"):
        release.promote(SHA, wrong)

    def diverged(args):
        if args[:2] == ["git", "merge-base"]:
            raise RuntimeError("not an ancestor")
        return runner(args)

    with pytest.raises(RuntimeError):
        release.promote(SHA, diverged)
    assert not any(a[:2] == ["git", "update-ref"] for a, _ in calls)


def test_push_three_failures_do_not_force_or_push_other_branches(setup):
    _, _, _, runner = setup
    pushes = []

    def run(args):
        if args[:2] == ["git", "push"]:
            pushes.append(args)
            raise RuntimeError("failed authentication")
        if args[:2] == ["git", "ls-remote"]:
            return "b" * 40 + "\trefs/heads/main"
        return runner(args)

    with pytest.raises(RuntimeError):
        release.promote(SHA, run)
    assert len(pushes) == 3
    assert all(
        a == ["git", "push", "origin", "refs/heads/main:refs/heads/main"]
        for a in pushes
    )


def test_authentication_retry_can_recover():
    attempts = []

    def run(args):
        attempts.append(args)
        if len(attempts) == 1:
            raise RuntimeError("failed authentication")
        return "success"

    assert (
        release.git_authenticated(["git", "fetch", "origin", "main"], run) == "success"
    )


def test_explicit_cli_dispatch_and_help(monkeypatch, capsys):
    import runpy

    monkeypatch.setattr(
        "sys.argv", ["manual_release.py", "testing", "--config", "config.json"]
    )
    monkeypatch.setattr(release, "deploy", lambda path, env: SHA)
    release.main()
    assert "testing ready" in capsys.readouterr().out
    monkeypatch.setattr("sys.argv", ["manual_release.py", "--help"])
    with pytest.raises(SystemExit) as error:
        runpy.run_path(release.__file__, run_name="__main__")
    assert error.value.code == 0


def test_shared_database_is_refused(setup):
    path, config, _, _ = setup
    config["testing"]["database"] = config["production"]["database"]
    path.write_text(json.dumps(config))
    with pytest.raises(ValueError, match="separate database"):
        release.configuration(path, "testing")
