"""Registry validation remains total for malformed and hostile JSON values."""

import json
import runpy
import sys
from pathlib import Path

import pytest

from tools import context_index as index


@pytest.fixture
def registry(tmp_path):
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "spec.md").write_text("# Requirement One\n", encoding="utf-8")
    (tmp_path / "implementation.py").write_text("pass\n", encoding="utf-8")
    (tmp_path / "test_rule.py").write_text("pass\n", encoding="utf-8")
    data = {
        "schema_version": 1,
        "amendment": "SHOP3I",
        "documents": [
            {
                "id": "registry",
                "path": "docs/registry.json",
                "status": "active",
                "supersedes": [],
            },
            {
                "id": "spec",
                "path": "docs/spec.md",
                "status": "active",
                "supersedes": [],
            },
        ],
        "requirements": [
            {
                "id": "R1",
                "document": "spec",
                "anchor": "requirement-one",
                "status": "implemented",
                "implementation": ["implementation.py"],
                "tests": ["test_rule.py"],
                "evidence": ["test-results/evidence.json"],
                "proofs": [],
                "reviews": ["quality"],
            }
        ],
        "reviews": [{"id": "quality"}],
        "test_standards": [{"id": "unit"}],
    }

    def save(value=data):
        (docs / "registry.json").write_text(json.dumps(value), encoding="utf-8")
        return index.validate(tmp_path)

    return tmp_path, data, save


def test_valid_registry_and_heading_normalization(registry):
    root, _, save = registry
    assert save() == []
    assert index.local_path(root, "docs/spec.md") == root / "docs/spec.md"
    assert "requirement-one" in index.headings(root / "docs/spec.md")


@pytest.mark.parametrize(
    "bad",
    [None, [], "text", {"schema_version": 2}, {"schema_version": 1, "documents": []}],
)
def test_bad_schema_is_finding(registry, bad):
    _, _, save = registry
    assert index.validate(registry[0]) == [
        "CTX001: docs/registry.json is missing or invalid JSON"
    ]
    assert any("CTX001" in item for item in save(bad))


def test_missing_or_non_utf8_registry_is_finding(registry):
    root, _, _ = registry
    assert index.validate(root)[0].startswith("CTX001")
    (root / "docs/registry.json").write_bytes(b"\xff")
    assert index.validate(root)[0].startswith("CTX001")


@pytest.mark.parametrize("bad", [None, "", [], {"x": 1}])
def test_amendment_types_fail_closed(registry, bad):
    _, data, save = registry
    data["amendment"] = bad
    assert any("amendment" in item for item in save())


@pytest.mark.parametrize("bad", [None, 0, {}, {"id": []}, {"id": "   "}])
def test_invalid_collection_entries_and_requirement_are_findings(registry, bad):
    _, data, save = registry
    data["documents"].append(bad)
    data["requirements"].append(bad)
    data["reviews"].append(bad)
    data["test_standards"].append(bad)
    findings = save()
    assert any("invalid documents entry" in item for item in findings)
    assert any("invalid requirement entry" in item for item in findings)


def test_duplicate_ids_paths_and_unindexed_doc(registry):
    root, data, save = registry
    data["documents"].append({"id": "copy", "path": "docs/spec.md", "status": "active"})
    data["reviews"].append({"id": "spec"})
    (root / "docs/new.md").write_text("new", encoding="utf-8")
    findings = save()
    assert any("duplicate ID" in item for item in findings)
    assert any("duplicate document path" in item for item in findings)
    assert any("unindexed document" in item for item in findings)


@pytest.mark.parametrize(
    "path",
    [None, [], "../escape", "C:/secret", "docs\\spec.md", "missing.md", "bad\x00path"],
)
def test_document_path_is_safe_and_present(registry, path):
    _, data, save = registry
    data["documents"][1]["path"] = path
    assert any("missing/unsafe document path" in item for item in save())


def test_document_status_and_supersedes_are_validated(registry):
    _, data, save = registry
    data["documents"][1]["status"] = {}
    data["documents"][1]["supersedes"] = [{}]
    findings = save()
    assert any("invalid document status" in item for item in findings)
    assert any("invalid supersedes" in item for item in findings)
    data["documents"][1]["supersedes"] = ["spec"]
    assert any("invalid supersedes" in item for item in save())
    data["documents"][1]["supersedes"] = ["missing"]
    assert any("invalid supersedes" in item for item in save())


def test_requirement_bad_document_anchor_and_status(registry):
    _, data, save = registry
    item = data["requirements"][0]
    item["document"] = []
    item["status"] = {}
    findings = save()
    assert any("unknown document" in value for value in findings)
    assert any("invalid implementation status" in value for value in findings)
    item["document"] = "spec"
    item["anchor"] = []
    assert any("heading not found" in value for value in save())


@pytest.mark.parametrize(
    "field", ["implementation", "tests", "evidence", "proofs", "reviews"]
)
def test_requirement_references_must_be_strings(registry, field):
    _, data, save = registry
    data["requirements"][0][field] = [{}]
    assert any(f"R1.{field} must be string" in item for item in save())


def test_requirement_paths_reviews_and_claims(registry):
    _, data, save = registry
    item = data["requirements"][0]
    item["implementation"] = ["../escape"]
    item["tests"] = ["missing.py"]
    item["evidence"] = ["C:/secret"]
    item["reviews"] = ["missing"]
    findings = save()
    assert sum("missing/unsafe path" in value for value in findings) == 3
    assert any("unknown review" in value for value in findings)
    item["implementation"] = []
    assert any("lacks traceability" in value for value in save())


def test_missing_heading_is_finding(registry):
    _, data, save = registry
    data["requirements"][0]["anchor"] = "other"
    assert any("heading not found" in value for value in save())


def test_cli_reports_findings_and_success(registry, monkeypatch, capsys):
    _, data, save = registry
    assert save() == []
    data["amendment"] = ""
    findings = save()
    monkeypatch.setattr(index, "validate", list)
    assert index.main() == 0
    assert "validated" in capsys.readouterr().out
    monkeypatch.setattr(index, "validate", lambda: findings)
    assert index.main() == 1
    assert "CTX001" in capsys.readouterr().out
    monkeypatch.setattr(sys, "argv", ["context_index.py", "--help"])
    with pytest.raises(SystemExit) as error:
        runpy.run_path(index.__file__, run_name="__main__")
    assert error.value.code == 0 or error.value.code == 1


def test_document_inventory_failure_is_finding(registry, monkeypatch):
    root, _, save = registry
    original = Path.rglob

    def broken(path, pattern):
        if path == root / "docs":
            raise OSError("inaccessible")
        return original(path, pattern)

    monkeypatch.setattr(Path, "rglob", broken)
    assert any("unable to inventory" in value for value in save())


def test_document_inventory_skips_directories(registry):
    root, _, save = registry
    (root / "docs/subdirectory").mkdir()
    assert save() == []


def test_unreadable_requirement_document_is_finding(registry):
    root, _, save = registry
    (root / "docs/spec.md").write_bytes(b"\xff")
    assert any("document cannot be read" in value for value in save())


def test_pipeline_review_includes_context_findings(registry, monkeypatch):
    from tools.pipeline import review

    root, data, save = registry
    data["amendment"] = ""
    assert any("CTX001" in value for value in save())
    for app in ("fashion", "electronics", "admin"):
        folder = root / f"frontend/{app}"
        (folder / "src/app").mkdir(parents=True)
        (folder / "tsconfig.json").write_text(
            json.dumps(
                {
                    "compilerOptions": {
                        "strict": True,
                        "noUncheckedIndexedAccess": True,
                        "exactOptionalPropertyTypes": True,
                    }
                }
            )
        )
    (root / "frontend/screens.json").write_text("{}")
    monkeypatch.setattr(review, "ROOT", root)
    monkeypatch.setattr(review, "run", lambda *args, **kwargs: "")
    assert any("CTX001" in value for value in review.review(root))
