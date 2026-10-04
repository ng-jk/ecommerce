"""R03 capability directory contracts, independent of import graph rules."""

from pathlib import PurePosixPath


def inspect_structure(paths: list[str]) -> list[str]:
    findings = []
    modules = {}
    for path in paths:
        parts = PurePosixPath(path).parts
        if not parts or parts[0] not in {"frontend", "packages"}:
            continue
        marker = next(
            (i for i, part in enumerate(parts) if part in {"services", "screens"}), None
        )
        if marker is not None and len(parts) > marker + 2:
            kind, name = parts[marker : marker + 2]
            root = "/".join(parts[: marker + 2])
            modules.setdefault(root, {"kind": kind, "children": set()})["children"].add(
                parts[marker + 2]
            )
            if kind == "screens" and not name.endswith("_screen"):
                findings.append(f"R03 {root}: screen name must end in _screen")
            allowed = {"data", "logic", "index.ts"}
            if kind == "screens":
                allowed.add("interface")
            if parts[marker + 2] not in allowed:
                findings.append(f"R03 {path}: file outside module layers")
            continue
        if not path.endswith((".ts", ".tsx")) or path.endswith(".d.ts"):
            continue
        if "/generated/" in path or "/src/app/" in path:
            continue
        if len(parts) == 3 and parts[-1] in {"index.ts", "index.tsx", "expo-env.d.ts"}:
            continue
        findings.append(
            f"R03 {path}: authored source must belong to a service or screen module"
        )
    for root, module in modules.items():
        required = {"data", "logic", "index.ts"}
        if module["kind"] == "screens":
            required.add("interface")
        missing = required - module["children"]
        if missing:
            findings.append(f"R03 {root}: missing {', '.join(sorted(missing))}")
    return sorted(set(findings))
