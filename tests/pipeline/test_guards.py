"""Verify that failed tools and malformed review evidence cannot pass gates."""

import json
import subprocess

import pytest

from tools.pipeline import proofs, review, runner
from tools.pipeline.deploy import required


def test_runner_preserves_argument_boundaries_and_propagates_failure(monkeypatch):
    calls = []

    def fake(arguments, **kwargs):
        calls.append((arguments, kwargs))
        return subprocess.CompletedProcess(arguments, 3, "test failed", "details")

    monkeypatch.setattr(runner.subprocess, "run", fake)
    with pytest.raises(RuntimeError, match="failed \\(3\\)"):
        runner.run(
            ["tool", "argument with spaces", "$(not a shell command)"], timeout=12
        )
    assert calls[0][0][-1] == "$(not a shell command)"
    assert calls[0][1]["timeout"] == 12
    assert "shell" not in calls[0][1]


def test_runner_returns_success_output(monkeypatch):
    monkeypatch.setattr(
        runner.subprocess,
        "run",
        lambda arguments, **kwargs: subprocess.CompletedProcess(
            arguments, 0, "result", ""
        ),
    )
    assert runner.run(["git", "status"]) == "result"
    assert runner.npm("run", "typecheck")[-2:] == ["run", "typecheck"]


@pytest.mark.parametrize(
    "value", ["", "host; command", "$(command)", "host\nother", "host/../other"]
)
def test_deployment_fields_reject_shell_syntax(monkeypatch, value):
    monkeypatch.setenv("DEPLOY_HOST", value)
    with pytest.raises(ValueError):
        required("DEPLOY_HOST", r"[a-zA-Z0-9][a-zA-Z0-9.-]+")


def test_deployment_field_accepts_explicit_host(monkeypatch):
    monkeypatch.setenv("DEPLOY_HOST", "commerce.example.com")
    assert (
        required("DEPLOY_HOST", r"[a-zA-Z0-9][a-zA-Z0-9.-]+") == "commerce.example.com"
    )


def test_required_proof_source_is_accepted_but_weakened_statement_is_not():
    source = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (runner.ROOT / "formal/Commerce").glob("*.lean")
    )
    proofs.audit_source(source)
    with pytest.raises(ValueError):
        proofs.audit_source(
            source.replace("purchase_conserves_stock", "weakened_conservation")
        )
    for theorem in (
        "plugin_disabled_blocks_execution",
        "plugin_credit_requires_admin",
        "plugin_customer_revoked_not_allowed",
        "plugin_balance_preserves_business_state",
        "mini_accepted_then_revoked_unchanged",
        "mini_stale_approval_denied",
        "mini_authorization_noninterference",
        "mini_sequences_preserve_other_installation",
    ):
        with pytest.raises(ValueError, match=f"Missing required theorem: {theorem}"):
            proofs.audit_source(source.replace(theorem, "removed_plugin_guard"))


def test_miniapp_proofs_cannot_be_weakened_to_trivial_statements():
    source = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (runner.ROOT / "formal/Commerce").glob("*.lean")
    )
    start = source.index("theorem mini_accepted_then_revoked_unchanged")
    proof = source.index(":=", start)
    weakened = (
        source[:start]
        + "theorem mini_accepted_then_revoked_unchanged : True "
        + source[proof:]
    )
    with pytest.raises(ValueError, match="Required theorem statement changed"):
        proofs.audit_source(weakened)


def test_review_rejects_unregistered_routes_and_crowded_variants(tmp_path, monkeypatch):
    route = "frontend/admin/src/app/index.tsx"
    for app in ("fashion", "electronics", "admin"):
        folder = tmp_path / f"frontend/{app}"
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
    (tmp_path / route).write_text("export default function Page() { return null; }")
    screen_file = tmp_path / "frontend/screens.json"
    screen_file.write_text("{}")
    monkeypatch.setattr(review, "run", lambda *args, **kwargs: route)
    assert any("missing main/temp" in finding for finding in review.review(tmp_path))
    screen_file.write_text(
        json.dumps(
            {
                route: {
                    "kind": "main",
                    "controls": [],
                    "variants": {
                        "inventory": {"kind": "main", "controls": list(range(8))}
                    },
                }
            }
        )
    )
    assert any("inventory" in finding for finding in review.review(tmp_path))
    screen_file.write_text(json.dumps({route: {"kind": "main", "controls": []}}))
    assert review.review(tmp_path) == []
