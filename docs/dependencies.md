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

### Optional Redis cache

The native service-platform expansion permits Redis as disposable cache
infrastructure. The base stack continues to use PostgreSQL database caching;
accepted operations, events, leases, sessions and business state remain durable
PostgreSQL data. Redis is not the application command/event broker.

Set a separate strong `REDIS_PASSWORD` locally, then use
`docker compose -f compose.yaml -f compose.redis.yaml up -d --build`.
Set `CACHE_STORE=redis` only when explicitly selecting Redis as the default cache.
Laravel can also use its named `redis` cache store with the database default.
Keep testing and production credentials/instances separate. Redis has no published
host port, requires authentication and has bounded memory with eviction; it must
never store irreplaceable work. The PHP image includes the pinned phpredis client.
Merchant plugins receive scoped SDK APIs, not Redis credentials.

Redis cache keys for future organization-aware adapters must include organization,
principal and capability version, with bounded expiry. Permission grants must be
rechecked against PostgreSQL when workers execute; cached grants are not authority.

### Release dependency audits

Audit results are release-specific evidence, not a permanent property of the
lockfiles. The release security review runs fresh npm and Python audits. Preserve
the raw results under `test-results`; never describe a historical audit as current.

The npm installation applies narrowly scoped security fixes from
`security/dependency-patches.json` through
`scripts/apply-dependency-security-patches.mjs`. The manifest records upstream
provenance, advisory identifiers, exact package versions, original and patched
SHA-256 digests, and explicit replacements. Unknown source bytes or versions stop
installation. Both web Docker build targets run the same postinstall step.

The patches bound recursive braces AST traversal, reject additional RSA
DigestAlgorithm elements in node-forge, and backport the upstream URI decoder fix
while retaining the CommonJS contract needed by Expo Router. A scoped js-yaml
upgrade removes the vulnerable sprintf-js dependency from the NYC configuration
loader. This is maintained source remediation, not a claim that the upstream
package versions have changed or that npm's advisory database reports zero.

`tools/lifecycle/dependency_security.py` rejects unresolved advisories, verifies
installed package identities and patched bytes for every affected installed copy,
and runs `scripts/dependency-security.test.mjs`. Transitive audit findings can
only be classified as locally remediated when every underlying advisory is
verified. Missing packages, changed files, unknown advisories, malformed audit
responses and audit network failures block publication. The raw audit,
classification and regression results remain separate evidence files. Replace
these patches with compatible upstream releases when available and repeat all
compatibility and security tests; do not carry a patch to a different version
without review.

`tools/lifecycle/python_dependency_security.py` audits every exact inference lock
entry and rejects missing, skipped, duplicated, malformed or unexpected results.
The explicitly supported PyTorch CPU wheel versions are queried using their base
upstream version because the advisory service does not index the `+cpu` suffix.
The installed lock is unchanged by this query: evidence records both the installed
and queried versions and the lock digest. Unknown local-version mappings fail
closed. Raw audit output and classification are retained separately. A successful
scanner exit alone is insufficient evidence when any package was skipped.

The inference image uses the official PyTorch 2.13.0 CPU build. Model loading
requires safetensors and disables remote model/tokenizer code; unavailable safe
weights cause startup to fail instead of falling back to pickle checkpoints.

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
