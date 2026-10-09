"""Independent release reviews with concrete, fail-closed evidence."""

import re
import sys
from pathlib import Path

SECRET_NAMES = re.compile(
    r"(^|/)(\.env($|\.(?!example$))|[^/]+\.(pem|p12|p8|key|jks))$", re.IGNORECASE
)
SECRET_CONTENT = re.compile(
    r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk_live_[A-Za-z0-9]{12,}|\bghp_[A-Za-z0-9]{20,}"
)


def architecture(command, npm: str) -> None:
    command([npm, "run", "architecture"], timeout=900)


def quality(command, npm: str) -> None:
    command(
        [
            sys.executable,
            "-m",
            "ruff",
            "format",
            "--check",
            "tools",
            "tests/deployment",
        ],
        timeout=300,
    )
    command(
        [npm, "exec", "--", "prettier", "--check", "frontend", "packages"], timeout=900
    )


def security(root: Path, git, command, npm: str) -> None:
    paths = git("ls-files").splitlines()
    for value in paths:
        if SECRET_NAMES.search(value.replace("\\", "/")):
            raise RuntimeError("Tracked secret-like release input")
        path = root / value
        if not path.is_file() or path.stat().st_size > 2_000_000:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeError:
            continue
        if SECRET_CONTENT.search(content):
            raise RuntimeError("Tracked credential-like content")
    command([npm, "audit", "--audit-level=high", "--omit=dev"], timeout=900)
    command(
        [
            sys.executable,
            "-m",
            "pip_audit",
            "-r",
            "tools/pipeline/requirements.lock.txt",
        ],
        timeout=900,
    )


def compatibility(command, git, npm: str) -> None:
    command([npm, "run", "api:types"], timeout=900)
    if git(
        "diff",
        "--name-only",
        "--",
        "packages/api-client/generated",
        "packages/api-client/schema.d.ts",
    ):
        raise RuntimeError("Generated API client differs from the committed contract")
