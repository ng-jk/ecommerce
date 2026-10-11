"""Offline release report; all evidence is rendered as escaped text."""

from html import escape


def render(data: dict) -> str:
    def cell(value: object) -> str:
        return escape(str(value), quote=True)

    latest = {item["name"]: item for item in data["stages"]}
    rows = "".join(
        f'<tr><th scope="row">{cell(name)}</th><td>{cell(item["status"])}</td>'
        f"<td>{cell(item['at'])}</td><td>{cell(item['detail'])}</td></tr>"
        for name, item in latest.items()
    )
    history = "".join(
        f"<li>{cell(item['at'])} — {cell(item['name'])}: "
        f"{cell(item['status'])} {cell(item['detail'])}</li>"
        for item in data["stages"]
    )
    artifacts = "".join(
        f'<tr><th scope="row">{cell(name)}</th><td><code>{cell(digest)}</code></td></tr>'
        for name, digest in data["artifacts"].items()
    )
    metadata = "".join(
        f"<dt>{label}</dt><dd>{cell(data[key])}</dd>"
        for label, key in [
            ("Run", "run_id"),
            ("Commit", "commit"),
            ("Profile", "profile"),
            ("Specification SHA256", "spec_digest"),
            ("Started (UTC)", "started_at"),
            ("Finished (UTC)", "finished_at"),
        ]
    )
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Shop3i release — {cell(data["run_id"])}</title>
<style>
body{{font:16px/1.6 system-ui,sans-serif;background:#f4f6fa;color:#192334;margin:0}}
main{{max-width:1100px;margin:40px auto;padding:28px;background:white;border-radius:16px}}
h1{{margin:0;font-size:32px}} .status{{font-size:22px;font-weight:700}}
dl{{display:grid;grid-template-columns:190px 1fr;gap:8px}}dt{{font-weight:600}}
dd{{margin:0;overflow-wrap:anywhere}}table{{width:100%;border-collapse:collapse}}
th,td{{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #dde3eb;overflow-wrap:anywhere}}
thead{{background:#edf2f7}}.scroll{{overflow-x:auto}}code{{word-break:break-all}}
details{{margin-top:24px}}li{{overflow-wrap:anywhere}}
@media(max-width:650px){{main{{margin:0;padding:16px;border-radius:0}}dl{{display:block}}dd{{margin-bottom:12px}}}}
</style></head><body><main>
<h1>Shop3i release report</h1><p class="status">Status: {cell(data["status"])}</p>
<dl>{metadata}</dl><h2>Stage results</h2>
<p>Latest recorded result for each stage. Skipped stages have not passed verification.</p>
<div class="scroll"><table><thead><tr><th>Stage</th><th>Status</th><th>Time (UTC)</th><th>Details</th></tr></thead>
<tbody>{rows}</tbody></table></div>
<h2>Artifact digests</h2><table><thead><tr><th>Artifact</th><th>SHA256</th></tr></thead><tbody>{artifacts}</tbody></table>
<details><summary>Full stage history</summary><ol>{history}</ol></details>
</main></body></html>"""
