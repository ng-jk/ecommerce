"""Strict transport contracts; no package code is imported by the broker."""

import hashlib
import io
import json
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path


class Rejected(ValueError):
    """A safe, terminal contract failure."""


def require(condition, reason):
    if not condition:
        raise Rejected(reason)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def identifier(value):
    require(
        isinstance(value, str) and re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", value),
        "invalid_identifier",
    )
    return value


def object_fields(value, fields):
    require(isinstance(value, dict) and set(value) == set(fields), "invalid_fields")


def invocation(value):
    object_fields(value, ("operation", "input"))
    require(value["operation"] == "quote.adjustments", "unsupported_operation")
    data = value["input"]
    object_fields(data, ("subtotal_minor", "currency"))
    require(
        type(data["subtotal_minor"]) is int
        and 0 <= data["subtotal_minor"] <= 100_000_000,
        "invalid_subtotal",
    )
    require(
        isinstance(data["currency"], str)
        and re.fullmatch(r"[A-Z]{3}", data["currency"]),
        "invalid_currency",
    )
    return value


def proposal(value, source):
    object_fields(value, ("fee_minor", "discount_minor", "currency"))
    require(value["currency"] == source["currency"], "currency_mismatch")
    for key in ("fee_minor", "discount_minor"):
        require(
            type(value[key]) is int and 0 <= value[key] <= source["subtotal_minor"],
            "invalid_adjustment",
        )
    return value


@dataclass(frozen=True)
class Binding:
    installation: str
    tenant: str
    caller: str
    package: str
    sha256: str
    capabilities: frozenset


class Registry:
    """Operator-owned registry, read again at execution and on each SDK call."""

    def __init__(self, path):
        self.path = Path(path)

    def resolve(self, installation, caller):
        identifier(installation)
        entries = json.loads(self.path.read_text(encoding="utf-8"))
        row = entries.get(installation)
        require(
            isinstance(row, dict) and row.get("enabled") is True,
            "installation_unavailable",
        )
        require(caller in row["callers_sha256"], "forbidden")
        caps = frozenset(row["capabilities"])
        require(
            caps <= {"storage.read", "storage.write", "quote.adjustments"},
            "invalid_capabilities",
        )
        require("quote.adjustments" in caps, "forbidden")
        identifier(row["tenant"])
        return Binding(
            installation, row["tenant"], caller, row["package"], row["sha256"], caps
        )


def package_bytes(binding):
    path = Path(binding.package)
    require(path.stat().st_size <= 1_048_576, "package_too_large")
    data = path.read_bytes()
    require(digest(data) == binding.sha256, "package_digest_mismatch")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        require(1 <= len(entries) <= 32, "invalid_archive")
        names = [entry.filename for entry in entries]
        require(len(set(names)) == len(names), "duplicate_path")
        require(
            sum(entry.file_size for entry in entries) <= 2_097_152,
            "expanded_package_too_large",
        )
        for entry in entries:
            require(
                re.fullmatch(r"[a-zA-Z0-9_-]+\.(py|json)", entry.filename),
                "invalid_path",
            )
            require(
                entry.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED),
                "invalid_compression",
            )
            require(
                (entry.external_attr >> 16) & 0o170000 != 0o120000, "symlink_forbidden"
            )
        require({"__main__.py", "manifest.json"} <= set(names), "missing_entrypoint")
        manifest = json.loads(archive.read("manifest.json"))
        object_fields(
            manifest, ("id", "version", "contract", "operations", "capabilities")
        )
        identifier(manifest["id"])
        require(
            isinstance(manifest["version"], str)
            and re.fullmatch(r"\d+\.\d+\.\d+", manifest["version"]),
            "invalid_version",
        )
        require(manifest["contract"] == "shop3i.plugin/1", "unsupported_contract")
        require(
            manifest["operations"]
            == [{"name": "quote.adjustments", "method": "POST", "path": "/quote"}],
            "invalid_operations",
        )
        require(
            set(manifest["capabilities"]) == binding.capabilities, "capability_mismatch"
        )
    return data
