"""Validate declarative deployment targets and native distribution settings."""

import json
import re
from pathlib import Path

KINDS = {"shared-general", "shared-plugin", "dedicated-company", "dedicated-miniapp"}
APPLICATIONS = {"fashion", "electronics", "admin"}
PLATFORMS = {"android", "ios"}


class UnsupportedDeployment(RuntimeError):
    """A declared target has no independent deployment implementation yet."""


def load(path: Path, profile: str) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if set(data) != {"release_config", "profiles"} or not isinstance(
        data["profiles"], dict
    ):
        raise ValueError("Lifecycle config requires release_config and profiles")
    release_path = Path(data["release_config"])
    if not release_path.is_absolute():
        release_path = path.parent / release_path
    if not release_path.is_file():
        raise ValueError("Release config does not exist")
    item = data["profiles"].get(profile)
    if not isinstance(item, dict) or set(item) - {"kind", "environment", "native"}:
        raise ValueError("Unknown or invalid release profile")
    if item.get("kind") not in KINDS or item.get("environment") not in {
        "testing",
        "production",
    }:
        raise ValueError("Invalid profile kind or environment")
    if item["kind"] != "shared-general":
        raise UnsupportedDeployment(f"Deployment target {item['kind']} is not wired")
    native = item.get("native", [])
    if not isinstance(native, list):
        raise TypeError("native must be a list")
    for target in native:
        if not isinstance(target, dict) or set(target) != {
            "app",
            "platform",
            "eas_profile",
            "credential_env",
        }:
            raise ValueError("Invalid native target")
        if target["app"] not in APPLICATIONS or target["platform"] not in PLATFORMS:
            raise ValueError("Native app or platform is not allowlisted")
        if not isinstance(target["eas_profile"], str) or not re.fullmatch(
            r"[A-Za-z0-9_-]{1,48}", target["eas_profile"]
        ):
            raise ValueError("Invalid EAS profile")
        if not isinstance(target["credential_env"], str) or not re.fullmatch(
            r"[A-Z][A-Z0-9_]{1,63}", target["credential_env"]
        ):
            raise ValueError("Invalid credential environment variable name")
    item = dict(item)
    item["release_config"] = release_path.resolve()
    return item
