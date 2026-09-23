import json

import pytest

from tools.pipeline.backend_coverage import require_complete_coverage


def clover(path, count, number=10):
    path.write_text(
        f'<coverage><file name="/app/Test.php"><line type="method" num="1" count="0"/><line type="stmt" num="{number}" count="{count}"/></file></coverage>'
    )
    return path


def test_combines_real_complementary_execution_without_changing_denominator(tmp_path):
    a = clover(tmp_path / "sqlite.xml", 0)
    b = clover(tmp_path / "pgsql.xml", 1)
    output = tmp_path / "coverage.json"
    require_complete_coverage([a, b], output)
    assert json.loads(output.read_text())["percent"] == 100


def test_uncovered_line_fails_and_remains_in_report(tmp_path):
    source = clover(tmp_path / "sqlite.xml", 0)
    output = tmp_path / "coverage.json"
    with pytest.raises(RuntimeError, match="100% required"):
        require_complete_coverage([source], output)
    assert json.loads(output.read_text())["uncovered"] == [
        {"file": "/app/Test.php", "line": 10}
    ]


def test_missing_empty_and_different_source_reports_cannot_pass(tmp_path):
    output = tmp_path / "coverage.json"
    with pytest.raises(ValueError):
        require_complete_coverage([], output)
    empty = tmp_path / "empty.xml"
    empty.write_text("<coverage/>")
    with pytest.raises(ValueError, match="Empty"):
        require_complete_coverage([empty], output)
    with pytest.raises(ValueError, match="identical"):
        require_complete_coverage(
            [clover(tmp_path / "one.xml", 1), clover(tmp_path / "two.xml", 1, 20)],
            output,
        )
