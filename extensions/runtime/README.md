# Independent backend plugin runtime (contract 1)

This service executes reviewed Python ZIP packages inside bounded Docker containers. A package is reusable across companies; each installation has its own tenant-bound storage namespace. The provided packaging/discount example computes a **proposal**. It is not wired into core checkout and cannot change an order or declare its totals authoritative.

## Trust boundary

The API and worker are trusted plugin-service control-plane processes. They own a separate PostgreSQL database and migrations (`schema.sql`). They must never receive core database credentials. Only the worker receives the Docker socket; it has host-level authority and must run on a dedicated plugin execution host, away from the core service. The package receives neither socket, credentials, registry, host bind mounts nor network. Its only platform data interface is newline JSON SDK RPC over stdin/stdout. `storage.get` and `storage.set` are allowlisted; tenant, installation, caller, package and grants are supplied by an authenticated immutable registry binding, never script arguments. Unknown methods and additional identity fields are rejected. No core SDK write capability is currently exposed.

Every invocation uses a digest-pinned, preloaded Python image with explicit seccomp allowlist, network disabled, read-only root, unprivileged user, dropped capabilities, no new privileges, no host mounts, a 4 MiB temporary filesystem, 64 MiB memory, 0.5 CPU, 16 processes, 64 file descriptors and a ten-second deadline. Containers are force-removed after every attempt. There is no Python AST sandbox and no fallback that executes a package on the host. Docker/Linux kernel isolation is a trust assumption, not a formal proof of containment. The seccomp profile and image must pass the real Linux functional gate on the chosen architecture before approval.

## Approval and deployment

Build the reference package with `python -m extensions.runtime.package /approved/packaging-pricing.zip`. Review the exact bytes and manifest before recording its printed SHA256 in an operator-owned registry copied from `registry.example.json`. Keep registry and package directory read-only to service users. Enable individual installations only after review; bind strong random caller token hashes separately to each installation. Approval is not granted by uploading a ZIP or by a manifest claim. Package validation rejects digest drift, traversal, symlinks, duplicate paths, oversized archives, unsupported contracts, operations and grants. ZIP contents are only interpreted by the sandbox.

Configure `PLUGIN_DATABASE_URL`, `PLUGIN_DATABASE_PASSWORD`, `PLUGIN_APPROVED_DIRECTORY`, `PLUGIN_SERVICE_IMAGE`, `PLUGIN_PYTHON_IMAGE`, `PLUGIN_DOCKER_CLI_IMAGE`, `PLUGIN_SANDBOX_IMAGE` and `PLUGIN_POSTGRES_IMAGE` for `compose.plugin.yaml`. Use immutable reviewed image digests, preload the sandbox image on the worker's daemon, then build/start through the operator release flow. The compose service exposes API only on loopback; a production TLS reverse proxy must enforce connection/concurrency/rate limits. Run separate Compose project names, registry directories, databases and tokens for dedicated company instances. Shared instances use distinct installation records and composite tenant/installation storage keys.

## HTTP and worker contract

`POST /v1/installations/{installation}/operations` requires `Authorization: Bearer <token>`, `Idempotency-Key`, and `Content-Type: application/json`:

```json
{"operation":"quote.adjustments","input":{"subtotal_minor":10000,"currency":"MYR"}}
```

Ingress validates/authenticates then atomically commits a logged operation and a transactional notification before returning 202 with an authorized polling URL. A 202 receipt is not an executed quote. Poll `GET /v1/installations/{installation}/operations/{id}` with the same caller authorization. Each worker claims durable work using `FOR UPDATE SKIP LOCKED`, attempts and a lease/fence. `LISTEN/NOTIFY` is only a wakeup; durable scans recover missed signals. It validates the binding and ZIP again at execution, and rechecks revocation before every SDK request and final result. Script execution happens with no database transaction held. Individual storage calls use short fenced transactions and durable sequence receipts; worker-crash replay cannot repeat a recorded storage write. At most three lease-expired claims are allowed. Script/contract errors are terminal; no automatic replay of arbitrary external side effects is promised.

Results contain `authority: requires_core_validation`. A future core integration must bind the request to an authoritative cart/version, invoke outside core transactions, then recheck cart/version, approved installation, currency, bounds and business policy in the core worker transaction before applying any proposal. This required core integration remains pending.

The storage API supports 8 KiB values, 1,000 keys per installation, 32 RPC calls per invocation and 20 outstanding operations per installation. Idempotency records are retained without automatic expiry; configure an explicit audited retention policy before long-term production use. Storage writes commit independently of the proposal: a rejected proposal does not roll back earlier SDK calls. SDK replay receipts preserve the first recorded read/write result at a sequence number and reject divergent replays.

## Verification and current limits

Unit gate: `python -m pytest tests/extensions/test_runtime.py --cov=extensions.runtime --cov-branch --cov-fail-under=100`. Real gate: `python -m pytest tests/extensions/test_runtime_functional.py` with a disposable PostgreSQL database named `plugin_runtime_test`, `PLUGIN_TEST_DATABASE_URL`, and preloaded digest-pinned `PLUGIN_TEST_SANDBOX_IMAGE`. Missing prerequisites fail the real gate explicitly; mocked subprocess/SQL tests do not establish kernel isolation or PostgreSQL correctness. Local Docker was unavailable while this implementation was authored. No production activation, core checkout integration, or successful real sandbox execution is asserted by this document.

Further acceptance work includes production proxy abuse limits, monitored retention/recovery, database least-privilege provisioning, schema upgrade/rollback testing, and core integration with authoritative pricing. Universal Eloquent/CRUD conventions do not apply automatically to this independent Python service; its tables carry timestamps and soft-delete metadata, but no end-user restore/delete API is exposed.
