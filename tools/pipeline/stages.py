"""Verification stages with isolated PostgreSQL and fail-closed quality gates."""

import json
import os
import secrets
import shlex
import subprocess
import sys

from .backend_coverage import require_complete_coverage
from .runner import ROOT, npm, run

COMPOSE = [
    "docker",
    "compose",
    "-p",
    "commerce-tests",
    "-f",
    "compose.yaml",
    "-f",
    "compose.test.yaml",
]


def test_environment() -> None:
    # Compose reads the existing local configuration without exposing its values.
    if (ROOT / ".env").is_file():
        return
    os.environ.setdefault(
        "APP_KEY", "base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    )
    os.environ.setdefault("DB_PASSWORD", "commerce-isolated-test-password")


def build() -> None:
    test_environment()
    for service in ("backend", "fashion", "electronics", "admin"):
        run([*COMPOSE, "build", service], timeout=1200)


def integration() -> None:
    test_environment()
    run([*COMPOSE, "up", "-d", "--no-build", "--wait", "db", "backend"], timeout=180)
    run([*COMPOSE, "exec", "-T", "backend", "php", "artisan", "migrate", "--force"])
    run([*COMPOSE, "exec", "-T", "backend", "php", "artisan", "db:seed", "--force"])
    run([*COMPOSE, "up", "-d", "--no-build", "--wait"], timeout=180)
    run([sys.executable, "-m", "pytest", "tests/api", "-q"])


def browser() -> None:
    run(npm("exec", "--", "playwright", "test"), timeout=300)


def backend_test(*arguments: str) -> None:
    (ROOT / "test-results/php").mkdir(parents=True, exist_ok=True)
    run(
        [
            "docker",
            "run",
            "--rm",
            "--network",
            "none",
            "--mount",
            f"type=bind,source={ROOT / 'test-results/php'},target=/reports",
            "-e",
            "APP_KEY=base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            "commerce-testing",
            "php",
            "artisan",
            "test",
            "--compact",
            *arguments,
        ]
    )


def test() -> None:
    run([sys.executable, "-m", "pytest", "tests/pipeline", "tests/inference", "-q"])
    run(npm("exec", "--", "vitest", "run"))
    run(
        [
            "docker",
            "build",
            "--target",
            "testing",
            "-f",
            "docker/backend/Dockerfile",
            "-t",
            "commerce-testing",
            ".",
        ],
        timeout=1200,
    )
    backend_test()


def coverage() -> None:
    run(
        npm(
            "exec",
            "--",
            "vitest",
            "run",
            "--coverage",
            "--coverage.thresholds.lines=100",
            "--coverage.thresholds.functions=100",
            "--coverage.thresholds.branches=100",
            "--coverage.thresholds.statements=100",
        )
    )
    run(
        [
            sys.executable,
            "-m",
            "pytest",
            "tests/pipeline",
            "--cov=tools.pipeline",
            "--cov-branch",
            "--cov-report=json:test-results/python-coverage.json",
            "--cov-fail-under=100",
        ]
    )
    run(
        [
            sys.executable,
            "-m",
            "pytest",
            "tests/inference",
            "--cov=backend/inference",
            "--cov-branch",
            "--cov-report=json:test-results/inference-coverage.json",
            "--cov-fail-under=100",
        ]
    )
    backend_test("--coverage-clover=/reports/sqlite.xml")
    test_environment()
    run([*COMPOSE, "up", "-d", "--wait", "db"])
    sql = [*COMPOSE, "exec", "-T", "db", "psql", "-U", "commerce", "-d", "postgres"]
    exists = run(
        [*sql, "-Atc", "SELECT 1 FROM pg_database WHERE datname = 'commerce_unit'"]
    ).strip()
    if not exists:
        run([*sql, "-c", "CREATE DATABASE commerce_unit"])
    run(
        [
            *COMPOSE,
            "run",
            "--rm",
            "--no-deps",
            "unit-tests",
            "php",
            "vendor/bin/phpunit",
            "--configuration=phpunit.pgsql.xml",
            "--coverage-clover=/reports/pgsql.xml",
        ]
    )
    folder = ROOT / "test-results/php"
    require_complete_coverage(
        [folder / "sqlite.xml", folder / "pgsql.xml"], folder / "coverage.json"
    )


def mutation() -> None:
    run(npm("exec", "--", "stryker", "run"), timeout=1800)
    run(
        [
            "docker",
            "run",
            "--rm",
            "--network",
            "none",
            "-e",
            "APP_KEY=base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            "commerce-testing",
            "vendor/bin/infection",
            "--threads=2",
            "--min-msi=100",
            "--min-covered-msi=100",
        ],
        timeout=1800,
    )
    command = [sys.executable, "-m", "pytest", "tests/pipeline", "-q"]
    quoted = (
        subprocess.list2cmdline(command) if os.name == "nt" else shlex.join(command)
    )
    config = ROOT / "test-results/cosmic.toml"
    config.write_text(
        '[cosmic-ray]\nmodule-path = "tools/pipeline"\ntimeout = 60\n'
        + "test-command = "
        + json.dumps(quoted)
        + '\n[cosmic-ray.distributor]\nname = "local"\n',
        encoding="utf-8",
    )
    session = ROOT / f"test-results/cosmic-{secrets.token_hex(8)}.sqlite"
    cosmic = [sys.executable, "-m", "cosmic_ray.cli"]
    run([*cosmic, "init", str(config), str(session)])
    run([*cosmic, "baseline", str(config), str(session)])
    run([*cosmic, "exec", str(config), str(session)], timeout=3600)
    results = [
        json.loads(line) for line in run([*cosmic, "dump", str(session)]).splitlines()
    ]
    if not results or any(
        not result or result.get("test_outcome") != "killed" for _, result in results
    ):
        raise RuntimeError(
            "Python mutation gate has surviving, incomplete, or invalid mutants"
        )


def lint() -> None:
    run(npm("run", "typecheck"))
    run(npm("run", "lint", "--", "--max-warnings=0"))
    run(npm("exec", "--", "tsc", "--noEmit", "-p", "tsconfig.tests.json"))
    run(
        [
            sys.executable,
            "-m",
            "ruff",
            "check",
            "tools/pipeline",
            "tests/pipeline",
            "tests/api",
            "tests/inference",
            "backend/inference",
        ]
    )
    run(npm("run", "api:types"))
    run(
        [
            "git",
            "-c",
            f"safe.directory={ROOT.as_posix()}",
            "diff",
            "--exit-code",
            "--",
            "packages/api-client/generated",
            "packages/api-client/schema.d.ts",
        ]
    )
