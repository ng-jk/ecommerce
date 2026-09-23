"""Build required Lean proofs and reject nonstandard transitive axioms."""

import hashlib
import json
import os
import re

from .runner import ROOT, run

REQUIRED = (
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
    output = run([lake, "env", "lean", "Commerce/Invariants.lean"], cwd=ROOT / "formal")
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
