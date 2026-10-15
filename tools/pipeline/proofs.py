"""Build required Lean proofs and reject nonstandard transitive axioms."""

import hashlib
import json
import os
import re

from .runner import ROOT, run

REQUIRED = (
    "hr_denied_unchanged",
    "hr_stale_unchanged",
    "hr_terminal_unchanged",
    "hr_self_approval_unchanged",
    "hr_inactive_approval_unchanged",
    "hr_decision_preserves_employee",
    "hr_reservation_preserves_allowance",
    "hr_reservation_sequences_preserve_allowance",
    "lending_denied_unchanged",
    "lending_self_approval_unchanged",
    "lending_stale_unchanged",
    "lending_terminal_replay_unchanged",
    "lending_disabled_product_unchanged",
    "lending_approval_preserves_terms",
    "lending_bounded_allocation_conserves",
    "lending_bounded_charge_is_ceiling",
    "erp_denied_post_unchanged",
    "erp_stale_post_unchanged",
    "erp_duplicate_post_unchanged",
    "erp_unbalanced_post_unchanged",
    "erp_successful_post_balanced",
    "erp_reversal_preserves_original_and_cancels",
    "erp_duplicate_reversal_rejected",
    "insights_denied_empty",
    "insights_shared_report_cannot_elevate_dataset",
    "insights_disabled_empty",
    "insights_foreign_tenant_empty",
    "insights_result_limit_bounded",
    "insights_freshness_reports_current_generation",
    "learning_denied_unchanged",
    "learning_unavailable_unchanged",
    "learning_exhausted_unchanged",
    "learning_server_score_bounded",
    "learning_completion_requires_pass",
    "learning_submission_records_server_key",
    "remote_protocol_denied_unchanged",
    "remote_protocol_effect_requires_positive_authority",
    "remote_protocol_duplicate_id_consistent",
    "remote_protocol_terminal_version_unchanged",
    "remote_protocol_replay_unchanged",
    "remote_protocol_expired_unchanged",
    "service_inbox_revoked_unchanged",
    "service_inbox_stale_worker_unchanged",
    "service_inbox_expired_worker_unchanged",
    "service_inbox_completed_unchanged",
    "service_inbox_replay_idempotent",
    "service_inbox_completed_sequences_unchanged",
    "service_inbox_success_effect_and_completion",
    "workspace_rename_rejected_unchanged",
    "workspace_rename_unauthorized_unchanged",
    "workspace_rename_nonowner_unchanged",
    "workspace_rename_revoked_unchanged",
    "workspace_rename_inactive_unchanged",
    "workspace_rename_uninstalled_unchanged",
    "workspace_rename_stale_unchanged",
    "workspace_rename_success",
    "workspace_rename_replay_unchanged",
    "workspace_rename_preserves_identity",
    "workspace_rename_sequences_preserve_identity",
    "workspace_unauthorized_sequences_unchanged",
    "workspace_create_denied_no_result",
    "workspace_create_success_bundle",
    "workspace_create_duplicate_denied",
    "organization_guard_iff",
    "organization_revoked_membership_denied",
    "organization_accepted_then_revoked_denied",
    "organization_disabled_principal_denied",
    "organization_disabled_installation_denied",
    "organization_unknown_tenant_denied",
    "organization_cross_tenant_denied",
    "organization_unavailable_application_denied",
    "organization_unknown_application_denied",
    "organization_claimed_role_cannot_escalate",
    "organization_claimed_role_irrelevant",
    "organization_guard_isolated",
    "mini_denied_unchanged",
    "mini_unauthenticated_denied",
    "mini_foreign_target_denied",
    "mini_uninstalled_denied",
    "mini_disabled_denied",
    "mini_unapproved_denied",
    "mini_package_mismatch_denied",
    "mini_stale_generation_denied",
    "mini_stale_approval_denied",
    "mini_revoked_denied",
    "mini_accepted_then_revoked_unchanged",
    "mini_authorization_noninterference",
    "mini_other_installation_unchanged",
    "mini_other_dispatch_preserves_authorization",
    "mini_sequences_preserve_other_installation",
    "mini_accepted_adds_effect",
    "plugin_invalid_unchanged",
    "plugin_unauthorized_unchanged",
    "plugin_disabled_blocks_execution",
    "plugin_revoked_blocks_execution",
    "plugin_foreign_target_unchanged",
    "plugin_customer_revoked_blocks_execution",
    "plugin_customer_revoked_not_allowed",
    "plugin_credit_requires_admin",
    "plugin_balance_preserves_business_state",
    "plugin_disabled_balance_not_allowed",
    "plugin_credit_overflow_unchanged",
    "plugin_configuration_requires_admin",
    "plugin_other_shop_unchanged",
    "plugin_other_configuration_unchanged",
    "plugin_sequences_preserve_other_shop",
    "plugin_sequences_preserve_other_configuration",
    "payment_paid_is_terminal",
    "payment_unverified_unchanged",
    "payment_release_is_idempotent",
    "assistant_unauthorized_no_execution",
    "assistant_incomplete_no_execution",
    "assistant_write_requires_confirmation",
    "purchase_conserves_stock",
    "purchase_idempotent",
    "all_sequences_conserve_stock",
    "all_sequences_preserve_shop",
    "unauthorized_unchanged",
    "foreign_shop_unchanged",
    "replay_unchanged",
    "stock_nonnegative",
    "money_total_correct",
    "back_never_temp",
    "order_advance_valid",
)


def audit_source(source: str) -> None:
    if re.search(r"\b(sorry|admit|axiom|native_decide)\b", source):
        raise ValueError(
            "Proof holes, custom axioms, and unchecked native proofs are prohibited"
        )
    signatures = json.loads((ROOT / "formal/theorems.json").read_text(encoding="utf-8"))
    statements = dict(re.findall(r"theorem\s+(\w+)\s+([\s\S]*?)\s*:=", source))
    for name in REQUIRED:
        if name not in statements:
            raise ValueError(f"Missing required theorem: {name}")
        statement = " ".join(statements.get(name, "").split())
        if hashlib.sha256(statement.encode()).hexdigest() != signatures.get(name):
            raise ValueError(f"Required theorem statement changed: {name}")


def prove() -> None:
    source = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (ROOT / "formal").rglob("*.lean")
        if ".lake" not in path.parts
    )
    audit_source(source)
    local = ROOT / ".tools/elan/bin"
    executable = local / ("lake.exe" if os.name == "nt" else "lake")
    if executable.exists():
        os.environ["ELAN_HOME"] = str(ROOT / ".tools/elan")
    lake = str(executable) if executable.exists() else "lake"
    run([lake, "build", "Commerce"], cwd=ROOT / "formal")
    output = "\n".join(
        run([lake, "env", "lean", module], cwd=ROOT / "formal")
        for module in (
            "Commerce/Invariants.lean",
            "Commerce/Plugins.lean",
            "Commerce/MiniApps.lean",
            "Commerce/OrganizationAccess.lean",
            "Commerce/OrganizationWorkspace.lean",
            "Commerce/ServiceExchange.lean",
            "Commerce/Learning.lean",
            "Commerce/Insights.lean",
            "Commerce/Lending.lean",
            "Commerce/Erp.lean",
            "Commerce/Hr.lean",
        )
    )
    if "sorryAx" in output:
        raise ValueError("Lean output contains an incomplete proof")
    for group in re.findall(r"depends on axioms:\s*\[([^]]*)\]", output):
        if set(re.findall(r"[\w.]+", group)) - {
            "propext",
            "Classical.choice",
            "Quot.sound",
        }:
            raise ValueError("Unexpected proof axiom")
    for name in REQUIRED:
        if f"Commerce.{name}" not in output:
            raise ValueError(f"Missing axiom audit: {name}")
