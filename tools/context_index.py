"""Validate the authoritative Shop3i requirements and document index."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATUSES = {"planned", "partial", "implemented", "blocked", "historical"}
COLLECTIONS = ("documents", "requirements", "reviews", "test_standards")


def local_path(root: Path, value: object) -> Path | None:
    if not isinstance(value, str) or not value or "\\" in value:
        return None
    path = Path(value)
    if path.is_absolute() or ":" in value or ".." in path.parts:
        return None
    try:
        resolved = (root / path).resolve()
        return resolved if resolved.is_relative_to(root.resolve()) else None
    except (OSError, ValueError, RuntimeError):
        return None


def headings(path: Path) -> set[str]:
    return {
        re.sub(r"[^\w\- ]", "", line.lstrip("#").strip().lower()).replace(" ", "-")
        for line in path.read_text(encoding="utf-8-sig").splitlines()
        if line.startswith("#")
    }


def valid_id(item: object) -> bool:
    return (
        isinstance(item, dict)
        and isinstance(item.get("id"), str)
        and bool(item["id"].strip())
    )


def validate(root: Path = ROOT) -> list[str]:
    """Return actionable findings; never silently skip malformed index entries."""
    findings: list[str] = []
    try:
        registry = json.loads((root / "docs/registry.json").read_text(encoding="utf-8"))
    except (OSError, ValueError, UnicodeError):
        return ["CTX001: docs/registry.json is missing or invalid JSON"]
    if not isinstance(registry, dict) or registry.get("schema_version") != 1:
        return ["CTX001: unsupported registry schema"]
    if any(not isinstance(registry.get(key), list) for key in COLLECTIONS):
        return ["CTX001: index collections must be arrays"]
    if (
        not isinstance(registry.get("amendment"), str)
        or not registry["amendment"].strip()
    ):
        findings.append("CTX001: amendment identifier required")
    lookup: dict[str, dict] = {}
    for category in COLLECTIONS:
        for item in registry[category]:
            if not valid_id(item):
                findings.append(f"CTX002: invalid {category} entry")
                continue
            if item["id"] in lookup:
                findings.append(f"CTX002: duplicate ID {item['id']}")
            lookup[item["id"]] = item
    documents = {item["id"]: item for item in registry["documents"] if valid_id(item)}
    indexed: set[str] = set()
    for ident, item in documents.items():
        path = local_path(root, item.get("path"))
        if path is None or not path.is_file():
            findings.append(f"CTX003: {ident} has missing/unsafe document path")
            continue
        relative = path.relative_to(root.resolve()).as_posix()
        if relative in indexed:
            findings.append(f"CTX003: duplicate document path {relative}")
        indexed.add(relative)
        if item.get("status") not in ("active", "historical"):
            findings.append(f"CTX003: {ident} has invalid document status")
        supersedes = item.get("supersedes", [])
        if not isinstance(supersedes, list) or any(
            not isinstance(value, str) or value not in documents or value == ident
            for value in supersedes
        ):
            findings.append(f"CTX004: {ident} has invalid supersedes references")
    try:
        doc_files = list((root / "docs").rglob("*"))
    except OSError:
        findings.append("CTX005: unable to inventory docs")
        doc_files = []
    for path in doc_files:
        if path.is_file() and path.suffix in {".md", ".json"}:
            relative = path.relative_to(root).as_posix()
            if relative not in indexed:
                findings.append(f"CTX005: unindexed document {relative}")
    reviews = {item["id"] for item in registry["reviews"] if valid_id(item)}
    for item in registry["requirements"]:
        if not valid_id(item):
            findings.append("CTX006: invalid requirement entry")
            continue
        ident = item["id"]
        document_id = item.get("document")
        document = documents.get(document_id) if isinstance(document_id, str) else None
        if document is None:
            findings.append(f"CTX006: {ident} references unknown document")
        else:
            path = local_path(root, document.get("path"))
            anchor = item.get("anchor")
            if path and path.is_file():
                try:
                    if not isinstance(anchor, str) or anchor not in headings(path):
                        findings.append(f"CTX006: {ident} heading not found")
                except (OSError, UnicodeError):
                    findings.append(f"CTX006: {ident} document cannot be read")
        status = item.get("status")
        if not isinstance(status, str) or status not in STATUSES:
            findings.append(f"CTX007: {ident} has invalid implementation status")
        for field in ("implementation", "tests", "evidence", "proofs", "reviews"):
            values = item.get(field)
            if not isinstance(values, list) or any(
                not isinstance(value, str) for value in values
            ):
                findings.append(f"CTX008: {ident}.{field} must be string references")
                continue
            if field in {"implementation", "tests", "evidence"}:
                for value in values:
                    path = local_path(root, value)
                    if path is None or (field != "evidence" and not path.exists()):
                        findings.append(
                            f"CTX008: {ident}.{field} missing/unsafe path {value}"
                        )
            if field == "reviews" and any(value not in reviews for value in values):
                findings.append(f"CTX008: {ident} references unknown review")
        if status == "implemented" and any(
            not item.get(field)
            for field in ("implementation", "tests", "evidence", "reviews")
        ):
            findings.append(f"CTX009: {ident} implemented claim lacks traceability")
    return findings


def main() -> int:
    findings = validate()
    print("\n".join(findings) if findings else "Shop3i context index validated")
    return int(bool(findings))


if __name__ == "__main__":
    raise SystemExit(main())
