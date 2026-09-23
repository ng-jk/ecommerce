# Development and verification dependencies

The tool dependencies are installed. Pipeline orchestration, domain proofs,
mutation configurations, full coverage, and CRUD migration remain implementation
work; installing a tool does not mean its quality gate has passed.

## Installed tool groups

| Purpose | Tools |
| --- | --- |
| Python pipeline/API tests | Python 3.12 project venv, pytest, pytest-cov, Hypothesis, HTTPX, Psycopg binary, Pydantic |
| Python review/mutation/security | Ruff, mypy, Bandit, Cosmic Ray, pip-audit |
| TypeScript domain tests | Vitest 4.1.11, V8 coverage, fast-check |
| TypeScript review/mutation | typescript-eslint, dependency-cruiser, Stryker 10.0.0 and Vitest runner |
| Frontend runtime validation | Zod in `@portfolio/api-client` |
| Native component tests | Expo SDK-resolved Jest/Jest Expo, Jest types, React Native Testing Library in all apps |
| Browser tests | Existing Playwright and Chromium |
| PHP review/mutation | Larastan 3.12.2, PHPStan 2.2.14, Infection 0.35.4 |
| PHP testing/coverage | Existing PHPUnit/Pint; dedicated Docker testing target with Xdebug 3.5.3 |
| Formal verification | Lean 4.34.0 and bundled Lake, managed by project-local elan 4.2.4 |
| Runtime/deployment | Existing Docker/Compose, PHP 8.5, Composer, PostgreSQL, Caddy, Node, npm, system OpenSSH |

New JavaScript tooling is locked by `package-lock.json`; Composer tools are locked
by `backend/composer.lock`. Python direct dependencies are listed in
`tools/pipeline/requirements.in` and the complete environment is pinned in
`requirements.lock.txt`. The resolved lockfile was installed on Windows/Python
3.12; the Linux runner must also verify installation before release activation.

The user clarified that the 1,000-line limit applies only to authored logic.
Tool-managed npm and Composer lockfiles are outside that limit and remain intact.

## Reinstall Node and Python dependencies

From the repository root, with Node 24 and Python 3.12 available:

```powershell
npm ci
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install pip==26.2.1
.\.venv\Scripts\python.exe -m pip install -r tools/pipeline/requirements.lock.txt
.\.venv\Scripts\python.exe -m pip check
npm exec -- playwright install chromium
```

On this machine the Python used to create the venv is the bundled executable at
`C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`.
No global Python/PATH changes are required. On Linux use `.venv/bin/python`.

## PHP testing image

```sh
docker build --target testing -f docker/backend/Dockerfile -t ecommerce-portfolio-backend-testing .
docker run --rm --network none ecommerce-portfolio-backend-testing sh -c 'cp .env.example .env && php artisan key:generate --force --no-interaction && php artisan test --compact'
docker run --rm --network none ecommerce-portfolio-backend-testing php vendor/bin/phpstan --version
docker run --rm --network none ecommerce-portfolio-backend-testing php vendor/bin/infection --version
```

This generates a key only inside the disposable container and runs the existing
SQLite-isolated test suite. PostgreSQL integration tests remain separately
required. The testing target enables Xdebug coverage; production does not install
Xdebug or Composer dev dependencies. No production data or credentials are needed.

## Lean on this machine

```powershell
$env:ELAN_HOME = Join-Path (Get-Location) '.tools/elan'
& .\.tools\elan\bin\lean.exe --version
& .\.tools\elan\bin\lake.exe --version
```

`lean-toolchain` pins `leanprover/lean4:v4.34.0`. Other machines can use an existing
elan installation to install that toolchain. The project-local installer was
downloaded from the official `leanprover/elan` GitHub release v4.2.4; the Windows
ZIP SHA-256 was
`fad2e980a191c15884cc1d80d170ffc5fa84f3774541020145b66d1a644c6111`.
`.tools/` and `.venv/` are ignored by Git and Docker builds. Lean/Lake version
checks establish installation only, not completion of the planned proofs.

## Audit and scope

Python audit is clean after updating its project-local pip to 26.2.1. Composer
reported no known advisories on installation. npm retains three moderate findings
in the existing Expo Router/query-string/decode-uri-component dependency chain;
no incompatible major-version override was forced. Re-run audits as advisories
and upstream fixes change.

No Inertia runtime is installed: the applications use Expo and JSON APIs. The
[CRUD rules](crud-rules.md) explicitly retain the Inertia adapter requirement for
any future Inertia flow and define the matching Expo API error/form contract.
Laravel already provides transactions, database queues/cache, soft deletion,
pagination, filesystem storage, and PostgreSQL support; these need implementation
and configuration rather than unrelated extra packages.

Host provisioning, release credentials, native signing, and optional external
review services require environment-specific configuration before deployment.

Vitest 4.1.11 is pinned with its matching coverage package because Stryker 10
per-test selection did not execute some mutation tests correctly with Vitest 5.
The pin includes the 4.1.11 mocker security fix. Navigation mutation testing
confirmed all 32 configured mutants were detected after strengthening assertions.
