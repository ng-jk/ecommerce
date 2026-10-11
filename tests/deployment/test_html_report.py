"""Release evidence stays readable offline without executing supplied content."""

import json

from tools.lifecycle.report import Report


def test_html_is_primary_and_preserves_evidence_with_escaped_content(tmp_path):
    report = Report(tmp_path, "html-test", "a" * 40, "<script>bad()</script>", "b" * 64)
    assert report.path.suffix == ".html"
    report.stage("build", "running")
    report.stage("build", "failed", '<img src=x onerror="bad()">')
    report.stage("production", "skipped", "Prerequisite was not reached")
    report.artifact("bundle<&>", "c" * 64)
    report.finish("failed")
    html = report.path.read_text(encoding="utf-8")
    assert "<!doctype html>" in html
    assert "<script>" not in html and "<img" not in html
    assert "&lt;script&gt;bad()&lt;/script&gt;" in html
    assert "&lt;img src=x onerror=&quot;bad()&quot;&gt;" in html
    assert "bundle&lt;&amp;&gt;" in html
    assert "default-src 'none'" in html
    assert "Status: failed" in html
    assert "Prerequisite was not reached" in html
    summary = html.split("<tbody>", 1)[1].split("</tbody>", 1)[0]
    assert "running" not in summary and "failed" in summary
    assert "running" in html.split("Full stage history", 1)[1]
    assert json.loads(report.json_path.read_text())["status"] == "failed"
