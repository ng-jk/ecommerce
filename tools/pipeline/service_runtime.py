"""Provision an isolated test-only service runtime; never rotate persisted DB secrets."""

import base64
import secrets
from pathlib import Path

from .runner import ROOT, run

SERVICES = (
    "crm",
    "helpdesk",
    "learning",
    "builder",
    "insights",
    "erp",
    "hr",
    "lending",
)


def prepare(directory: Path | None = None) -> Path:
    directory = directory or ROOT / "test-results/service-runtime"
    directory.mkdir(parents=True, exist_ok=True)
    environment = directory / "runtime.env"
    required = [
        key
        for service in SERVICES
        for key in (
            f"PLATFORM_{service.upper()}_SERVICE_KEY",
            f"{service.upper()}_BOOTSTRAP_PASSWORD",
            f"{service.upper()}_DATABASE_PASSWORD",
            f"{service.upper()}_APP_KEY",
        )
    ]
    if environment.exists():
        values = dict(
            line.split("=", 1)
            for line in environment.read_text(encoding="utf-8").splitlines()
            if "=" in line and not line.startswith("#")
        )
        if any(not values.get(key) for key in required):
            raise RuntimeError(
                "Incomplete isolated service environment; preserve DB credentials"
            )
    else:
        values = {key: secrets.token_hex(32) for key in required}
        for service in SERVICES:
            values[f"{service.upper()}_APP_KEY"] = "base64:" + base64.b64encode(
                secrets.token_bytes(32)
            ).decode("ascii")
        with environment.open("x", encoding="utf-8") as output:
            output.write("".join(f"{key}={value}\n" for key, value in values.items()))
        environment.chmod(0o600)
    certificates = directory / "certificates"
    certificates.mkdir(exist_ok=True)
    command = [
        "docker",
        "run",
        "--rm",
        "--network",
        "none",
        "--mount",
        f"type=bind,source={certificates.resolve()},target=/certificates",
        "--entrypoint",
        "openssl",
        "ecommerce-portfolio-backend",
    ]
    ca = [certificates / name for name in ("ca.key", "ca.crt")]
    if any(path.exists() for path in ca) and not all(path.exists() for path in ca):
        raise RuntimeError(
            "Incomplete test CA; do not replace trusted authority silently"
        )
    if not all(path.exists() for path in ca):
        run(
            [
                *command,
                "req",
                "-x509",
                "-newkey",
                "rsa:3072",
                "-nodes",
                "-days",
                "30",
                "-subj",
                "/CN=Shop3i isolated integration CA",
                "-keyout",
                "/certificates/ca.key",
                "-out",
                "/certificates/ca.crt",
            ],
            timeout=120,
        )
    run(
        [*command, "x509", "-in", "/certificates/ca.crt", "-checkend", "3600", "-noout"]
    )
    leaf = [certificates / name for name in ("services.key", "services.crt")]
    if any(path.exists() for path in leaf) and not all(path.exists() for path in leaf):
        raise RuntimeError("Incomplete test service certificate")
    if not all(path.exists() for path in leaf):
        names = ["platform-internal", *(f"{service}-internal" for service in SERVICES)]
        (certificates / "services.ext").write_text(
            "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\n"
            "extendedKeyUsage=serverAuth\nsubjectAltName="
            + ",".join(f"DNS:{name}" for name in names)
            + "\n",
            encoding="utf-8",
        )
        run(
            [
                *command,
                "req",
                "-new",
                "-newkey",
                "rsa:3072",
                "-nodes",
                "-subj",
                "/CN=platform-internal",
                "-keyout",
                "/certificates/services.key",
                "-out",
                "/certificates/services.csr",
            ],
            timeout=120,
        )
        run(
            [
                *command,
                "x509",
                "-req",
                "-in",
                "/certificates/services.csr",
                "-CA",
                "/certificates/ca.crt",
                "-CAkey",
                "/certificates/ca.key",
                "-CAcreateserial",
                "-days",
                "14",
                "-extfile",
                "/certificates/services.ext",
                "-out",
                "/certificates/services.crt",
            ]
        )
    run(
        [
            *command,
            "x509",
            "-in",
            "/certificates/services.crt",
            "-checkend",
            "3600",
            "-noout",
        ]
    )
    run(
        [
            *command,
            "verify",
            "-CAfile",
            "/certificates/ca.crt",
            "/certificates/services.crt",
        ]
    )
    for service in ("platform", *SERVICES):
        run(
            [
                *command,
                "verify",
                "-CAfile",
                "/certificates/ca.crt",
                "-verify_hostname",
                f"{service}-internal",
                "/certificates/services.crt",
            ]
        )
    for path in (*ca, *leaf):
        path.chmod(0o600 if path.suffix == ".key" else 0o644)
    return environment


def compose() -> list[str]:
    environment = prepare()
    command = [
        "docker",
        "compose",
        *(["--env-file", ".env"] if (ROOT / ".env").is_file() else []),
        "--env-file",
        str(environment),
        "-p",
        "commerce-tests",
        "-f",
        "compose.yaml",
        "-f",
        "compose.test.yaml",
    ]
    for service in SERVICES:
        command.extend(["-f", f"compose.{service}-test.yaml"])
    return command


def start(command: list[str]) -> None:
    run(
        [
            *command,
            "up",
            "-d",
            "--no-build",
            "--wait",
            "db",
            "backend",
            *(f"{service}-db" for service in SERVICES),
            *SERVICES,
        ],
        timeout=180,
    )
    for service in SERVICES:
        for path in (
            "database/migrations/2026_10_13_015300_create_service_exchange_tables.php",
            f"database/migrations/services/{service}",
        ):
            run(
                [
                    *command,
                    "exec",
                    "-T",
                    service,
                    "php",
                    "artisan",
                    "migrate",
                    "--path=" + path,
                    "--force",
                ]
            )
