"""Fail-closed npm audit review for precisely verified local security patches."""

import hashlib
import json
import re
import subprocess
from pathlib import Path

ADVISORY = re.compile(
    r"GHSA-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}",
    re.IGNORECASE,
)
SHA256 = re.compile(r"[a-f0-9]{64}")


def _object(value, label):
    if not isinstance(value, dict):
        raise TypeError(f"Invalid {label}")
    return value


def _relative(value):
    if not isinstance(value, str) or not value or "\\" in value:
        raise RuntimeError("Invalid patch path")
    path = Path(value)
    if path.is_absolute() or any(part in ("", ".", "..") for part in value.split("/")):
        raise RuntimeError("Patch path escapes package")
    return path


def _read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Cannot read {path.name}") from error


def _manifest(root):
    data = _object(
        _read_json(root / "security/dependency-patches.json"), "patch manifest"
    )
    if data.get("schemaVersion") != 1:
        raise RuntimeError("Unsupported patch manifest schema")
    patches = data.get("patches")
    if not isinstance(patches, list):
        raise TypeError("Invalid patch manifest")
    mapping = {}
    for patch in patches:
        patch = _object(patch, "patch")
        package, version = patch.get("package"), patch.get("version")
        advisories, files = patch.get("advisories"), patch.get("files")
        if (
            not isinstance(package, str)
            or not package
            or not isinstance(version, str)
            or not version
        ):
            raise RuntimeError("Invalid patch identity")
        if (
            not isinstance(advisories, list)
            or not advisories
            or not isinstance(files, list)
            or not files
        ):
            raise RuntimeError("Incomplete patch evidence")
        if any(
            not isinstance(a, str) or ADVISORY.fullmatch(a) is None for a in advisories
        ):
            raise RuntimeError("Invalid patch advisory")
        key = (package, version)
        if key in mapping:
            raise RuntimeError("Duplicate patch identity")
        seen = set()
        for item in files:
            item = _object(item, "patched file")
            relative = _relative(item.get("path"))
            parts = relative.parts
            try:
                node_index = len(parts) - 1 - parts[::-1].index("node_modules")
            except ValueError as error:
                raise RuntimeError("Patch file is outside a package") from error
            package_parts = tuple(package.split("/"))
            if (
                parts[node_index + 1 : node_index + 1 + len(package_parts)]
                != package_parts
            ):
                raise RuntimeError("Patch file targets a different package")
            if relative in seen:
                raise RuntimeError("Duplicate patched file")
            seen.add(relative)
            if any(
                not isinstance(item.get(field), str)
                or SHA256.fullmatch(item[field]) is None
                for field in ("originalSha256", "patchedSha256")
            ):
                raise RuntimeError("Invalid patch digest")
            replacements = item.get("replacements")
            if (
                not isinstance(replacements, list)
                or not replacements
                or any(
                    not isinstance(change, dict)
                    or not isinstance(change.get("before"), str)
                    or not change["before"]
                    or not isinstance(change.get("after"), str)
                    or change["before"] == change["after"]
                    for change in replacements
                )
            ):
                raise RuntimeError("Invalid patch replacements")
        mapping[key] = patch
    return mapping


def _installed_copies(root, lock, package, version):
    packages = _object(lock.get("packages"), "package lock")
    suffix = "/node_modules/" + package
    copies = []
    for location, entry in packages.items():
        if not isinstance(location, str) or not isinstance(entry, dict):
            raise TypeError("Invalid package lock")
        if (
            location == "node_modules/" + package or location.endswith(suffix)
        ) and entry.get("version") == version:
            copies.append(location)
    return copies


def _verify_copies(root, copies, patch):
    """Require identical declared file coverage and the installed identity for each copy."""
    expected = set()
    by_copy = {location: {} for location in copies}
    for item in patch["files"]:
        path = _relative(item["path"])
        matches = [
            location for location in copies if path.is_relative_to(_relative(location))
        ]
        if not matches:
            return False
        location = max(matches, key=len)
        relative = path.relative_to(_relative(location))
        expected.add(relative)
        by_copy[location][relative] = item
    for location, files in by_copy.items():
        if set(files) != expected:
            return False
        base = root / _relative(location)
        if not base.is_dir() or not base.resolve().is_relative_to(root.resolve()):
            return False
        try:
            installed = _read_json(base / "package.json")
        except RuntimeError:
            return False
        if not isinstance(installed, dict) or (
            installed.get("name"),
            installed.get("version"),
        ) != (patch["package"], patch["version"]):
            return False
        for relative, item in files.items():
            path = base / relative
            if not path.is_file() or not path.resolve().is_relative_to(base.resolve()):
                return False
            if hashlib.sha256(path.read_bytes()).hexdigest() != item["patchedSha256"]:
                return False
    return bool(copies)


def classify(root, audit, manifest, lock):
    """Return every npm finding and require a verified fix for each dependency leaf."""
    audit = _object(audit, "npm audit report")
    if audit.get("auditReportVersion") != 2:
        raise RuntimeError("Unsupported npm audit schema")
    vulnerabilities = _object(audit.get("vulnerabilities"), "npm vulnerabilities")
    findings = {}
    for name, value in vulnerabilities.items():
        value = _object(value, "npm vulnerability")
        if (
            value.get("name") != name
            or not isinstance(value.get("via"), list)
            or not value["via"]
        ):
            raise RuntimeError("Invalid npm vulnerability")
        nodes = value.get("nodes")
        if (
            not isinstance(nodes, list)
            or not nodes
            or any(not isinstance(n, str) for n in nodes)
        ):
            raise RuntimeError("Invalid npm vulnerability nodes")
        direct, dependencies = [], []
        for via in value["via"]:
            if isinstance(via, str):
                dependencies.append(via)
            else:
                via = _object(via, "npm advisory")
                url = via.get("url")
                match = ADVISORY.search(url) if isinstance(url, str) else None
                direct.append(match.group(0).upper() if match else None)
        findings[name] = {
            "severity": value.get("severity"),
            "nodes": nodes,
            "advisories": direct,
            "via": dependencies,
            "status": "unresolved",
        }
    pending = set(findings)
    while pending:
        changed = False
        for name in list(pending):
            finding = findings[name]
            dependencies = finding["via"]
            if any(dep not in findings for dep in dependencies):
                pending.remove(name)
                continue
            if any(dep in pending for dep in dependencies):
                continue
            if all(
                findings[dep]["status"] == "locally_patched" for dep in dependencies
            ) and _directly_patched(root, name, finding, manifest, lock):
                finding["status"] = "locally_patched"
            pending.remove(name)
            changed = True
        if not changed:
            break  # Dependency cycles remain unresolved.
    # npm can report mutually dependent meta-vulnerabilities. Resolve a cycle
    # only when all its obligations pass and it reaches verified advisory evidence.
    candidate = set(pending)
    while candidate:
        rejected = {
            name
            for name in candidate
            if not _directly_patched(root, name, findings[name], manifest, lock)
            or any(
                dep not in candidate
                and findings.get(dep, {}).get("status") != "locally_patched"
                for dep in findings[name]["via"]
            )
        }
        if not rejected:
            break
        candidate -= rejected

    def reaches_evidence(name, seen):
        if name in seen:
            return False
        finding = findings[name]
        if finding["advisories"]:
            return True
        return any(
            findings[dep]["status"] == "locally_patched"
            or (dep in candidate and reaches_evidence(dep, seen | {name}))
            for dep in finding["via"]
            if dep in findings
        )

    while candidate:
        retained = {name for name in candidate if reaches_evidence(name, set())}
        retained = {
            name
            for name in retained
            if all(
                dep in retained or findings[dep]["status"] == "locally_patched"
                for dep in findings[name]["via"]
            )
        }
        if retained == candidate:
            break
        candidate = retained
    for name in candidate:
        findings[name]["status"] = "locally_patched"
    return findings


def _directly_patched(root, name, finding, manifest, lock):
    advisories = finding["advisories"]
    if not advisories:
        return True  # Meta-vulnerability: every dependency was checked above.
    if any(advisory is None for advisory in advisories):
        return False
    for location in finding["nodes"]:
        if _relative(location).parts[-1] != name.split("/")[-1]:
            return False
        entry = lock["packages"].get(location)
        if not isinstance(entry, dict) or not isinstance(entry.get("version"), str):
            return False
        version = entry["version"]
        patch = manifest.get((name, version))
        if patch is None or not set(advisories).issubset(
            {advisory.upper() for advisory in patch["advisories"]}
        ):
            return False
        copies = _installed_copies(root, lock, name, version)
        if location not in copies or not _verify_copies(root, copies, patch):
            return False
    return True


def run(root: Path, npm: str) -> None:
    """Run a fresh audit, retain its raw findings, and execute security regressions."""
    directory = root / "test-results"
    directory.mkdir(parents=True, exist_ok=True)
    raw_path = directory / "dependency-security-audit.json"
    classification_path = directory / "dependency-security-classification.json"
    try:
        audit_process = subprocess.run(
            [
                npm,
                "audit",
                "--json",
                "--all",
                "--include=dev",
                "--include=optional",
                "--include=peer",
            ],
            cwd=root,
            capture_output=True,
            timeout=900,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RuntimeError("npm audit could not complete") from error
    raw_path.write_bytes(audit_process.stdout)
    if audit_process.returncode not in (0, 1):
        raise RuntimeError("npm audit failed")
    try:
        audit = json.loads(audit_process.stdout)
    except (UnicodeError, json.JSONDecodeError) as error:
        raise RuntimeError("npm audit returned invalid JSON") from error
    manifest = _manifest(root)
    lock = _object(_read_json(root / "package-lock.json"), "package lock")
    findings = classify(root, audit, manifest, lock)
    classification_path.write_text(
        json.dumps({"findings": findings}, indent=2), encoding="utf-8"
    )
    if any(value["status"] != "locally_patched" for value in findings.values()):
        raise RuntimeError("npm audit has unresolved dependencies")
    try:
        suite = subprocess.run(
            [
                "node",
                "--experimental-test-coverage",
                "--test-coverage-lines=100",
                "--test-coverage-branches=100",
                "--test-coverage-functions=100",
                "--test",
                "scripts/dependency-security.test.mjs",
            ],
            cwd=root,
            capture_output=True,
            timeout=900,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RuntimeError(
            "Dependency security regressions could not complete"
        ) from error
    (directory / "dependency-security-regressions.txt").write_bytes(
        suite.stdout + suite.stderr
    )
    if suite.returncode:
        raise RuntimeError("Dependency security regressions failed")
