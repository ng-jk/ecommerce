"""Audit every pinned inference dependency, including the known PyTorch CPU wheel."""

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

PIN = re.compile(r"([A-Za-z0-9][A-Za-z0-9._-]*)==([A-Za-z0-9][A-Za-z0-9.+_-]*)")
NORMALIZE = {
    ("torch", "2.9.1+cpu"): "2.9.1",
    ("torch", "2.13.0+cpu"): "2.13.0",
}


def _canonical(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def _pins(path):
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as error:
        raise RuntimeError("Cannot read inference requirements lock") from error
    pins = {}
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        match = PIN.fullmatch(stripped)
        if match is None:
            raise RuntimeError("Inference requirements must be exact pins")
        name, version = match.groups()
        key = _canonical(name)
        if key in pins:
            raise RuntimeError("Duplicate inference requirement")
        if "+" in version and (key, version) not in NORMALIZE:
            raise RuntimeError("Unmapped inference wheel version")
        pins[key] = version
    if not pins:
        raise RuntimeError("Empty inference requirements lock")
    return pins


def classify(report, pins):
    """Reject skipped, duplicate, malformed, and mismatched audit entries."""
    if not isinstance(report, dict) or not isinstance(report.get("dependencies"), list):
        raise TypeError("Invalid inference audit schema")
    found = {}
    for item in report["dependencies"]:
        if not isinstance(item, dict):
            raise TypeError("Invalid inference audit dependency")
        if "skip_reason" in item:
            raise RuntimeError("Inference audit skipped a locked dependency")
        name, version, vulns = item.get("name"), item.get("version"), item.get("vulns")
        if (
            not isinstance(name, str)
            or not isinstance(version, str)
            or not isinstance(vulns, list)
        ):
            raise TypeError("Invalid inference audit dependency")
        key = _canonical(name)
        if key in found or key not in pins:
            raise RuntimeError("Duplicate or unexpected inference audit dependency")
        expected = NORMALIZE.get((key, pins[key]), pins[key])
        if version != expected:
            raise RuntimeError("Inference audit queried a different version")
        if any(
            not isinstance(vuln, dict) or not isinstance(vuln.get("id"), str)
            for vuln in vulns
        ):
            raise RuntimeError("Invalid inference advisory")
        found[key] = {
            "locked_version": pins[key],
            "queried_version": expected,
            "advisories": [vuln["id"] for vuln in vulns],
        }
    if set(found) != set(pins):
        raise RuntimeError("Inference audit skipped a locked dependency")
    return found


def run(root: Path, python: str = sys.executable) -> None:
    """Run the resolver-free audit and retain raw and classified evidence."""
    lock = root / "backend/inference/requirements.lock.txt"
    pins = _pins(lock)
    directory = root / "test-results"
    directory.mkdir(parents=True, exist_ok=True)
    query = directory / "inference-audit-query.txt"
    query.write_text(
        "".join(
            f"{name}=={NORMALIZE.get((name, version), version)}\n"
            for name, version in pins.items()
        ),
        encoding="utf-8",
    )
    try:
        result = subprocess.run(
            [
                python,
                "-m",
                "pip_audit",
                "--no-deps",
                "--disable-pip",
                "--format",
                "json",
                "-r",
                str(query),
            ],
            cwd=root,
            capture_output=True,
            timeout=900,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RuntimeError("Inference dependency audit could not complete") from error
    (directory / "inference-audit-raw.json").write_bytes(result.stdout)
    (directory / "inference-audit-stderr.txt").write_bytes(result.stderr)
    if result.returncode not in (0, 1):
        raise RuntimeError("Inference dependency audit process failed")
    try:
        report = json.loads(result.stdout)
    except (UnicodeError, json.JSONDecodeError) as error:
        raise RuntimeError(
            "Inference dependency audit returned invalid JSON"
        ) from error
    found = classify(report, pins)
    (directory / "inference-audit-classification.json").write_text(
        json.dumps(
            {
                "lock_sha256": hashlib.sha256(lock.read_bytes()).hexdigest(),
                "dependencies": found,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    vulnerable = any(item["advisories"] for item in found.values())
    if vulnerable or result.returncode != 0:
        raise RuntimeError("Inference dependencies have unresolved advisories")
