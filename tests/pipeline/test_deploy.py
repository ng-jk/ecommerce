"""Assert release guards and exact deployment effects using a fake command port."""

import json

import pytest

from tools.pipeline import deploy
from tools.pipeline.__main__ import GATES


@pytest.fixture
def release(tmp_path, monkeypatch):
    (tmp_path / "test-results").mkdir()
    monkeypatch.setattr(deploy, "ROOT", tmp_path)
    calls = []

    def run(args, **kwargs):
        calls.append(args)
        if "rev-parse" in args:
            return "commit123\n"
        if "inspect" in args:
            return '["registry.example/app@sha256:123"]'
        return ""

    monkeypatch.setattr(deploy, "run", run)
    (tmp_path / "test-results/verified.json").write_text(
        json.dumps({"commit": "commit123", "gates": GATES})
    )
    for key, value in {
        "IMAGE_REGISTRY": "registry.example/commerce",
        "DEPLOY_HOST": "host.example",
        "DEPLOY_USER": "commerce",
        "DEPLOY_PATH": "/srv/commerce",
    }.items():
        monkeypatch.setenv(key, value)
    known = tmp_path / "known_hosts"
    known.write_text("test-only-host-key")
    monkeypatch.setenv("DEPLOY_KNOWN_HOSTS", str(known))
    return tmp_path, calls, run


def test_success_publishes_four_digest_pinned_images_and_strict_ssh(release):
    root, calls, _ = release
    deploy.deploy()
    assert len([args for args in calls if args[:2] == ["docker", "push"]]) == 4
    assert len([args for args in calls if args[0] == "scp"]) == 4
    assert all(
        "StrictHostKeyChecking=yes" in args
        for args in calls
        if args[0] in ("ssh", "scp")
    )
    report = json.loads((root / "test-results/release.json").read_text())
    assert report["commit"] == "commit123"
    assert set(report["images"]) == {"backend", "fashion", "electronics", "admin"}


@pytest.mark.parametrize(
    "condition", ["missing", "commit", "gates", "dirty", "root", "traversal", "hostkey"]
)
def test_release_preconditions_fail_before_publishing(release, monkeypatch, condition):
    root, calls, run = release
    evidence = root / "test-results/verified.json"
    if condition == "missing":
        evidence.unlink()
    elif condition in ("commit", "gates"):
        evidence.write_text(
            json.dumps(
                {
                    "commit": "other" if condition == "commit" else "commit123",
                    "gates": [],
                }
            )
        )
    elif condition == "dirty":
        monkeypatch.setattr(
            deploy,
            "run",
            lambda args, **kwargs: (
                " M code.py" if "status" in args else run(args, **kwargs)
            ),
        )
    elif condition in ("root", "traversal"):
        monkeypatch.setenv(
            "DEPLOY_PATH", "/" if condition == "root" else "/srv/../other"
        )
    else:
        monkeypatch.setenv("DEPLOY_KNOWN_HOSTS", str(root / "missing"))
    with pytest.raises(ValueError):
        deploy.deploy()
    assert not any(args[0] == "docker" for args in calls)
