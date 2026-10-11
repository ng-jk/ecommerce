"""Adversarial checks for local dependency patch release evidence."""

import hashlib
import json
import subprocess
from copy import deepcopy
from types import SimpleNamespace

import pytest

from tools.lifecycle import dependency_security as gate

GHSA = "GHSA-82fw-gwwq-j7x9"


def fixture(tmp_path):
    package = tmp_path / "node_modules/mocker"
    package.mkdir(parents=True)
    (package / "package.json").write_text(
        json.dumps({"name": "mocker", "version": "1.0.0"})
    )
    (package / "index.js").write_bytes(b"secure")
    patch = {
        "package": "mocker",
        "version": "1.0.0",
        "advisories": [GHSA],
        "files": [
            {
                "path": "node_modules/mocker/index.js",
                "originalSha256": hashlib.sha256(b"unsafe").hexdigest(),
                "patchedSha256": hashlib.sha256(b"secure").hexdigest(),
                "replacements": [{"before": "unsafe", "after": "secure"}],
            }
        ],
    }
    manifest = {("mocker", "1.0.0"): patch}
    lock = {"packages": {"node_modules/mocker": {"version": "1.0.0"}}}
    audit = {
        "auditReportVersion": 2,
        "vulnerabilities": {
            "mocker": {
                "name": "mocker",
                "severity": "high",
                "via": [{"url": "https://github.com/advisories/" + GHSA}],
                "nodes": ["node_modules/mocker"],
            },
            "parent": {
                "name": "parent",
                "severity": "high",
                "via": ["mocker"],
                "nodes": ["node_modules/parent"],
            },
        },
    }
    return manifest, lock, audit


def statuses(tmp_path, manifest, lock, audit):
    return gate.classify(tmp_path, audit, manifest, lock)


def test_verified_patch_closes_direct_and_meta_vulnerability(tmp_path):
    manifest, lock, audit = fixture(tmp_path)
    result = statuses(tmp_path, manifest, lock, audit)
    assert {item["status"] for item in result.values()} == {"locally_patched"}


@pytest.mark.parametrize(
    "change", ["tamper", "wrong_version", "missing_copy", "new_advisory"]
)
def test_patch_evidence_must_match_every_installed_copy(tmp_path, change):
    manifest, lock, audit = fixture(tmp_path)
    if change == "tamper":
        (tmp_path / "node_modules/mocker/index.js").write_bytes(b"changed")
    elif change == "wrong_version":
        lock["packages"]["node_modules/mocker"]["version"] = "2.0.0"
    elif change == "missing_copy":
        lock["packages"]["node_modules/other/node_modules/mocker"] = {
            "version": "1.0.0"
        }
    else:
        audit["vulnerabilities"]["mocker"]["via"].append(
            {"url": "https://github.com/advisories/GHSA-vcc3-ghjq-m6fr"}
        )
    result = statuses(tmp_path, manifest, lock, audit)
    assert result["mocker"]["status"] == "unresolved"
    assert result["parent"]["status"] == "unresolved"


def test_unknown_advisory_and_dependency_cycle_remain_unresolved(tmp_path):
    manifest, lock, audit = fixture(tmp_path)
    audit["vulnerabilities"]["mocker"]["via"] = [
        {"url": "https://example.test/advisory"}
    ]
    assert statuses(tmp_path, manifest, lock, audit)["mocker"]["status"] == "unresolved"
    audit["vulnerabilities"]["mocker"]["via"] = ["parent"]
    result = statuses(tmp_path, manifest, lock, audit)
    assert all(item["status"] == "unresolved" for item in result.values())


def test_meta_cycle_resolves_only_when_anchored_to_verified_leaf(tmp_path):
    manifest, lock, audit = fixture(tmp_path)
    audit["vulnerabilities"]["parent"]["via"] = ["child", "mocker"]
    audit["vulnerabilities"]["child"] = {
        "name": "child",
        "severity": "high",
        "via": ["parent"],
        "nodes": ["node_modules/child"],
    }
    result = statuses(tmp_path, manifest, lock, audit)
    assert {result[name]["status"] for name in ("parent", "child")} == {
        "locally_patched"
    }
    audit["vulnerabilities"]["child"]["via"].append("unknown")
    result = statuses(tmp_path, manifest, lock, audit)
    assert {result[name]["status"] for name in ("parent", "child")} == {"unresolved"}


def test_cycle_with_direct_advisory_requires_its_patch(tmp_path):
    manifest, lock, audit = fixture(tmp_path)
    audit["vulnerabilities"]["mocker"]["via"].append("parent")
    result = statuses(tmp_path, manifest, lock, audit)
    assert all(item["status"] == "locally_patched" for item in result.values())
    (tmp_path / "node_modules/mocker/index.js").write_bytes(b"tampered")
    result = statuses(tmp_path, manifest, lock, audit)
    assert all(item["status"] == "unresolved" for item in result.values())


def test_cycle_with_unanchored_member_cannot_borrow_other_leaf(tmp_path):
    manifest, lock, audit = fixture(tmp_path)
    audit["vulnerabilities"]["parent"]["via"] = ["orphan", "mocker"]
    audit["vulnerabilities"]["orphan"] = {
        "name": "orphan",
        "severity": "high",
        "via": ["orphan"],
        "nodes": ["node_modules/orphan"],
    }
    result = statuses(tmp_path, manifest, lock, audit)
    assert result["mocker"]["status"] == "locally_patched"
    assert result["parent"]["status"] == "unresolved"
    assert result["orphan"]["status"] == "unresolved"


@pytest.mark.parametrize(
    "bad",
    [
        None,
        {},
        {"auditReportVersion": 3, "vulnerabilities": {}},
        {"auditReportVersion": 2, "vulnerabilities": {"x": {}}},
    ],
)
def test_malformed_audit_rejected(tmp_path, bad):
    manifest, lock, _ = fixture(tmp_path)
    with pytest.raises((RuntimeError, ValueError, TypeError)):
        statuses(tmp_path, manifest, lock, bad)


@pytest.mark.parametrize(
    "bad_path",
    [
        "../index.js",
        "/tmp/index.js",
        "bad\\path",
        "x/./index.js",
        "foo/index.js",
        "node_modules/other/index.js",
    ],
)
def test_manifest_path_escape_rejected(tmp_path, bad_path):
    manifest, _, _ = fixture(tmp_path)
    patch = manifest[("mocker", "1.0.0")]
    patch["files"][0]["path"] = bad_path
    directory = tmp_path / "security"
    directory.mkdir()
    (directory / "dependency-patches.json").write_text(
        json.dumps({"schemaVersion": 1, "patches": [patch]})
    )
    with pytest.raises(RuntimeError):
        gate._manifest(tmp_path)


def test_process_failure_and_regression_failure_are_gates(tmp_path, monkeypatch):
    manifest, lock, audit = fixture(tmp_path)
    (tmp_path / "security").mkdir()
    (tmp_path / "security/dependency-patches.json").write_text(
        json.dumps({"schemaVersion": 1, "patches": list(manifest.values())})
    )
    (tmp_path / "package-lock.json").write_text(json.dumps(lock))
    payload = json.dumps(audit).encode()
    monkeypatch.setattr(
        gate.subprocess,
        "run",
        lambda *a, **k: SimpleNamespace(returncode=2, stdout=payload, stderr=b""),
    )
    with pytest.raises(RuntimeError, match="npm audit failed"):
        gate.run(tmp_path, "npm")
    assert (
        tmp_path / "test-results/dependency-security-audit.json"
    ).read_bytes() == payload
    calls = []

    def process(argv, **kwargs):
        calls.append(argv)
        return SimpleNamespace(
            returncode=1, stdout=payload if len(calls) == 1 else b"failed", stderr=b""
        )

    monkeypatch.setattr(gate.subprocess, "run", process)
    with pytest.raises(RuntimeError, match="regressions failed"):
        gate.run(tmp_path, "npm")
    assert calls[1] == [
        "node",
        "--experimental-test-coverage",
        "--test-coverage-lines=100",
        "--test-coverage-branches=100",
        "--test-coverage-functions=100",
        "--test",
        "scripts/dependency-security.test.mjs",
    ]
    assert (
        tmp_path / "test-results/dependency-security-regressions.txt"
    ).read_bytes() == b"failed"


def test_timeout_and_network_error_are_gates(tmp_path, monkeypatch):
    def failure(*args, **kwargs):
        raise subprocess.TimeoutExpired("npm", 1)

    monkeypatch.setattr(gate.subprocess, "run", failure)
    with pytest.raises(RuntimeError, match="could not complete"):
        gate.run(tmp_path, "npm")


@pytest.mark.parametrize(
    "mutate",
    [
        lambda p: p.update(package=""),
        lambda p: p.update(version=0),
        lambda p: p.update(advisories=[]),
        lambda p: p.update(files=[]),
        lambda p: p.update(advisories=["unknown"]),
        lambda p: p["files"].append(deepcopy(p["files"][0])),
        lambda p: p["files"][0].update(originalSha256="bad"),
        lambda p: p["files"][0].update(replacements=[]),
        lambda p: p["files"][0].update(
            replacements=[{"before": "same", "after": "same"}]
        ),
    ],
)
def test_manifest_rejects_incomplete_patch_claims(tmp_path, mutate):
    manifest, _, _ = fixture(tmp_path)
    patch = deepcopy(manifest[("mocker", "1.0.0")])
    mutate(patch)
    (tmp_path / "security").mkdir()
    (tmp_path / "security/dependency-patches.json").write_text(
        json.dumps({"schemaVersion": 1, "patches": [patch]})
    )
    with pytest.raises((RuntimeError, TypeError)):
        gate._manifest(tmp_path)


def test_manifest_rejects_duplicate_and_missing_manifest(tmp_path):
    with pytest.raises(RuntimeError, match="Cannot read"):
        gate._manifest(tmp_path)
    patch = fixture(tmp_path)[0][("mocker", "1.0.0")]
    (tmp_path / "security").mkdir()
    path = tmp_path / "security/dependency-patches.json"
    path.write_text(json.dumps({"schemaVersion": 1, "patches": [patch, patch]}))
    with pytest.raises(RuntimeError, match="Duplicate patch"):
        gate._manifest(tmp_path)
    path.write_text(json.dumps({"schemaVersion": 1, "patches": None}))
    with pytest.raises(TypeError):
        gate._manifest(tmp_path)
    path.write_text(json.dumps({"schemaVersion": 99, "patches": [patch]}))
    with pytest.raises(RuntimeError, match="schema"):
        gate._manifest(tmp_path)


def test_untracked_dependency_and_bad_audit_node_block(tmp_path):
    manifest, lock, audit = fixture(tmp_path)
    audit["vulnerabilities"]["parent"]["via"] = ["unknown-package"]
    assert statuses(tmp_path, manifest, lock, audit)["parent"]["status"] == "unresolved"
    audit["vulnerabilities"]["mocker"]["nodes"] = []
    with pytest.raises(RuntimeError, match="nodes"):
        statuses(tmp_path, manifest, lock, audit)
    audit["vulnerabilities"]["mocker"]["nodes"] = ["node_modules/other"]
    assert statuses(tmp_path, manifest, lock, audit)["mocker"]["status"] == "unresolved"


def test_missing_file_bad_lock_and_unexpected_location_block(tmp_path):
    manifest, lock, audit = fixture(tmp_path)
    (tmp_path / "node_modules/mocker/index.js").unlink()
    assert statuses(tmp_path, manifest, lock, audit)["mocker"]["status"] == "unresolved"
    (tmp_path / "node_modules/mocker/index.js").write_bytes(b"secure")
    lock["packages"]["node_modules/mocker"] = {}
    assert statuses(tmp_path, manifest, lock, audit)["mocker"]["status"] == "unresolved"
    lock["packages"]["node_modules/mocker"] = {"version": "1.0.0"}
    lock["packages"]["node_modules/other"] = None
    with pytest.raises(TypeError, match="package lock"):
        statuses(tmp_path, manifest, lock, audit)


@pytest.mark.parametrize(
    "change", ["missing_dir", "missing_package_json", "wrong_identity"]
)
def test_installed_package_identity_is_required(tmp_path, change):
    manifest, lock, audit = fixture(tmp_path)
    package = tmp_path / "node_modules/mocker"
    if change == "missing_dir":
        (package / "index.js").unlink()
        (package / "package.json").unlink()
        package.rmdir()
    elif change == "missing_package_json":
        (package / "package.json").unlink()
    else:
        (package / "package.json").write_text(
            json.dumps({"name": "other", "version": "1.0.0"})
        )
    assert statuses(tmp_path, manifest, lock, audit)["mocker"]["status"] == "unresolved"


def test_every_installed_copy_needs_every_declared_patch_file(tmp_path):
    manifest, lock, audit = fixture(tmp_path)
    second = tmp_path / "node_modules/parent/node_modules/mocker"
    second.mkdir(parents=True)
    (second / "package.json").write_text(
        json.dumps({"name": "mocker", "version": "1.0.0"})
    )
    (second / "index.js").write_bytes(b"secure")
    location = "node_modules/parent/node_modules/mocker"
    lock["packages"][location] = {"version": "1.0.0"}
    audit["vulnerabilities"]["mocker"]["nodes"].append(location)
    assert statuses(tmp_path, manifest, lock, audit)["mocker"]["status"] == "unresolved"
    copied = deepcopy(manifest[("mocker", "1.0.0")]["files"][0])
    copied["path"] = location + "/index.js"
    manifest[("mocker", "1.0.0")]["files"].append(copied)
    assert (
        statuses(tmp_path, manifest, lock, audit)["mocker"]["status"]
        == "locally_patched"
    )


def test_unrelated_lock_entry_and_patch_file_do_not_change_verdict(tmp_path):
    manifest, lock, audit = fixture(tmp_path)
    lock["packages"]["node_modules/unrelated"] = {"version": "1.0.0"}
    assert (
        statuses(tmp_path, manifest, lock, audit)["mocker"]["status"]
        == "locally_patched"
    )
    manifest[("mocker", "1.0.0")]["files"].append(
        {
            "path": "node_modules/parent/node_modules/mocker/other.js",
            "originalSha256": "a" * 64,
            "patchedSha256": "b" * 64,
            "replacements": [{"before": "old", "after": "new"}],
        }
    )
    assert statuses(tmp_path, manifest, lock, audit)["mocker"]["status"] == "unresolved"


def test_run_refuses_unresolved_advisory(tmp_path, monkeypatch):
    manifest, lock, audit = fixture(tmp_path)
    audit["vulnerabilities"]["mocker"]["via"].append(
        {"url": "https://github.com/advisories/GHSA-vcc3-ghjq-m6fr"}
    )
    (tmp_path / "security").mkdir()
    (tmp_path / "security/dependency-patches.json").write_text(
        json.dumps({"schemaVersion": 1, "patches": list(manifest.values())})
    )
    (tmp_path / "package-lock.json").write_text(json.dumps(lock))
    monkeypatch.setattr(
        gate.subprocess,
        "run",
        lambda *a, **k: SimpleNamespace(
            returncode=1, stdout=json.dumps(audit).encode(), stderr=b""
        ),
    )
    with pytest.raises(RuntimeError, match="unresolved"):
        gate.run(tmp_path, "npm")


def test_clean_audit_and_successful_regressions(tmp_path, monkeypatch):
    manifest, lock, audit = fixture(tmp_path)
    (tmp_path / "security").mkdir()
    (tmp_path / "security/dependency-patches.json").write_text(
        json.dumps({"schemaVersion": 1, "patches": list(manifest.values())})
    )
    (tmp_path / "package-lock.json").write_text(json.dumps(lock))
    payload = json.dumps(audit).encode()
    calls = []

    def process(argv, **kwargs):
        calls.append(argv)
        return SimpleNamespace(
            returncode=1 if len(calls) == 1 else 0,
            stdout=payload if len(calls) == 1 else b"passed",
            stderr=b"",
        )

    monkeypatch.setattr(gate.subprocess, "run", process)
    gate.run(tmp_path, "npm")
    assert (
        json.loads(
            (
                tmp_path / "test-results/dependency-security-classification.json"
            ).read_text()
        )["findings"]["mocker"]["status"]
        == "locally_patched"
    )
    assert calls[1] == [
        "node",
        "--experimental-test-coverage",
        "--test-coverage-lines=100",
        "--test-coverage-branches=100",
        "--test-coverage-functions=100",
        "--test",
        "scripts/dependency-security.test.mjs",
    ]


def test_invalid_audit_json_and_regression_timeout(tmp_path, monkeypatch):
    manifest, lock, audit = fixture(tmp_path)
    (tmp_path / "security").mkdir()
    (tmp_path / "security/dependency-patches.json").write_text(
        json.dumps({"schemaVersion": 1, "patches": list(manifest.values())})
    )
    (tmp_path / "package-lock.json").write_text(json.dumps(lock))
    monkeypatch.setattr(
        gate.subprocess,
        "run",
        lambda *a, **k: SimpleNamespace(returncode=0, stdout=b"not-json", stderr=b""),
    )
    with pytest.raises(RuntimeError, match="invalid JSON"):
        gate.run(tmp_path, "npm")
    calls = []

    def process(argv, **kwargs):
        calls.append(argv)
        if len(calls) == 2:
            raise subprocess.TimeoutExpired("npm", 1)
        return SimpleNamespace(
            returncode=1, stdout=json.dumps(audit).encode(), stderr=b""
        )

    monkeypatch.setattr(gate.subprocess, "run", process)
    with pytest.raises(RuntimeError, match="regressions could not complete"):
        gate.run(tmp_path, "npm")
