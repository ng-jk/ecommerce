# Implementation plan: verified asynchronous commerce

Next expansion: [Shopify-style scope, payment design, delegation and completion gates](shopify-expansion-plan.md).

Current implementation evidence and remaining work: [refactor status](refactor-status.md).
The baseline below describes the starting point, not the current code.

Status: planned. This document records the requested upgrade; it does not mark
the upgrade complete. [Engineering specification](engineering-spec.md) is normative.
The [mandatory CRUD rules](crud-rules.md) apply throughout all phases. Inventory
existing CRUD gaps in phase 1; implement database constraints, indexed filters,
soft deletion, validation normalization, and upload transactions in phase 2;
implement shared standalone Create/Edit forms and model-provided enum metadata
in phase 3; verify every CRUD rule in phase 4. Framework-table soft deletion and
the API adaptation of the Inertia error contract must remain explicit decisions.

## Baseline

- Laravel API and PostgreSQL exist, with transactional synchronous checkout.
- Three Expo apps enable `strict: true`; shared storefront code needs separation
  into domain, data, and presentation layers.
- A legacy GitHub Actions workflow existed for verification and deployment wiring.
  It is removed under the manual-only release policy. The Python pipeline remains
  operator-invoked; a push or pull request does not start CI or deployment.
- Existing API/browser/concurrency tests are useful regression coverage, not
  evidence that the new architecture or all logic meets this specification.
- Initial size inventory found oversized `package-lock.json`,
  `backend/composer.lock`, `docs/openapi.json`, and
  `packages/api-client/schema.d.ts`. The review scanner must count blank lines too.
  Binary images must not be interpreted as text.

## Phase 1 — Contracts and executable review gates

1. Add modular `tools/pipeline/` Python orchestration with a small entrypoint,
   typed configuration, subprocess runner, reports, and unit tests.
2. Add file-size/boundary/strict-config checks and record baseline violations.
   Baseline reporting must not masquerade as a passing final compliance gate.
3. Split OpenAPI into supported source modules and generate split client types.
   The line limit applies only to authored logic; preserve tool-managed lockfiles.
4. Create rule, state-transition, screen, and primary-control inventories.
5. Specify versioned async command/result schemas, error mapping, polling,
   expected-version handling, idempotency, queue bounds, and retention.

Exit: review gates detect deliberate violations, contracts are reviewed, and
every migration item has an owner/evidence field in the requirement inventory.

## Phase 2 — PostgreSQL workflow engine

1. Add durable operation/inbox, outbox/jobs, audit, and versioned aggregate tables
   with tenant-aware constraints and idempotency uniqueness.
2. Introduce thin ingress, operation authorization, worker handlers, leases,
   fencing, bounded retries, dead-letter inspection, and metrics.
3. Move business reads and mutations to workers, including customer and admin
   flows. Keep transport/security rejection, polling, and health checks at ingress.
4. Model account/cart/checkout/order/admin states separately and enforce guards
   at execution time. Preserve transactional stock and money invariants.
5. Configure PostgreSQL-backed sessions/cache/queue; document the storage
   interpretation and measure contention before any cache optimization.
6. Add worker/scheduler containers, graceful shutdown and operational health checks.

Exit: real PostgreSQL crash/retry/concurrency tests demonstrate durable acceptance,
idempotent effects, state validation, isolation, and safe rejection. No client is
switched to async until the matching contract and worker are available.

## Phase 3 — Frontend layers and navigation

Target per-app organization (shared packages mirror it):

```text
src/
  app/                    Thin Expo route adapters
  domain/                 Use cases, value types, repository interfaces
  data/
    api/                  Runtime schemas, transport, operation polling
    cache/                TTL, invalidation, account/shop partitioning
    storage/              Web/native persistence adapters
    repositories/         Domain interface implementations
  presentation/
    screens/              Main/temp metadata and screen components
    navigation/           Central history policy and native/web adapters
    view-models/          Use-case binding and display state
    components/           Reusable rendering and controls
  composition/            Dependency wiring
```

1. Extract and test domain use cases before replacing shared UI state.
2. Implement validated transport, complete HTTP handling, safe retries, cache,
   storage, operation resume, and logout/shop-switch cleanup.
3. Register every screen and primary control; redesign screens over seven controls.
4. Implement main-only durable history and temp state handling across platforms.
5. Migrate each storefront and admin incrementally; add architecture enforcement
   and type-aware lint without broad suppressions.

Exit: all apps consume the async API, satisfy import/strict-mode checks, and pass
main/temp navigation, control-count, offline, timeout, and data-isolation tests.

## Phase 4 — Lean and adversarial verification

1. Add `formal/` with pinned Lean/Lake versions, executable state models,
   invariant definitions, proof modules, and required-theorem manifest.
2. Prove R10 obligations with explicit assumptions and axiom audits.
3. Implement Python model-based raw API tests and differential trace replay.
   The implementation and reference model must not share the same decision code.
4. Add fault injection, multiple workers, adversarial identities/payloads, boundary
   arithmetic, bounded exhaustive transition exploration, and randomized sequences.
5. Add unit/API functional coverage gates for all owned logic, including Python tooling,
   client retry/cache rules, and presentation view models.

Exit: all required theorems compile without proof holes; reports map every business
rule to implementation, tests, and proofs where applicable. Clearly report the
remaining model-to-implementation verification boundary.

## Phase 5 — Reproducible delivery

1. Use Python subcommands for review, lint, test, prove, build, deploy, smoke, and
   rollback. Operators invoke them manually; GitHub Actions does not schedule or
   execute these commands.
2. Build immutable images once per verified commit; store a digest-based release
   manifest and reports. Enforce serial deployment and bounded build concurrency.
3. Provision separate testing and production configuration, secrets, registry
   access, domain/TLS settings, and authenticated host access through environment
   settings. Use `testing` for the isolated test host and `deployment/main` for
   production. Keep `developement` local-only.
4. Deploy database-compatible migrations, API/workers/scheduler, and all three web
   apps; smoke-test real operation completion and perform a rollback rehearsal.
5. Add separately configured native build/distribution jobs and platform testing.

Exit: an explicitly verified commit can be manually deployed to the isolated test
host and, after separate operator promotion to `deployment/main`, manually deployed
to production. Testing never promotes automatically. A failed rollout can recover
without losing accepted operations or orders.

## Configuration decisions needed before affected phases

- Confirm PostgreSQL-backed caching as the intended “memory storage” behavior.
- Deployment and release remain on hold until the manual Python gates pass and the
  separate testing/production hosts, registry access, secrets and verified SSH
  host identities are provisioned.
- Review the primary-control counting convention, especially repeated list rows.
- Do not put secret values in these docs. Domain and branch assignments are
  recorded in [deployment.md](deployment.md); host, registry, secret references,
  and verified SSH host identities remain deployment prerequisites.
- Define native signing/distribution destinations before activating native release.

These do not prevent work on independent contracts, tests, or architectural gates.
They must not be silently guessed and reported as fulfilled requirements.
