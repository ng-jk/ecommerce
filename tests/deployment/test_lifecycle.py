"""One-launch release ordering and fail-closed evidence."""

import json

import pytest

from tools import manual_release
from tools.lifecycle import __main__ as lifecycle
from tools.lifecycle.config import load

SHA = "a" * 40
REAL_CONTEXT_GATE = lifecycle.context_gate


@pytest.fixture
def setup(tmp_path, monkeypatch):
    monkeypatch.setattr(lifecycle, "ROOT", tmp_path)
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs/engineering-spec.md").write_text("spec")
    (tmp_path / "frontend/fashion").mkdir(parents=True)
    release = tmp_path / "release.json"
    release.write_text("{}")
    config = tmp_path / "lifecycle.json"
    config.write_text(
        json.dumps(
            {
                "release_config": str(release),
                "profiles": {
                    "shared-general": {
                        "kind": "shared-general",
                        "environment": "production",
                        "native": [],
                    }
                },
            }
        )
    )
    events = []
    monkeypatch.setattr(lifecycle.manual_release, "configuration", lambda *args: {})
    monkeypatch.setattr(lifecycle, "prerequisite", lambda: SHA)
    monkeypatch.setattr(
        lifecycle, "context_gate", lambda: events.append("requirements_review")
    )
    monkeypatch.setattr(
        lifecycle.reviews,
        "architecture",
        lambda *args: events.append("architecture_review"),
    )
    monkeypatch.setattr(
        lifecycle.reviews, "quality", lambda *args: events.append("quality_review")
    )
    monkeypatch.setattr(
        lifecycle.reviews, "security", lambda *args: events.append("security_review")
    )
    monkeypatch.setattr(
        lifecycle.reviews,
        "compatibility",
        lambda *args: events.append("compatibility_review"),
    )
    monkeypatch.setattr(
        lifecycle, "command", lambda args, **kwargs: events.append(args[-1])
    )
    monkeypatch.setattr(
        lifecycle, "evidence", lambda commit, report: events.append("evidence")
    )
    monkeypatch.setattr(
        lifecycle, "source_manifest", lambda commit, report: events.append("artifact")
    )

    def deploy(path, env, commit, *, bundle_path, image_mode):
        events.append(env)
        if image_mode == "save":
            bundle_path.write_bytes(b"image bundle")
        return {
            "commit": commit,
            "images": {"backend": "sha256:" + "b" * 64},
            "bundle_sha256": lifecycle.digest(bundle_path),
        }

    monkeypatch.setattr(lifecycle.manual_release, "deploy_verified_revision", deploy)
    monkeypatch.setattr(
        lifecycle.manual_release, "promote", lambda commit: events.append("promotion")
    )
    return config, events


def test_one_launch_order_and_durable_report(setup):
    config, events = setup
    report = lifecycle.lifecycle(config, "shared-general", True)
    assert report.data["status"] == "passed"
    assert events == [
        "requirements_review",
        "architecture_review",
        "quality_review",
        "security_review",
        "compatibility_review",
        "review",
        "lint",
        "test",
        "prove",
        "build",
        "integration",
        "coverage",
        "evidence",
        "artifact",
        "testing",
        "production",
        "promotion",
    ]
    assert report.path.is_file() and report.text_path.is_file()
    assert json.loads(report.path.read_text())["commit"] == SHA


@pytest.mark.parametrize("stop", ["review", "testing", "production"])
def test_failure_stops_promotion_and_marks_later_stages_skipped(
    setup, monkeypatch, stop
):
    config, events = setup
    if stop == "review":
        monkeypatch.setattr(
            lifecycle,
            "command",
            lambda args, **kwargs: (
                (_ for _ in ()).throw(RuntimeError("exit 3"))
                if args[-1] == "review"
                else events.append(args[-1])
            ),
        )
    else:
        previous = lifecycle.manual_release.deploy_verified_revision
        monkeypatch.setattr(
            lifecycle.manual_release,
            "deploy_verified_revision",
            lambda path, env, commit, **kwargs: (
                (_ for _ in ()).throw(RuntimeError("readiness"))
                if env == stop
                else previous(path, env, commit, **kwargs)
            ),
        )
    report = lifecycle.lifecycle(config, "shared-general", True)
    assert report.data["status"] == "failed"
    assert "promotion" not in events
    assert any(
        s["name"] == stop and s["status"] == "failed" for s in report.data["stages"]
    )
    assert any(
        s["name"] == "promotion" and s["status"] == "skipped"
        for s in report.data["stages"]
    )


def test_missing_signing_credential_blocks_before_deploy(setup):
    config, events = setup
    data = json.loads(config.read_text())
    data["profiles"]["shared-general"]["native"] = [
        {
            "app": "fashion",
            "platform": "android",
            "eas_profile": "production",
            "credential_env": "MISSING_SIGNING_TOKEN",
        }
    ]
    config.write_text(json.dumps(data))
    report = lifecycle.lifecycle(config, "shared-general", True)
    assert report.data["status"] == "blocked"
    assert not events


def test_commit_tamper_and_branch_gate(monkeypatch, tmp_path):
    monkeypatch.setattr(lifecycle, "ROOT", tmp_path)
    monkeypatch.setattr(
        lifecycle, "git", lambda *args: "developement" if args[0] == "branch" else ""
    )
    with pytest.raises(lifecycle.Blocked, match="deployment branch"):
        lifecycle.prerequisite()
    monkeypatch.setattr(
        lifecycle,
        "git",
        lambda *args: (
            "deployment"
            if args[0] == "branch"
            else (" M source" if args[0] == "status" else SHA)
        ),
    )
    with pytest.raises(lifecycle.Blocked, match="clean"):
        lifecycle.prerequisite()


@pytest.mark.parametrize(
    "change",
    [
        {"kind": "unknown"},
        {"environment": "developement"},
        {
            "native": [
                {
                    "app": "../secret",
                    "platform": "android",
                    "eas_profile": "prod",
                    "credential_env": "TOKEN",
                }
            ]
        },
        {
            "native": [
                {
                    "app": "fashion",
                    "platform": "ios",
                    "eas_profile": "prod;sh",
                    "credential_env": "TOKEN",
                }
            ]
        },
    ],
)
def test_profile_refuses_injection_or_unknown_deployment_kind(setup, change):
    config, _ = setup
    data = json.loads(config.read_text())
    data["profiles"]["shared-general"].update(change)
    config.write_text(json.dumps(data))
    with pytest.raises(ValueError):
        load(config, "shared-general")


def test_native_publish_uses_only_typed_eas_arguments(setup, monkeypatch):
    _, events = setup
    monkeypatch.setenv("SIGNING_TOKEN", "hidden")
    lifecycle.native_publish(
        {
            "native": [
                {
                    "app": "fashion",
                    "platform": "android",
                    "eas_profile": "production",
                    "credential_env": "SIGNING_TOKEN",
                }
            ]
        }
    )
    assert events == ["--non-interactive", "--non-interactive"]


def test_production_image_tamper_blocks_main_promotion(setup, monkeypatch):
    config, events = setup
    previous = manual_release.deploy_verified_revision

    def deploy(path, env, commit, **kwargs):
        result = previous(path, env, commit, **kwargs)
        if env == "production":
            result["images"] = {"backend": "sha256:" + "c" * 64}
        return result

    monkeypatch.setattr(manual_release, "deploy_verified_revision", deploy)
    report = lifecycle.lifecycle(config, "shared-general", True)
    assert report.data["status"] == "failed"
    assert "promotion" not in events
    assert any(
        s["name"] == "production" and s["status"] == "failed"
        for s in report.data["stages"]
    )


def test_bundle_digest_tamper_blocks_main_promotion(setup, monkeypatch):
    config, events = setup
    previous = manual_release.deploy_verified_revision

    def deploy(path, env, commit, **kwargs):
        result = previous(path, env, commit, **kwargs)
        if env == "production":
            result["bundle_sha256"] = "0" * 64
        return result

    monkeypatch.setattr(manual_release, "deploy_verified_revision", deploy)
    report = lifecycle.lifecycle(config, "shared-general", True)
    assert report.data["status"] == "failed"
    assert "promotion" not in events


def test_remote_load_verifies_bundle_and_never_rebuilds():
    config = {
        "directory": "/srv/production",
        "project": "shop3i-production",
        "env_file": "/srv/secrets/production.env",
        "database": "commerce_production",
        "database_user": "commerce_production",
        "worker_readiness_url": "https://api.example.test/products",
        "readiness_urls": ["https://api.example.test/up"],
        "image_prefix": "shop3i",
    }
    script = manual_release.remote_script(
        config, SHA, image_mode="load", bundle_sha256="b" * 64
    )
    assert "sha256sum" in script and "docker load -i" in script
    assert "docker compose" in script and " compose --project-name " in script
    assert (
        " compose --project-name shop3i-production --env-file /srv/secrets/production.env -f compose.server.yaml build"
        not in script
    )
    assert (
        script.index("sha256sum")
        < script.index("docker load")
        < script.index("migrate --force")
    )
    with pytest.raises(ValueError):
        manual_release.remote_script(
            config, SHA, image_mode="load", bundle_sha256="bad"
        )


def test_remote_image_manifest_requires_exact_ids():
    config = {"image_prefix": "shop3i"}
    lines = [
        f"IMAGE_ID shop3i/{service}:{SHA} sha256:{'b' * 64}"
        for service in ("backend", "fashion", "electronics", "admin")
    ]
    found = manual_release._image_ids("\n".join(lines), SHA, config)
    assert len(found) == 4
    with pytest.raises(RuntimeError):
        manual_release._image_ids("\n".join(lines[:-1]), SHA, config)
    with pytest.raises(RuntimeError):
        manual_release._image_ids("\n".join(lines + [lines[0]]), SHA, config)


def test_testing_only_does_not_reach_production(setup):
    config, events = setup
    report = lifecycle.lifecycle(config, "shared-general", False)
    assert report.data["status"] == "passed"
    assert (
        "testing" in events and "production" not in events and "promotion" not in events
    )


def test_configured_native_publish_is_ordered_before_promotion(setup, monkeypatch):
    config, events = setup
    data = json.loads(config.read_text())
    data["profiles"]["shared-general"]["native"] = [
        {
            "app": "fashion",
            "platform": "android",
            "eas_profile": "release",
            "credential_env": "SIGNING_TEST",
        }
    ]
    config.write_text(json.dumps(data))
    monkeypatch.setenv("SIGNING_TEST", "hidden")
    monkeypatch.setattr(
        lifecycle, "native_publish", lambda profile: events.append("native")
    )
    report = lifecycle.lifecycle(config, "shared-general", True)
    assert report.data["status"] == "passed"
    assert (
        events.index("production") < events.index("native") < events.index("promotion")
    )


def test_nonproduction_profile_cannot_publish(setup):
    config, events = setup
    data = json.loads(config.read_text())
    data["profiles"]["shared-general"]["environment"] = "testing"
    config.write_text(json.dumps(data))
    report = lifecycle.lifecycle(config, "shared-general", True)
    assert report.data["status"] == "blocked" and not events


@pytest.mark.parametrize(
    "kind", ["shared-plugin", "dedicated-company", "dedicated-miniapp"]
)
def test_unwired_deployment_kind_blocks_before_any_gate(setup, kind):
    config, events = setup
    data = json.loads(config.read_text())
    data["profiles"]["shared-general"]["kind"] = kind
    config.write_text(json.dumps(data))
    report = lifecycle.lifecycle(config, "shared-general", True)
    assert report.data["status"] == "blocked"
    assert any(
        item["name"] == "preflight" and item["status"] == "blocked"
        for item in report.data["stages"]
    )
    assert not events


def test_invalid_context_index_persists_failed_full_report(setup, monkeypatch):
    config, events = setup
    monkeypatch.setattr(
        "tools.context_index.validate", lambda root: ["CTX001: invalid index"]
    )
    monkeypatch.setattr(lifecycle, "context_gate", REAL_CONTEXT_GATE)
    report = lifecycle.lifecycle(config, "shared-general", True)
    persisted = json.loads(report.path.read_text(encoding="utf-8"))
    assert persisted["status"] == "failed"
    assert any(
        s["name"] == "requirements_review" and s["status"] == "failed"
        for s in persisted["stages"]
    )
    assert any(
        s["name"] == "testing" and s["status"] == "skipped" for s in persisted["stages"]
    )
    assert not events


@pytest.mark.parametrize(
    "invalid",
    [None, {"commit": SHA, "images": {}}, {"commit": "b" * 40, "images": {"a": "b"}}],
)
def test_missing_remote_image_manifest_stops_release(setup, monkeypatch, invalid):
    config, events = setup
    monkeypatch.setattr(
        manual_release, "deploy_verified_revision", lambda *a, **k: invalid
    )
    report = lifecycle.lifecycle(config, "shared-general", True)
    assert report.data["status"] == "failed"
    assert "promotion" not in events
