"""Fail-closed inference dependency audit contract tests."""

import json
import subprocess
from types import SimpleNamespace

import pytest

from tools.lifecycle import python_dependency_security as gate


def fixture(tmp_path):
    path = tmp_path / "backend/inference/requirements.lock.txt"
    path.parent.mkdir(parents=True)
    path.write_text("# locked source\nTorch==2.9.1+cpu\nrequests==2.34.2\n")
    report = {
        "dependencies": [
            {"name": "torch", "version": "2.9.1", "vulns": []},
            {"name": "requests", "version": "2.34.2", "vulns": []},
        ],
        "fixes": [],
    }
    return path, report


def test_exact_cpu_wheel_is_queried_as_base_and_source_is_preserved(
    tmp_path, monkeypatch
):
    path, report = fixture(tmp_path)
    original = path.read_bytes()
    calls = []

    def process(argv, **kwargs):
        calls.append(argv)
        return SimpleNamespace(
            returncode=0, stdout=json.dumps(report).encode(), stderr=b""
        )

    monkeypatch.setattr(gate.subprocess, "run", process)
    gate.run(tmp_path, "python")
    assert calls[0][:7] == [
        "python",
        "-m",
        "pip_audit",
        "--no-deps",
        "--disable-pip",
        "--format",
        "json",
    ]
    assert (
        tmp_path / "test-results/inference-audit-query.txt"
    ).read_text() == "torch==2.9.1\nrequests==2.34.2\n"
    assert path.read_bytes() == original
    classified = json.loads(
        (tmp_path / "test-results/inference-audit-classification.json").read_text()
    )
    assert classified["dependencies"]["torch"]["locked_version"] == "2.9.1+cpu"
    assert classified["dependencies"]["torch"]["queried_version"] == "2.9.1"


def test_fixed_cpu_wheel_has_explicit_base_mapping(tmp_path):
    path, _ = fixture(tmp_path)
    path.write_text("torch==2.13.0+cpu\n")
    assert gate._pins(path) == {"torch": "2.13.0+cpu"}
    assert gate.NORMALIZE[("torch", "2.13.0+cpu")] == "2.13.0"


@pytest.mark.parametrize(
    "contents",
    [
        "",
        "\n# only comment\n",
        "torch>=2.9.1",
        "-i https://index.test",
        "torch==2.9.1+cu128",
        "torch==2.9.1+cpu\nTorch==2.9.1+cpu",
        "torch==2.9.1 # inline comment",
    ],
)
def test_unexamined_or_ambiguous_lock_fails(tmp_path, contents):
    path, _ = fixture(tmp_path)
    path.write_text(contents)
    with pytest.raises(RuntimeError):
        gate._pins(path)


def test_missing_lock_fails(tmp_path):
    with pytest.raises(RuntimeError, match="Cannot read"):
        gate._pins(tmp_path / "missing")


@pytest.mark.parametrize(
    "mutation",
    [
        lambda data: data["dependencies"].pop(),
        lambda data: data["dependencies"].append(
            {"name": "other", "version": "1", "vulns": []}
        ),
        lambda data: data["dependencies"].append(data["dependencies"][0].copy()),
        lambda data: data["dependencies"][0].update(version="2.9.1+cpu"),
        lambda data: data["dependencies"][0].update(vulns=None),
        lambda data: data["dependencies"][0].update(skip_reason="unsupported version"),
        lambda data: data["dependencies"][0].update(vulns=[{}]),
        lambda data: data["dependencies"].__setitem__(0, None),
    ],
)
def test_skipped_extra_duplicate_wrong_version_and_malformed_entry_fail(
    tmp_path, mutation
):
    path, report = fixture(tmp_path)
    mutation(report)
    with pytest.raises((RuntimeError, TypeError)):
        gate.classify(report, gate._pins(path))


@pytest.mark.parametrize(
    "report", [None, {}, {"dependencies": {}}, {"dependencies": []}]
)
def test_audit_schema_or_empty_result_fails(tmp_path, report):
    path, _ = fixture(tmp_path)
    with pytest.raises((RuntimeError, TypeError)):
        gate.classify(report, gate._pins(path))


def test_vulnerable_base_version_is_reported_and_blocks(tmp_path, monkeypatch):
    path, report = fixture(tmp_path)
    report["dependencies"][0]["vulns"] = [{"id": "GHSA-example"}]
    payload = json.dumps(report).encode()
    monkeypatch.setattr(
        gate.subprocess,
        "run",
        lambda *a, **k: SimpleNamespace(
            returncode=1, stdout=payload, stderr=b"1 known vulnerability"
        ),
    )
    with pytest.raises(RuntimeError, match="unresolved advisories"):
        gate.run(tmp_path, "python")
    assert (tmp_path / "test-results/inference-audit-raw.json").read_bytes() == payload
    assert path.read_text().splitlines()[1] == "Torch==2.9.1+cpu"
    classified = json.loads(
        (tmp_path / "test-results/inference-audit-classification.json").read_text()
    )
    assert classified["dependencies"]["torch"]["advisories"] == ["GHSA-example"]


@pytest.mark.parametrize(
    "code,payload,error",
    [
        (2, b"{}", "process failed"),
        (0, b"garbage", "invalid JSON"),
        (1, b'{"dependencies":[]}', "skipped"),
    ],
)
def test_process_and_report_failures_block(tmp_path, monkeypatch, code, payload, error):
    fixture(tmp_path)
    monkeypatch.setattr(
        gate.subprocess,
        "run",
        lambda *a, **k: SimpleNamespace(
            returncode=code, stdout=payload, stderr=b"failure"
        ),
    )
    with pytest.raises(RuntimeError, match=error):
        gate.run(tmp_path, "python")
    assert (
        tmp_path / "test-results/inference-audit-stderr.txt"
    ).read_bytes() == b"failure"


def test_audit_timeout_and_inconsistent_status_block(tmp_path, monkeypatch):
    _, report = fixture(tmp_path)
    monkeypatch.setattr(
        gate.subprocess,
        "run",
        lambda *a, **k: (_ for _ in ()).throw(
            subprocess.TimeoutExpired("pip_audit", 1)
        ),
    )
    with pytest.raises(RuntimeError, match="could not complete"):
        gate.run(tmp_path, "python")
    monkeypatch.setattr(
        gate.subprocess,
        "run",
        lambda *a, **k: SimpleNamespace(
            returncode=1, stdout=json.dumps(report).encode(), stderr=b""
        ),
    )
    with pytest.raises(RuntimeError, match="unresolved advisories"):
        gate.run(tmp_path, "python")
