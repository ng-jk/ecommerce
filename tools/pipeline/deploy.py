"""Publish a verified release and deploy only through a pinned SSH host key."""

import json
import os
import re
import shlex
import tempfile
from pathlib import Path

from .runner import ROOT, run


def required(name: str, pattern: str) -> str:
    value = os.environ.get(name, "")
    if not re.fullmatch(pattern, value):
        raise ValueError(f"Set a valid {name} before deployment")
    return value


def deploy() -> None:
    evidence = ROOT / "test-results/verified.json"
    if not evidence.exists():
        raise ValueError("Run all verification gates before deployment")
    commit = run(
        ["git", "-c", f"safe.directory={ROOT.as_posix()}", "rev-parse", "HEAD"]
    ).strip()
    report = json.loads(evidence.read_text(encoding="utf-8"))
    if report.get("commit") != commit or report.get("gates") != [
        "review",
        "lint",
        "test",
        "prove",
        "integration",
        "coverage",
    ]:
        raise ValueError(
            "Release evidence is incomplete or belongs to a different commit"
        )
    if run(
        ["git", "-c", f"safe.directory={ROOT.as_posix()}", "status", "--porcelain"]
    ).strip():
        raise ValueError("Commit the verified release before deployment")
    registry = required("IMAGE_REGISTRY", r"[a-zA-Z0-9][a-zA-Z0-9./_-]+")
    host = required("DEPLOY_HOST", r"[a-zA-Z0-9][a-zA-Z0-9.-]+")
    user = required("DEPLOY_USER", r"[a-z_][a-z0-9_-]*")
    directory = required("DEPLOY_PATH", r"/[a-zA-Z0-9/._-]*")
    if ".." in directory or directory == "/":
        raise ValueError(
            "DEPLOY_PATH must be a dedicated absolute application directory"
        )
    known_hosts = Path(os.environ.get("DEPLOY_KNOWN_HOSTS", ""))
    if not known_hosts.is_file():
        raise ValueError(
            "DEPLOY_KNOWN_HOSTS must contain the independently verified host key"
        )
    images: dict[str, str] = {}
    for app in ("backend", "fashion", "electronics", "admin"):
        tag = f"{registry}/{app}:{commit}"
        build = [
            "docker",
            "build",
            "-t",
            tag,
            "-f",
            "docker/backend/Dockerfile"
            if app == "backend"
            else "docker/web/Dockerfile",
        ]
        build += (
            ["--target", "production"]
            if app == "backend"
            else ["--build-arg", f"APP={app}"]
        )
        run([*build, "."], timeout=900)
        run(["docker", "push", tag], timeout=900)
        digest = json.loads(
            run(
                [
                    "docker",
                    "image",
                    "inspect",
                    tag,
                    "--format",
                    "{{json .RepoDigests}} ",
                ]
            )
        )[0]
        images[app] = digest
    destination = f"{user}@{host}"
    security = [
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        f"UserKnownHostsFile={known_hosts.resolve()}",
    ]
    with tempfile.TemporaryDirectory() as temporary:
        release = Path(temporary) / "release.env"
        release.write_text(
            "\n".join(f"{name.upper()}_IMAGE={image}" for name, image in images.items())
            + "\n",
            encoding="utf-8",
        )
        run(["ssh", *security, destination, shlex.join(["mkdir", "-p", directory])])
        for source, target in [
            (release, "release.next.env"),
            (ROOT / "compose.release.yaml", "compose.release.yaml"),
            (ROOT / "scripts/deploy.sh", "deploy.sh"),
            (ROOT / "docker/Caddyfile.production", "Caddyfile"),
        ]:
            run(["scp", *security, str(source), f"{destination}:{directory}/{target}"])
        run(
            [
                "ssh",
                *security,
                destination,
                shlex.join(["bash", f"{directory}/deploy.sh", directory]),
            ],
            timeout=900,
        )
    (ROOT / "test-results/release.json").write_text(
        json.dumps({"commit": commit, "images": images, "host": host}, indent=2),
        encoding="utf-8",
    )
