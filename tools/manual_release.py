"""Explicit, manual SSH release; never invoked by hosted CI or import."""

import argparse
import json
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
    result = subprocess.run(
        args,
        cwd=cwd,
        input=input,
        capture_output=True,
        text=True,
        timeout=3600,
        check=False,
    )
    if result.returncode:
        # Remote commands can include operational configuration; never print stdout/stderr.
        raise RuntimeError(f"{args[0]} failed with exit code {result.returncode}")
    return result.stdout.strip()


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
    if {urlsplit(url).netloc for url in prod["readiness_urls"]} & {
        urlsplit(url).netloc for url in test["readiness_urls"]
    }:
        raise ValueError("Testing and production cannot share readiness URLs")
    return raw[environment]


def verified_commit(environment, runner=run):
    if environment not in BRANCHES:
        raise ValueError("Choose production or testing explicitly")
    if runner(["git", "branch", "--show-current"]) != BRANCHES[environment]:
        raise ValueError(
            f"Check out {BRANCHES[environment]} before deploying {environment}"
        )
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


def remote_script(config, commit):
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
tar -xf {q(directory + "/upload-" + commit + ".tar")} -C {q(release)}
cd {q(release)}
export RELEASE_ID={q(commit)}
export COMPOSE_PARALLEL_LIMIT=1
{compose} config --quiet
{compose} config --format json | python3 tools/release_guard.py {q(config["database"])} {q(config["database_user"])} {q(config["worker_readiness_url"])} {" ".join(q(url) for url in config["readiness_urls"])}
{compose} build
mkdir -p {q(backup_directory)}
backup={q(backup_directory + "/" + commit)}-$(date +%Y%m%dT%H%M%S).dump
{docker} exec {q(config.get("database_container", "supabase-db"))} pg_dump -U supabase_admin -d {q(config["database"])} -Fc > "$backup"
test -s "$backup"
{docker} exec -i {q(config.get("database_container", "supabase-db"))} pg_restore --list < "$backup" > /dev/null
if ! ( {compose} stop -t 40 worker &&
{compose} run --rm --no-deps backend php artisan migrate --force &&
{compose} run --rm --no-deps backend php artisan db:seed --class=ShopSeeder --force &&
{compose} up -d --no-build --wait &&
{probes} &&
python3 tools/release_probe.py {q(config["worker_readiness_url"])}
); then
{rollback or 'echo "Deployment failed; migration compatibility unconfirmed, retaining state for operator recovery." >&2'}
exit 1
fi
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


def deploy(config_path, environment, runner=run):
    config = configuration(config_path, environment)
    commit = verified_commit(environment, runner)
    connection = ssh(config)
    with tempfile.TemporaryDirectory(prefix="commerce-release-") as temp:
        tar = Path(temp) / "source.tar"
        archive(commit, tar, runner)
        runner([*connection, "mkdir -p " + shlex.quote(config["directory"])])
        scp = [
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
            str(tar),
            config["user"]
            + "@"
            + config["host"]
            + ":"
            + config["directory"]
            + "/upload-"
            + commit
            + ".tar",
        ]
        runner(scp)
        result = runner([*connection, "sh -s"], input=remote_script(config, commit))
        if result.splitlines()[-1:] != [commit]:
            raise RuntimeError(
                "Remote release did not acknowledge readiness for this commit"
            )
    if environment == "production":
        promote(commit, runner)
    return commit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("environment", choices=BRANCHES)
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    commit = deploy(args.config, args.environment)
    print(f"{args.environment} ready at {commit}")


if __name__ == "__main__":
    main()
