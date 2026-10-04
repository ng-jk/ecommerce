import json

from tools.pipeline import review


def test_review_inspects_authored_files_skips_binary_and_deleted_files(
    tmp_path, monkeypatch
):
    (tmp_path / "bad.ts").write_text("// @ts-ignore")
    (tmp_path / "binary.bin").write_bytes(b"\xff\xfe\x00\x80")
    for app in ("fashion", "electronics", "admin"):
        folder = tmp_path / f"frontend/{app}"
        (folder / "src/app").mkdir(parents=True)
        (folder / "tsconfig.json").write_text(json.dumps({"compilerOptions": {}}))
        (folder / "src/app/_layout.tsx").write_text("layout")
    (tmp_path / "frontend/screens.json").write_text("{}")
    monkeypatch.setattr(
        review,
        "run",
        lambda *args, **kwargs: (
            "bad.ts\nbinary.bin\ndeleted.py\nfrontend/admin/src/domain/deleted.ts"
        ),
    )
    findings = review.review(tmp_path)
    assert len(findings) == 10
    assert any("suppression" in finding for finding in findings)
    assert all(
        "binary" not in finding and "deleted" not in finding for finding in findings
    )
