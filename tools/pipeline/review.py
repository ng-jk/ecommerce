"""Fail-closed repository requirement checks; no implicit baseline exemptions."""

import json
import re
from pathlib import Path

from tools.context_index import validate as validate_context

from .frontend_structure import inspect_structure
from .runner import ROOT, npm, run


def inspect_text(path: str, content: str) -> list[str]:
    findings: list[str] = []
    authored_logic = (
        Path(path).suffix
        in {
            ".php",
            ".py",
            ".ts",
            ".tsx",
            ".js",
            ".jsx",
            ".mjs",
            ".cjs",
            ".lean",
            ".sh",
            ".ps1",
        }
        and not path.endswith(".d.ts")
        and "/generated/" not in f"/{path}"
    )
    if authored_logic and len(content.splitlines()) > 1000:
        findings.append(f"R01 {path}: exceeds 1000 physical lines")
    if path.endswith((".ts", ".tsx")) and not path.endswith(".d.ts"):
        if re.search(r"@ts-(ignore|nocheck)", content):
            findings.append(f"R02 {path}: unchecked TypeScript suppression")
        if "/domain/" in path and re.search(
            r'from [\'"][^\'"]*(react|expo|/data/|/presentation/)', content
        ):
            findings.append(f"R03 {path}: domain imports a framework or outer layer")
        if "/presentation/" in path and re.search(
            r"\bfetch\s*\(|\b(localStorage|sessionStorage|SecureStore)\b", content
        ):
            findings.append(f"R03 {path}: presentation accesses transport/storage")
    return findings


def review(root: Path = ROOT) -> list[str]:
    run(npm("run", "architecture"), cwd=root)
    paths = run(
        [
            "git",
            "-c",
            f"safe.directory={root.as_posix()}",
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
        ],
        cwd=root,
    ).splitlines()
    findings: list[str] = []
    for path in sorted(set(paths)):
        file = root / path
        if not file.is_file():
            continue
        try:
            content = file.read_text(encoding="utf-8-sig")
        except UnicodeError:
            continue
        findings.extend(inspect_text(path, content))
    findings.extend(
        inspect_structure([path for path in paths if (root / path).is_file()])
    )
    screens = json.loads((root / "frontend/screens.json").read_text(encoding="utf-8"))
    for app in ("fashion", "electronics", "admin"):
        config = json.loads(
            (root / f"frontend/{app}/tsconfig.json").read_text(encoding="utf-8")
        )
        for setting in (
            "strict",
            "noUncheckedIndexedAccess",
            "exactOptionalPropertyTypes",
        ):
            if config.get("compilerOptions", {}).get(setting) is not True:
                findings.append(f"R02 {app}: {setting} must be true")
        for route in (root / f"frontend/{app}/src/app").rglob("*.tsx"):
            if route.name == "_layout.tsx":
                continue
            name = route.relative_to(root).as_posix()
            screen = screens.get(name)
            if not screen or screen.get("kind") not in ("main", "temp"):
                findings.append(f"R04 {name}: missing main/temp registration")
            else:
                for variant, declaration in {
                    "default": screen,
                    **screen.get("variants", {}),
                }.items():
                    if (
                        declaration.get("kind") not in ("main", "temp")
                        or len(declaration.get("controls", [])) > 7
                    ):
                        findings.append(
                            f"R04 {name} ({variant}): invalid classification or more than seven controls"
                        )
    if root.resolve() == ROOT.resolve():
        findings.extend(validate_context(root))
    return findings
