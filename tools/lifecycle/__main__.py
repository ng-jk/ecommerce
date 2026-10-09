"""Run every release gate after one explicit operator invocation."""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import uuid
from contextlib import contextmanager
from pathlib import Path

from tools import manual_release
from tools.lifecycle import reviews
from tools.lifecycle.config import UnsupportedDeployment, load
from tools.lifecycle.report import Report

ROOT = Path(__file__).resolve().parents[2]
GATES = ["review", "lint", "test", "prove", "integration", "coverage"]
ORDER = [
    "requirements_review",
    "architecture_review",
    "quality_review",
    "security_review",
    "compatibility_review",
    "review",
    "lint",
    "test",
    "prove",
    "build",
    "integration",
    "coverage",
    "evidence",
    "artifact",
    "testing",
    "production",
    "native",
    "promotion",
]


class Blocked(RuntimeError):
    """A prerequisite is absent, so success must not be claimed."""


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def command(argv: list[str], *, timeout: int = 3600, cwd: Path = ROOT) -> None:
    """Run fixed argv without retaining potentially sensitive process output."""
    try:
        result = subprocess.run(
            argv, cwd=cwd, capture_output=True, timeout=timeout, check=False
        )
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(
            f"{Path(argv[0]).name} timed out after {timeout}s"
        ) from error
    if result.returncode:
        raise RuntimeError(f"{Path(argv[0]).name} exited {result.returncode}")


def git(*args: str) -> str:
    argv = ["git", "-c", f"safe.directory={ROOT.as_posix()}", *args]
    result = subprocess.run(
        argv, cwd=ROOT, capture_output=True, timeout=60, check=False
    )
    if result.returncode:
        raise RuntimeError("Git inspection failed")
    return result.stdout.decode("utf-8", errors="replace").strip()


@contextmanager
def serial_lock(root: Path):
    path = root / "test-results" / "lifecycle.lock"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as handle:
        handle.seek(0)
        handle.write(b"0")
        handle.flush()
        try:
            if os.name == "nt":
                import msvcrt

                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise Blocked("Another lifecycle run holds the release lock") from error
        try:
            yield
        finally:
            if os.name == "nt":
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def prerequisite() -> str:
    branch = git("branch", "--show-current")
    if branch != "deployment":
        raise Blocked("Lifecycle publication requires the deployment branch")
    if git("status", "--porcelain"):
        raise Blocked("Lifecycle publication requires a clean committed checkout")
    commit = git("rev-parse", "HEAD")
    if not re.fullmatch(r"[a-f0-9]{40}", commit):
        raise Blocked("Invalid Git commit")
    return commit


def context_gate() -> None:
    from tools.context_index import validate

    findings = validate(ROOT)
    if findings:
        raise RuntimeError(f"Context index has {len(findings)} finding(s)")


def evidence(commit: str, report: Report) -> None:
    if git("status", "--porcelain") or git("rev-parse", "HEAD") != commit:
        raise Blocked("Checkout changed during verification")
    path = ROOT / "test-results" / "verified.json"
    path.write_text(
        json.dumps({"commit": commit, "gates": GATES}, indent=2), encoding="utf-8"
    )
    report.artifact("verified.json", digest(path))


def source_manifest(commit: str, report: Report) -> None:
    archive = report.directory / f"{report.data['run_id']}-source.tar"
    manual_release.archive(commit, archive)
    report.artifact("source_archive_sha256", digest(archive))
    manifest = report.directory / f"{report.data['run_id']}-manifest.json"
    manifest.write_text(
        json.dumps({"commit": commit, "source_sha256": digest(archive)}, indent=2),
        encoding="utf-8",
    )
    report.artifact("manifest_sha256", digest(manifest))


def native_publish(profile: dict) -> None:
    targets = profile.get("native", [])
    if not targets:
        raise Blocked("Native publish is not configured for this profile")
    executable = "npx.cmd" if os.name == "nt" else "npx"
    for target in targets:
        if not os.environ.get(target["credential_env"]):
            raise Blocked(
                f"Missing native signing credential: {target['credential_env']}"
            )
        app = ROOT / "frontend" / target["app"]
        if not app.is_dir():
            raise Blocked("Configured native application is absent")
    for target in targets:
        app = ROOT / "frontend" / target["app"]
        for action in ("build", "submit"):
            command(
                [
                    executable,
                    "--no-install",
                    "eas",
                    action,
                    "--platform",
                    target["platform"],
                    "--profile",
                    target["eas_profile"],
                    "--non-interactive",
                ],
                timeout=7200,
                cwd=app,
            )


def run_stage(report: Report, name: str, action) -> None:
    report.stage(name, "running")
    action()
    report.stage(name, "passed")


def lifecycle(config: Path, profile_name: str, publish: bool) -> Report:
    run_id = uuid.uuid4().hex
    spec = ROOT / "docs" / "engineering-spec.md"
    report = Report(ROOT, run_id, "unknown", profile_name, digest(spec))
    reached = set()
    try:
        with serial_lock(ROOT):
            commit = prerequisite()
            report.data["commit"] = commit
            report.save()
            profile = load(config, profile_name)
            manual_release.configuration(profile["release_config"], "testing")
            manual_release.configuration(profile["release_config"], "production")
            if publish and profile["environment"] != "production":
                raise Blocked("This profile does not authorize production")
            if publish and profile.get("native"):
                for target in profile["native"]:
                    if not os.environ.get(target["credential_env"]):
                        raise Blocked(
                            f"Missing native signing credential: {target['credential_env']}"
                        )
            npm = "npm.cmd" if os.name == "nt" else "npm"
            for name, action in [
                ("requirements_review", context_gate),
                ("architecture_review", lambda: reviews.architecture(command, npm)),
                ("quality_review", lambda: reviews.quality(command, npm)),
                ("security_review", lambda: reviews.security(ROOT, git, command, npm)),
                (
                    "compatibility_review",
                    lambda: reviews.compatibility(command, git, npm),
                ),
                *[
                    (
                        gate,
                        lambda gate=gate: command(
                            [sys.executable, "-m", "tools.pipeline", gate]
                        ),
                    )
                    for gate in ("review", "lint", "test", "prove")
                ],
                (
                    "build",
                    lambda: command([sys.executable, "-m", "tools.pipeline", "build"]),
                ),
                (
                    "integration",
                    lambda: command(
                        [sys.executable, "-m", "tools.pipeline", "integration"]
                    ),
                ),
                (
                    "coverage",
                    lambda: command(
                        [sys.executable, "-m", "tools.pipeline", "coverage"]
                    ),
                ),
                ("evidence", lambda: evidence(commit, report)),
            ]:
                reached.add(name)
                run_stage(report, name, action)
            reached.add("artifact")
            run_stage(report, "artifact", lambda: source_manifest(commit, report))
            bundle = report.directory / f"{run_id}-images.tar"
            manifests = {}

            def stage_deploy(environment: str, mode: str) -> None:
                manifest = manual_release.deploy_verified_revision(
                    profile["release_config"],
                    environment,
                    commit,
                    bundle_path=bundle,
                    image_mode=mode,
                )
                if not isinstance(manifest, dict) or manifest.get("commit") != commit:
                    raise RuntimeError("Deployment returned no image manifest")
                if (
                    not isinstance(manifest.get("images"), dict)
                    or not manifest["images"]
                ):
                    raise RuntimeError("Deployment image evidence is incomplete")
                if manifest.get("bundle_sha256") != digest(bundle):
                    raise RuntimeError("Deployed image bundle digest differs")
                manifests[environment] = manifest
                report.artifact(
                    environment + "_bundle_sha256", manifest["bundle_sha256"]
                )
                report.artifact(
                    environment + "_images_sha256",
                    hashlib.sha256(
                        json.dumps(manifest["images"], sort_keys=True).encode()
                    ).hexdigest(),
                )
                if (
                    environment == "production"
                    and manifest["images"] != manifests["testing"]["images"]
                ):
                    raise RuntimeError("Production image IDs differ from tested images")

            reached.add("testing")
            run_stage(report, "testing", lambda: stage_deploy("testing", "save"))
            if publish:
                reached.add("production")
                run_stage(
                    report, "production", lambda: stage_deploy("production", "load")
                )
                reached.add("native")
                if profile.get("native"):
                    run_stage(report, "native", lambda: native_publish(profile))
                else:
                    report.stage("native", "skipped", "No native target requested")
                reached.add("promotion")
                run_stage(report, "promotion", lambda: manual_release.promote(commit))
            report.finish("passed")
    except (Exception, KeyboardInterrupt) as error:  # noqa: BLE001 - persist every failure
        status = (
            "blocked"
            if isinstance(error, (Blocked, UnsupportedDeployment))
            else "failed"
        )
        current = next(
            (
                item["name"]
                for item in reversed(report.data["stages"])
                if item["status"] == "running"
            ),
            None,
        )
        if current:
            report.stage(current, status, str(error)[:180])
        else:
            report.stage("preflight", status, str(error)[:180])
        report.finish(status)
    finally:
        for name in ORDER:
            if name not in reached:
                report.stage(name, "skipped", "Prerequisite was not reached")
        report.save()
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--profile", required=True)
    parser.add_argument(
        "--publish",
        action="store_true",
        help="Deploy production and promote after testing",
    )
    args = parser.parse_args()
    report = lifecycle(args.config, args.profile, args.publish)
    print(f"{report.data['status']}: {report.path}")
    return 0 if report.data["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
