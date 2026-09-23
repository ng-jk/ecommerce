"""Exercise orchestration without Docker, network, or deployment side effects."""

import json

import pytest

from tools.pipeline import stages


@pytest.fixture
def commands(tmp_path, monkeypatch):
    calls = []
    (tmp_path / "test-results").mkdir()
    monkeypatch.setattr(stages, "ROOT", tmp_path)
    monkeypatch.setattr(
        stages, "run", lambda args, **kwargs: calls.append((args, kwargs)) or ""
    )
    return calls


def test_isolated_environment_preserves_existing_configuration(tmp_path, monkeypatch):
    monkeypatch.setattr(stages, "ROOT", tmp_path)
    monkeypatch.delenv("APP_KEY", raising=False)
    monkeypatch.delenv("DB_PASSWORD", raising=False)
    stages.test_environment()
    assert stages.os.environ["DB_PASSWORD"] == "commerce-isolated-test-password"
    monkeypatch.setenv("DB_PASSWORD", "configured")
    (tmp_path / ".env").write_text("local configuration")
    stages.test_environment()
    assert stages.os.environ["DB_PASSWORD"] == "configured"


def test_build_and_api_stages_are_ordered_and_isolated(commands):
    stages.build()
    assert [call[0][-1] for call in commands] == [
        "backend",
        "fashion",
        "electronics",
        "admin",
    ]
    commands.clear()
    stages.integration()
    assert all("commerce-tests" in call[0] for call in commands[:-1])
    assert commands[1][0][-2:] == ["migrate", "--force"]
    assert commands[2][0][-2:] == ["db:seed", "--force"]
    assert commands[-1][0][-2:] == ["tests/api", "-q"]


@pytest.mark.parametrize("exists", [False, True])
def test_unit_coverage_and_optional_browser_commands(commands, monkeypatch, exists):
    stages.test()
    assert any("--network" in args and "none" in args for args, _ in commands)
    commands.clear()
    monkeypatch.setattr(stages, "require_complete_coverage", lambda *args: None)

    def run(args, **kwargs):
        commands.append((args, kwargs))
        return "1" if exists and "-Atc" in args else ""

    monkeypatch.setattr(stages, "run", run)
    stages.coverage()
    assert (
        any("CREATE DATABASE commerce_unit" in args for args, _ in commands)
        is not exists
    )
    assert "--coverage.thresholds.branches=100" in commands[0][0]
    assert "--cov-fail-under=100" in commands[1][0]
    assert "--coverage-clover=/reports/sqlite.xml" in commands[3][0]
    stages.browser()
    assert commands[-1][0][-2:] == ["playwright", "test"]


def test_lint_checks_types_rules_and_generated_contract_drift(commands):
    stages.lint()
    assert commands[0][0][-1] == "typecheck"
    assert commands[1][0][-1] == "--max-warnings=0"
    assert "--exit-code" in commands[-1][0]


@pytest.mark.parametrize(
    "result",
    [
        [],
        [[{}, {}]],
        [[{}, {"test_outcome": "survived"}]],
        [[{}, {"test_outcome": "killed"}]],
    ],
)
def test_optional_mutation_rejects_missing_or_surviving_results(
    commands, monkeypatch, result
):
    def run(args, **kwargs):
        commands.append((args, kwargs))
        return "\n".join(json.dumps(row) for row in result) if "dump" in args else ""

    monkeypatch.setattr(stages, "run", run)
    if result and result[0][1].get("test_outcome") == "killed":
        stages.mutation()
    else:
        with pytest.raises(RuntimeError, match="mutation gate"):
            stages.mutation()
