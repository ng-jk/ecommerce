"""Focused error branches for durable lifecycle evidence."""

import json
import os
import runpy
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from tools.lifecycle import __main__ as lifecycle
from tools.lifecycle import reviews
from tools.lifecycle.config import load
from tools.lifecycle.report import Report

SHA = "a" * 40


def test_command_discards_subprocess_output(monkeypatch):
    monkeypatch.setattr(
        lifecycle.subprocess, "run", lambda *a, **k: SimpleNamespace(returncode=0)
    )
    lifecycle.command(["safe", "arg"])
    monkeypatch.setattr(
        lifecycle.subprocess, "run", lambda *a, **k: SimpleNamespace(returncode=2)
    )
    with pytest.raises(RuntimeError, match="exited 2"):
        lifecycle.command(["safe"])

    def timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired("safe", 1)

    monkeypatch.setattr(lifecycle.subprocess, "run", timeout)
    with pytest.raises(RuntimeError, match="timed out"):
        lifecycle.command(["safe"], timeout=1)


def test_git_uses_repo_scoped_trust_and_fails_closed(monkeypatch):
    seen = []

    def process(args, **kwargs):
        seen.append(args)
        return SimpleNamespace(returncode=0, stdout=b"  abc\n")

    monkeypatch.setattr(lifecycle.subprocess, "run", process)
    assert lifecycle.git("rev-parse", "HEAD") == "abc"
    assert "safe.directory=" in seen[0][2]
    monkeypatch.setattr(
        lifecycle.subprocess, "run", lambda *a, **k: SimpleNamespace(returncode=1)
    )
    with pytest.raises(RuntimeError, match="Git inspection"):
        lifecycle.git("status")


def test_prerequisite_invalid_commit(monkeypatch):
    monkeypatch.setattr(
        lifecycle,
        "git",
        lambda *a: (
            "deployment" if a[0] == "branch" else ("" if a[0] == "status" else "bad")
        ),
    )
    with pytest.raises(lifecycle.Blocked, match="Invalid Git commit"):
        lifecycle.prerequisite()
    monkeypatch.setattr(
        lifecycle,
        "git",
        lambda *a: (
            "deployment" if a[0] == "branch" else ("" if a[0] == "status" else SHA)
        ),
    )
    assert lifecycle.prerequisite() == SHA


def test_context_evidence_and_source_manifest(tmp_path, monkeypatch):
    monkeypatch.setattr(lifecycle, "ROOT", tmp_path)
    (tmp_path / "test-results").mkdir()
    report = Report(tmp_path, "run", SHA, "shared-general", "b" * 64)
    monkeypatch.setattr("tools.context_index.validate", lambda root: ["finding"])
    with pytest.raises(RuntimeError, match="1 finding"):
        lifecycle.context_gate()
    monkeypatch.setattr("tools.context_index.validate", lambda root: [])
    lifecycle.context_gate()
    monkeypatch.setattr(
        lifecycle, "git", lambda *a: "dirty" if a[0] == "status" else SHA
    )
    with pytest.raises(lifecycle.Blocked, match="changed"):
        lifecycle.evidence(SHA, report)
    monkeypatch.setattr(
        lifecycle, "git", lambda *a: "" if a[0] == "status" else "b" * 40
    )
    with pytest.raises(lifecycle.Blocked, match="changed"):
        lifecycle.evidence(SHA, report)
    monkeypatch.setattr(lifecycle, "git", lambda *a: "" if a[0] == "status" else SHA)
    lifecycle.evidence(SHA, report)
    assert "verified.json" in report.data["artifacts"]

    def archive(commit, target):
        Path(target).write_bytes(b"archive")

    monkeypatch.setattr(lifecycle.manual_release, "archive", archive)
    lifecycle.source_manifest(SHA, report)
    assert "manifest_sha256" in report.data["artifacts"]


def test_native_missing_target_and_signing(tmp_path, monkeypatch):
    monkeypatch.setattr(lifecycle, "ROOT", tmp_path)
    with pytest.raises(lifecycle.Blocked, match="not configured"):
        lifecycle.native_publish({})
    target = {
        "app": "fashion",
        "platform": "ios",
        "eas_profile": "release",
        "credential_env": "SIGNING_TEST",
    }
    monkeypatch.delenv("SIGNING_TEST", raising=False)
    with pytest.raises(lifecycle.Blocked, match="Missing"):
        lifecycle.native_publish({"native": [target]})
    monkeypatch.setenv("SIGNING_TEST", "hidden")
    with pytest.raises(lifecycle.Blocked, match="absent"):
        lifecycle.native_publish({"native": [target]})


@pytest.mark.parametrize(
    "mutation",
    [
        lambda d: d.pop("profiles"),
        lambda d: d.update({"release_config": "absent.json"}),
        lambda d: d["profiles"]["general"].update({"native": "bad"}),
        lambda d: d["profiles"]["general"].update({"native": [{}]}),
        lambda d: d["profiles"]["general"].update(
            {
                "native": [
                    {
                        "app": "fashion",
                        "platform": "ios",
                        "eas_profile": "release",
                        "credential_env": "bad",
                    }
                ]
            }
        ),
        lambda d: d["profiles"]["general"].update({"extra": "bad"}),
    ],
)
def test_config_invalid_structures(tmp_path, mutation):
    (tmp_path / "release.json").write_text("{}")
    data = {
        "release_config": "release.json",
        "profiles": {
            "general": {
                "kind": "shared-general",
                "environment": "production",
                "native": [],
            }
        },
    }
    mutation(data)
    path = tmp_path / "lifecycle.json"
    path.write_text(json.dumps(data))
    with pytest.raises((ValueError, TypeError)):
        load(path, "general")


def test_review_commands_and_refusals(tmp_path):
    calls = []
    command = lambda args, **kwargs: calls.append(args)
    reviews.architecture(command, "npm")
    reviews.quality(command, "npm")
    reviews.compatibility(command, lambda *a: "", "npm")
    assert any(args[:2] == ["npm", "run"] for args in calls)
    with pytest.raises(RuntimeError, match="Generated API"):
        reviews.compatibility(command, lambda *a: "generated/paths.ts", "npm")
    (tmp_path / "normal.txt").write_text("safe")
    reviews.security(tmp_path, lambda *a: "normal.txt", command, "npm")
    assert any(args[:2] == ["npm", "audit"] for args in calls)
    with pytest.raises(RuntimeError, match="secret-like"):
        reviews.security(tmp_path, lambda *a: ".env", command, "npm")
    (tmp_path / "normal.txt").write_text("-----BEGIN " + "PRIVATE KEY-----")
    with pytest.raises(RuntimeError, match="credential-like"):
        reviews.security(tmp_path, lambda *a: "normal.txt", command, "npm")


def test_report_rejects_unknown_status(tmp_path):
    report = Report(tmp_path, "run", SHA, "general", "b" * 64)
    with pytest.raises(ValueError):
        report.stage("unknown", "nonsense")
    with pytest.raises(ValueError):
        report.finish("nonsense")
    report.finish("passed")
    assert report.text_path.read_text().startswith("Run run: passed")


def test_lock_contention_is_blocked(tmp_path, monkeypatch):
    fake = SimpleNamespace(name="nt")
    monkeypatch.setattr(lifecycle, "os", fake)
    import msvcrt

    monkeypatch.setattr(
        msvcrt, "locking", lambda *a: (_ for _ in ()).throw(OSError("locked"))
    )
    with (
        pytest.raises(lifecycle.Blocked, match="release lock"),
        lifecycle.serial_lock(tmp_path),
    ):
        pass


def test_posix_lock_and_release_path(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(lifecycle, "os", SimpleNamespace(name="posix"))
    monkeypatch.setitem(
        sys.modules,
        "fcntl",
        SimpleNamespace(
            LOCK_EX=1, LOCK_NB=2, LOCK_UN=3, flock=lambda *a: calls.append(a[-1])
        ),
    )
    with lifecycle.serial_lock(tmp_path):
        assert calls == [3]
    assert calls == [3, 3]


def test_report_retries_transient_replace_failure(tmp_path, monkeypatch):
    from tools.lifecycle import report as report_module

    original = os.replace
    attempts = []

    def flaky(*args):
        attempts.append(1)
        if len(attempts) == 1:
            raise PermissionError("temporarily held")
        return original(*args)

    monkeypatch.setattr(report_module.os, "replace", flaky)
    monkeypatch.setattr(report_module.time, "sleep", lambda _: None)
    Report(tmp_path, "retry", SHA, "general", "b" * 64)
    assert len(attempts) == 2


def test_report_cleans_temporary_after_replace_exhaustion(tmp_path, monkeypatch):
    from tools.lifecycle import report as report_module

    monkeypatch.setattr(
        report_module.os,
        "replace",
        lambda *a: (_ for _ in ()).throw(PermissionError("held")),
    )
    monkeypatch.setattr(report_module.time, "sleep", lambda _: None)
    with pytest.raises(PermissionError):
        Report(tmp_path, "held", SHA, "general", "b" * 64)
    assert not list((tmp_path / "test-results/lifecycle").glob(".report-*"))


def test_cli_reports_success_and_failure(tmp_path, monkeypatch, capsys):
    report = SimpleNamespace(data={"status": "passed"}, path=tmp_path / "report.json")
    monkeypatch.setattr(lifecycle, "lifecycle", lambda *a: report)
    monkeypatch.setattr(
        sys,
        "argv",
        ["lifecycle", "--config", "config.json", "--profile", "general", "--publish"],
    )
    assert lifecycle.main() == 0
    assert "passed:" in capsys.readouterr().out
    report.data["status"] = "failed"
    assert lifecycle.main() == 1
    monkeypatch.setattr(sys, "argv", ["lifecycle", "--help"])
    with pytest.raises(SystemExit) as error:
        runpy.run_path(lifecycle.__file__, run_name="__main__")
    assert error.value.code == 0


def test_security_review_skips_binary_and_large_files(tmp_path):
    calls = []
    (tmp_path / "binary.bin").write_bytes(b"\xff")
    (tmp_path / "large.bin").write_bytes(b"x" * 2_000_001)
    reviews.security(
        tmp_path,
        lambda *a: "missing\nbinary.bin\nlarge.bin",
        lambda args, **k: calls.append(args),
        "npm",
    )
    assert len(calls) == 2
