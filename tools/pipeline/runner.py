"""Run explicit argument lists with bounded execution and failure propagation."""

import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def run(arguments: list[str], *, cwd: Path = ROOT, timeout: int = 300) -> str:
    result = subprocess.run(
        arguments,
        cwd=cwd,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        timeout=timeout,
        check=False,
    )
    if result.stdout and arguments[0] != "git":
        print(result.stdout, end="")
    if result.returncode:
        raise RuntimeError(
            f"{arguments[0]} failed ({result.returncode}): {result.stderr[-4000:]}"
        )
    return result.stdout


def npm(*arguments: str) -> list[str]:
    return ["npm.cmd" if os.name == "nt" else "npm", *arguments]
