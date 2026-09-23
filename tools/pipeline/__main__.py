"""Run with python -m tools.pipeline STAGE."""

import argparse
import json
import sys

from . import stages
from .deploy import deploy
from .proofs import prove
from .review import review
from .runner import ROOT, run

GATES = [
    "review",
    "lint",
    "test",
    "prove",
    "integration",
    "coverage",
]


def review_stage() -> None:
    findings = review()
    (ROOT / "test-results/review.json").write_text(
        json.dumps({"findings": findings}, indent=2), encoding="utf-8"
    )
    if findings:
        raise RuntimeError("\n".join(findings))


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "stage", choices=[*GATES, "verify", "build", "deploy", "browser", "mutation"]
    )
    arguments = parser.parse_args()
    (ROOT / "test-results").mkdir(exist_ok=True)
    actions = {
        "review": review_stage,
        "lint": stages.lint,
        "test": stages.test,
        "prove": prove,
        "integration": stages.integration,
        "browser": stages.browser,
        "coverage": stages.coverage,
        "mutation": stages.mutation,
        "build": stages.build,
        "deploy": deploy,
    }
    try:
        selected = GATES if arguments.stage == "verify" else [arguments.stage]
        if arguments.stage == "verify":
            (ROOT / "test-results/verified.json").unlink(missing_ok=True)
        for stage in selected:
            if stage == "integration" and arguments.stage == "verify":
                stages.build()
            actions[stage]()
        if arguments.stage == "verify":
            git = ["git", "-c", f"safe.directory={ROOT.as_posix()}"]
            if run([*git, "status", "--porcelain"]).strip():
                raise RuntimeError(
                    "Verification passed, but release evidence requires a clean committed checkout"
                )
            commit = run([*git, "rev-parse", "HEAD"]).strip()
            (ROOT / "test-results/verified.json").write_text(
                json.dumps({"commit": commit, "gates": GATES}, indent=2),
                encoding="utf-8",
            )
        return 0
    except (RuntimeError, ValueError, OSError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
