"""Build required Lean proofs and reject nonstandard transitive axioms."""

import hashlib
import json
import os
import re

from .runner import ROOT, run

REQUIRED = (
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
