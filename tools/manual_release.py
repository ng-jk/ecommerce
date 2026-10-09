"""Explicit, manual SSH release; never invoked by hosted CI or import."""

import argparse
import hashlib
import json
import os
import re
import shlex
import subprocess
import tarfile
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
GATES = ["review", "lint", "test", "prove", "integration", "coverage"]
BRANCHES = {"production": "deployment", "testing": "testing"}


def run(args, *, cwd=ROOT, input=None):
    environment = os.environ.copy()
    if args[0] == "git":
        environment.update(
            {
                "GIT_CONFIG_COUNT": "1",
                "GIT_CONFIG_KEY_0": "safe.directory",
                "GIT_CONFIG_VALUE_0": ROOT.as_posix(),
            }
        )
    result = subprocess.run(
        args,
        cwd=cwd,
        input=None if input is None else input.encode("utf-8"),
        capture_output=True,
        text=False,
        timeout=3600,
        check=False,
        env=environment,
    )
    if result.returncode:
        # Remote commands can include operational configuration; never print stdout/stderr.
        raise RuntimeError(f"{args[0]} failed with exit code {result.returncode}")
    return result.stdout.decode("utf-8").strip()


def configuration(path, environment):
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    if set(raw) != {"production", "testing"}:
        raise ValueError(
            "Configuration must describe isolated production and testing environments"
        )
    for name, value in raw.items():
        for key, pattern in {
            "host": r"[A-Za-z0-9][A-Za-z0-9.-]*",
            "user": r"[a-z_][a-z0-9_-]*",
            "project": r"[a-z][a-z0-9_-]*",
            "database": r"[a-z_][a-z0-9_]*",
            "database_user": r"[a-z_][a-z0-9_]*",
            "directory": r"/[A-Za-z0-9/_.-]+",
            "env_file": r"/[A-Za-z0-9/_.-]+",
        }.items():
            if not isinstance(value.get(key), str) or not re.fullmatch(
                pattern, value[key]
            ):
                raise ValueError(f"Invalid {name}.{key}")
        if any(
            ".." in value[key].split("/") or value[key] == "/"
            for key in ["directory", "env_file"]
        ):
            raise ValueError("Remote paths must be dedicated absolute paths")
        if (
            type(value.get("port", 22)) is not int
            or not 1 <= value.get("port", 22) <= 65535
        ):
            raise ValueError("Invalid SSH port")
        for key in ["identity_file", "known_hosts"]:
            if (
                not Path(value.get(key, "")).is_file()
                or not Path(value[key]).stat().st_size
            ):
                raise ValueError(f"{key} must be an existing nonempty local file")
        container = value.get("database_container", "supabase-db")
        if not isinstance(container, str) or not re.fullmatch(
            r"[A-Za-z0-9][A-Za-z0-9_.-]*", container
        ):
            raise ValueError("Invalid database container")
        profiles = value.get("profiles", [])
        if not isinstance(profiles, list) or any(
            profile != "assistant" for profile in profiles
        ):
            raise ValueError("Only the assistant Compose profile is supported")
        if type(value.get("sudo_docker", False)) is not bool:
            raise ValueError("sudo_docker must be a boolean")
        if not isinstance(value.get("image_prefix", "shop3i"), str) or not re.fullmatch(
            r"[a-z][a-z0-9_-]{0,47}", value.get("image_prefix", "shop3i")
        ):
            raise ValueError("Invalid image_prefix")
        worker_url = urlsplit(value.get("worker_readiness_url", ""))
        if (
            worker_url.scheme != "https"
            or not worker_url.hostname
            or worker_url.username
            or worker_url.password
            or not worker_url.path.endswith("/products")
        ):
            raise ValueError("Provide an HTTPS anonymous catalog worker_readiness_url")
        urls = value.get("readiness_urls")
        if not isinstance(urls, list) or not urls:
            raise ValueError("HTTPS readiness URLs are required")
        for url in urls:
            parsed = urlsplit(url)
            if (
                parsed.scheme != "https"
                or not parsed.hostname
                or parsed.username
                or parsed.password
                or parsed.fragment
            ):
                raise ValueError("Readiness URLs must use HTTPS without credentials")
        if worker_url.netloc not in {urlsplit(url).netloc for url in urls}:
            raise ValueError("Worker probe origin must be among readiness origins")
        if type(value.get("backward_compatible_migrations", False)) is not bool:
            raise ValueError("Migration compatibility must be explicit boolean")
    prod, test = raw["production"], raw["testing"]
    if prod["host"] == test["host"] and any(
        prod[k] == test[k] for k in ["directory", "env_file", "project"]
    ):
        raise ValueError(
            "Testing must use separate directory, secrets and Compose project"
        )
    if prod["database"] == test["database"]:
        raise ValueError("Testing must use a separate database")
    if prod.get("image_prefix", "shop3i") != test.get("image_prefix", "shop3i"):
        raise ValueError("Testing and production must use the same image_prefix")
    if {urlsplit(url).netloc for url in prod["readiness_urls"]} & {
        urlsplit(url).netloc for url in test["readiness_urls"]
    }:
        raise ValueError("Testing and production cannot share readiness URLs")
    return raw[environment]


def verified_commit(environment, runner=run, *, expected_branch=None):
    if environment not in BRANCHES:
        raise ValueError("Choose production or testing explicitly")
    branch = expected_branch or BRANCHES[environment]
    if runner(["git", "branch", "--show-current"]) != branch:
        raise ValueError(f"Check out {branch} before deploying {environment}")
    if runner(["git", "status", "--porcelain"]):
        raise ValueError("Deployment requires a clean committed checkout")
    commit = runner(["git", "rev-parse", "HEAD"])
    if not re.fullmatch(r"[a-f0-9]{40}", commit):
        raise ValueError("Invalid Git commit")
    report = json.loads(
        (ROOT / "test-results/verified.json").read_text(encoding="utf-8")
    )
    if report.get("commit") != commit or report.get("gates") != GATES:
        raise ValueError("Run every verification gate for this exact commit first")
    return commit


def ssh(config):
    return [
        "ssh",
        "-F",
        "none",
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "IdentitiesOnly=yes",
        "-o",
        "UserKnownHostsFile=" + str(Path(config["known_hosts"]).resolve()),
        "-i",
        str(Path(config["identity_file"]).resolve()),
        "-p",
        str(config.get("port", 22)),
        config["user"] + "@" + config["host"],
    ]


def archive(commit, target, runner=run):
    runner(["git", "archive", "--format=tar", "--output=" + str(target), commit])
    with tarfile.open(target) as source:
        for entry in source.getmembers():
            name = Path(entry.name).name.lower()
            if (
                name == ".env"
                or (name.startswith(".env.") and not name.endswith(".example"))
                or name.endswith((".pem", ".key"))
            ):
                raise ValueError(
                    "Tracked secret-like files must not enter release archives"
                )
            if entry.name.startswith("/") or ".." in Path(entry.name).parts:
                raise ValueError("Unsafe archive path")


def remote_script(config, commit, *, image_mode="build", bundle_sha256=None):
    if image_mode not in {"build", "save", "load"}:
        raise ValueError("Invalid image mode")
    if image_mode == "load" and not re.fullmatch(r"[a-f0-9]{64}", bundle_sha256 or ""):
        raise ValueError("Image bundle digest is required")
    q = shlex.quote
    directory = config["directory"]
    release = directory + "/releases/" + commit
    profile_flags = (
        " --profile assistant" if "assistant" in config.get("profiles", []) else ""
    )
    compose = (
        (
            'sudo -n env RELEASE_ID="$RELEASE_ID" COMPOSE_PARALLEL_LIMIT=1 docker'
            if config.get("sudo_docker", False)
            else "docker"
        )
        + " compose --project-name "
        + q(config["project"])
        + " --env-file "
        + q(config["env_file"])
        + " -f compose.server.yaml"
        + profile_flags
    )
    probes = " &&\n".join(
        'test "$(curl --fail --silent --show-error --max-time 20 --retry 5 --retry-delay 3 --retry-all-errors --proto =https --tlsv1.2 --output /dev/null --write-out "%{http_code}" '
        + q(url)
        + ')" = 200'
        for url in config["readiness_urls"]
    )
    docker = "sudo -n docker" if config.get("sudo_docker", False) else "docker"
    image_prefix = config.get("image_prefix", "shop3i")
    images = [
        f"{image_prefix}/{service}:{commit}"
        for service in ("backend", "fashion", "electronics", "admin")
    ]
    if "assistant" in config.get("profiles", []):
        images.append(f"{image_prefix}/functiongemma:{commit}")
    bundle = directory + "/images-" + commit + ".tar"
    if image_mode == "load":
        image_step = (
            'test "$(sha256sum '
            + q(bundle)
            + " | cut -d ' ' -f1)\" = "
            + q(bundle_sha256)
            + "\n"
            + docker
            + " load -i "
            + q(bundle)
        )
    else:
        image_step = compose + " build"
        if image_mode == "save":
            image_step += (
                "\n"
                + docker
                + " save "
                + " ".join(q(image) for image in images)
                + " > "
                + q(bundle)
            )
            image_step += "\ntest -s " + q(bundle)
    image_audit = "\n".join(
        "printf 'IMAGE_ID "
        + image
        + " '; "
        + docker
        + " image inspect --format '{{.Id}}' "
        + q(image)
        for image in images
    )
    backup_directory = directory + "/backups"
    rollback = ""
    if config.get("backward_compatible_migrations", False):
        rollback = f'if [ -n "$previous" ] && [ -d "$previous" ]; then cd "$previous"; export RELEASE_ID="$(basename "$previous")"; {compose} up -d --no-build --wait; fi'
    return f"""set -eu
umask 077
mkdir -p {q(directory + "/releases")}
exec 9>{q(directory + "/.deploy.lock")}
flock -n 9
previous="$(readlink {q(directory + "/current")} || true)"
mkdir -p {q(release)}
(umask 022; tar -xf {q(directory + "/upload-" + commit + ".tar")} -C {q(release)})
cd {q(release)}
export RELEASE_ID={q(commit)}
export APP_IMAGE_PREFIX={q(image_prefix)}
export COMPOSE_PARALLEL_LIMIT=1
{compose} config --quiet
{compose} config --format json | python3 tools/release_guard.py {q(config["database"])} {q(config["database_user"])} {q(config["worker_readiness_url"])} {" ".join(q(url) for url in config["readiness_urls"])}
{image_step}
{compose} run --rm --no-deps -T --interactive=false backend php artisan --version </dev/null
mkdir -p {q(backup_directory)}
backup={q(backup_directory + "/" + commit)}-$(date +%Y%m%dT%H%M%S).dump
{docker} exec {q(config.get("database_container", "supabase-db"))} pg_dump -U supabase_admin -d {q(config["database"])} -Fc > "$backup"
test -s "$backup"
{docker} exec -i {q(config.get("database_container", "supabase-db"))} pg_restore --list < "$backup" > /dev/null
if ! ( {compose} stop -t 40 worker &&
{compose} run --rm --no-deps -T --interactive=false backend php artisan migrate --force </dev/null &&
{compose} run --rm --no-deps -T --interactive=false backend php artisan db:seed --class=ShopSeeder --force </dev/null &&
{compose} up -d --no-build --wait &&
{probes} &&
python3 tools/release_probe.py {q(config["worker_readiness_url"])}
); then
{rollback or 'echo "Deployment failed; migration compatibility unconfirmed, retaining state for operator recovery." >&2'}
exit 1
fi
{image_audit}
ln -sfn {q(release)} {q(directory + "/current")}
printf '%s\\n' {q(commit)}
"""


def git_authenticated(args, runner=run):
    # Retry same authorized operation up to three times with existing credentials.
    attempt = 0
    while True:
        attempt += 1
        try:
            return runner(args)
        except RuntimeError:
            if attempt == 3:
                raise


def promote(commit, runner=run):
    remote = runner(["git", "remote", "get-url", "origin"])
    if remote not in [
        "https://github.com/ng-jk/ecommerce.git",
        "git@github.com:ng-jk/ecommerce.git",
    ]:
        raise ValueError("origin must be the configured ng-jk/ecommerce repository")
    remote_ref = git_authenticated(
        ["git", "ls-remote", "origin", "refs/heads/main"], runner
    )
    if remote_ref:
        git_authenticated(["git", "fetch", "origin", "main"], runner)
        remote_main = runner(["git", "rev-parse", "FETCH_HEAD"])
        runner(["git", "merge-base", "--is-ancestor", remote_main, commit])
    previous = runner(["git", "rev-parse", "refs/heads/main"])
    runner(["git", "merge-base", "--is-ancestor", previous, commit])
    runner(["git", "update-ref", "refs/heads/main", commit, previous])
    attempt = 0
    while True:
        attempt += 1
        try:
            runner(["git", "push", "origin", "refs/heads/main:refs/heads/main"])
            return
        except RuntimeError:
            # A failed transport may already have updated GitHub; inspect before retry.
            result = git_authenticated(
                ["git", "ls-remote", "origin", "refs/heads/main"], runner
            )
            if result.split() and result.split()[0] == commit:
                return
            if attempt == 3:
                raise


def _scp(config, source, destination):
    return [
        "scp",
        "-F",
        "none",
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "IdentitiesOnly=yes",
        "-o",
        "UserKnownHostsFile=" + str(Path(config["known_hosts"]).resolve()),
        "-i",
        str(Path(config["identity_file"]).resolve()),
        "-P",
        str(config.get("port", 22)),
        source,
        destination,
    ]


def _image_ids(output, commit, config):
    prefix = config.get("image_prefix", "shop3i")
    expected = {
        f"{prefix}/{service}:{commit}"
        for service in ("backend", "fashion", "electronics", "admin")
    }
    if "assistant" in config.get("profiles", []):
        expected.add(f"{prefix}/functiongemma:{commit}")
    found = {}
    for line in output.splitlines():
        if line.startswith("IMAGE_ID "):
            match = re.fullmatch(
                r"IMAGE_ID ([a-z0-9_/-]+:[a-f0-9]{40}) (sha256:[a-f0-9]{64})", line
            )
            if not match or match.group(1) in found:
                raise RuntimeError("Invalid or duplicate remote image evidence")
            found[match.group(1)] = match.group(2)
    if found != {name: found.get(name) for name in expected} or any(
        value is None for value in found.values()
    ):
        raise RuntimeError("Remote image evidence is incomplete")
    return found


def _file_digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def _deploy_commit(
    config_path,
    environment,
    commit,
    runner=run,
    *,
    bundle_path=None,
    image_mode="build",
):
    config = configuration(config_path, environment)
    connection = ssh(config)
    with tempfile.TemporaryDirectory(prefix="commerce-release-") as temp:
        tar = Path(temp) / "source.tar"
        archive(commit, tar, runner)
        runner([*connection, "mkdir -p " + shlex.quote(config["directory"])])
        remote = config["user"] + "@" + config["host"] + ":" + config["directory"]
        runner(_scp(config, str(tar), remote + "/upload-" + commit + ".tar"))
        bundle_hash = None
        if image_mode == "load":
            if bundle_path is None or not Path(bundle_path).is_file():
                raise ValueError("Verified image bundle is required")
            bundle_hash = _file_digest(bundle_path)
            runner(
                _scp(config, str(bundle_path), remote + "/images-" + commit + ".tar")
            )
        result = runner(
            [*connection, "sh -s"],
            input=remote_script(
                config, commit, image_mode=image_mode, bundle_sha256=bundle_hash
            ),
        )
        if result.splitlines()[-1:] != [commit]:
            raise RuntimeError(
                "Remote release did not acknowledge readiness for this commit"
            )
        if image_mode in {"save", "load"}:
            images = _image_ids(result, commit, config)
            if image_mode == "save":
                if bundle_path is None:
                    raise ValueError("Image bundle destination is required")
                runner(
                    _scp(
                        config, remote + "/images-" + commit + ".tar", str(bundle_path)
                    )
                )
                if (
                    not Path(bundle_path).is_file()
                    or not Path(bundle_path).stat().st_size
                ):
                    raise RuntimeError("Image bundle was not transferred")
                bundle_hash = _file_digest(bundle_path)
            return {"commit": commit, "images": images, "bundle_sha256": bundle_hash}
    return commit


def deploy(config_path, environment, runner=run):
    commit = verified_commit(environment, runner)
    _deploy_commit(config_path, environment, commit, runner)
    if environment == "production":
        promote(commit, runner)
    return commit


def deploy_verified_revision(
    config_path,
    environment,
    commit,
    runner=run,
    *,
    bundle_path=None,
    image_mode="build",
):
    """Stage the verified deployment-branch revision without promoting main.

    Used only by the one-launch lifecycle. The public manual CLI keeps its
    environment-specific branch checks and production promotion behavior.
    """
    if environment not in BRANCHES:
        raise ValueError("Choose production or testing explicitly")
    verified = verified_commit("production", runner)
    if verified != commit:
        raise ValueError("Lifecycle commit differs from verified checkout")
    return _deploy_commit(
        config_path,
        environment,
        commit,
        runner,
        bundle_path=bundle_path,
        image_mode=image_mode,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("environment", choices=BRANCHES)
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    commit = deploy(args.config, args.environment)
    print(f"{args.environment} ready at {commit}")


if __name__ == "__main__":
    main()
