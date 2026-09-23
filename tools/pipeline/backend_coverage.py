"""Combine genuine SQLite and PostgreSQL execution evidence for the same source."""

import json
from pathlib import Path
from xml.etree import ElementTree


def require_complete_coverage(paths: list[Path], destination: Path) -> None:
    runs = []
    for path in paths:
        rows = {}
        for file in ElementTree.parse(path).iter("file"):
            name = file.attrib["name"].replace("\\", "/")
            for line in file.findall("line"):
                if line.attrib.get("type") == "stmt":
                    rows[(name, int(line.attrib["num"]))] = (
                        int(line.attrib["count"]) > 0
                    )
        if not rows:
            raise ValueError(f"Empty backend coverage report: {path.name}")
        runs.append(rows)
    if not runs or any(set(run) != set(runs[0]) for run in runs[1:]):
        raise ValueError(
            "Backend coverage reports must describe identical executable source"
        )
    uncovered = [
        {"file": name, "line": line}
        for name, line in sorted(runs[0])
        if not any(run[(name, line)] for run in runs)
    ]
    total = len(runs[0])
    report = {
        "metric": "executable PHP lines",
        "total": total,
        "covered": total - len(uncovered),
        "percent": 100 * (total - len(uncovered)) / total,
        "uncovered": uncovered,
        "sources": [path.name for path in paths],
    }
    destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
    if uncovered:
        raise RuntimeError(
            f"Backend coverage is {report['percent']:.2f}%; 100% required"
        )
