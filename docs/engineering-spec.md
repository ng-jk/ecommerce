# Engineering and code review specification

Status: required target architecture; recorded requirements, not a claim of implementation.
Companion: [implementation plan](implementation-plan.md).
Mandatory CRUD requirements: [C01–C10](crud-rules.md), applicable to every module.
Shopify-style expansion: [scope, delivery plan and acceptance](shopify-expansion-plan.md).

## Scope and requirement identifiers

This specification applies to Laravel, the fashion/electronics Expo apps, the Expo
admin app, shared packages, infrastructure, tests, and the manual Python release
tooling.
Reviewers must cite requirement identifiers and attach evidence for compliance.
Existing code is a migration baseline, not an exception to these requirements.

## R01 — File size and maintainability

- User clarification (2026-09-22): only authored logic code is limited to 1,000
  physical lines, including blank lines. This includes application code, tests,
  executable scripts, migrations and Lean logical models/proofs.
- Split logic by responsibility; never minify or join lines to bypass the limit.
- Generated code/type declarations, dependency lockfiles, documentation, assets
  and declarative configuration are outside this limit.
- Scan owned PHP, Python, TS/TSX, JS/JSX/MJS/CJS, Lean, shell and PowerShell files;
  generated directories and `.d.ts` declarations are excluded.

## R02 — Strict TypeScript and code review

- Every frontend and shared TypeScript package must be included in a checked
  TypeScript project using effective `strict: true` and `tsc --noEmit`.
- CI must inspect resolved compiler settings, including inherited settings, and
  reject disabling individual strict options or excluding production source.
- Add `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` during migration.
- Type-aware ESLint must reject unsafe `any` use, unsafe assignments/calls,
  floating promises, and unvalidated casts at external boundaries.
- Ban unexplained `ts-ignore`, `ts-nocheck`, lint disables, and type assertions
  that replace validation. Track narrow justified suppressions in review.
- Linting complements the compiler; it does not establish strict mode by itself.
- Review architecture, access control, state transitions, retry safety, migrations,
  tests, proof assumptions, and deployment compatibility on every relevant change.
- Automated review emits file/line findings and machine-readable reports. Human
  review remains responsible for design and business requirements. Optional AI
  findings are advisory and cannot approve deployment or execute PR instructions.

## R03 — Frontend dependency layers

Each app separates `domain/`, `data/`, and `presentation/`. Shared code follows the
same separation rather than putting all responsibilities into one shared component.

| Layer | Owns | Must not depend on |
| --- | --- | --- |
| Domain / logic | Use cases, state transitions, value types, repository interfaces | React, Expo, HTTP, storage implementations |
| Data | Validated API adapters, cache, local persistence, repository implementations | Screens, router, presentation components |
| Presentation | Screens, view models/hooks, rendering, user interaction | Direct fetch, direct storage, business decision implementations |

A composition root supplies data implementations to domain interfaces. Presentation
invokes use cases and renders their typed state. CI enforces import boundaries,
including aliases and shared packages. Domain tests must run without a UI or network.

## R04 — Screens and navigation

- Every routable screen, including admin, authentication, error, modal, and nested
  routes, is registered explicitly as `main` or `temp`. CI rejects unregistered
  routes and invalid navigation targets.
- `main` screens are stable navigation destinations. `temp` screens are transient
  steps such as confirmation, edit dialogs, or checkout progress.
- Back navigation must never reveal a temp screen. Cover toolbar Back, browser
  Back/Forward, Android hardware Back, iOS swipe, modal dismissal, and programmatic
  back actions. Forward/history restoration must not make a temp screen a later
  Back destination.
- Keep durable navigation history composed only of main screens. Render temp
  screens as transient state outside that history, or use a central adapter with
  equivalent tested behavior. Do not rely on isolated `router.back()` calls.
- Closing a temp screen returns to the latest permitted main screen. Direct links,
  reload, expired sessions, and empty history use a declared main fallback.
- Multi-step temp flows maintain domain state independently of route history.
  Authenticated fallbacks must remain subject to authorization.
- Each screen has at most seven primary interactive components. Count distinct
  user-action controls, including navigation, forms, filters, and primary CTAs;
  nesting controls in containers does not reduce the count.
- Repeated product/list rows count as one collection component only when they use
  a single declared interaction pattern. Independent row action types count
  separately. Label this convention in the screen inventory for review.
- Each screen declares its primary-control inventory, fallback, and allowed
  destinations. Verify rendered states at all breakpoints; split crowded screens
  into separate tasks. Loading/error/empty states must satisfy the same rule.

## R05 — Data layer contracts, cache, and retries

- Validate request parameters and runtime response payloads against versioned
  schemas. TypeScript types alone do not validate external data.
- Cover all HTTP status codes with a total result type: success, pending,
  validation, unauthenticated, forbidden, missing, conflict, throttled, server,
  unexpected status, invalid body, timeout, cancellation, and network failure.
- Explicitly handle 202 operation polling, 204 without JSON, 304 with a valid
  cache entry, malformed JSON, incorrect content types, and unexpected redirects.
- Use HTTPS outside local development. Never forward credentials to an unexpected
  origin. Expose safe messages while retaining correlation IDs for diagnostics.
- Cache keys include shop, principal, resource, parameters, and schema version.
  Define TTL, stale policy, invalidation, size bounds, and migration behavior.
- Local persistence handles corrupt/missing/full/unavailable storage. Purge
  principal-specific data on logout or account/shop changes. Never persist web
  bearer credentials in ordinary local storage; native secrets use secure storage.
- Cached UI state is never authorization or checkout authority. Refresh affected
  data after a completed operation; optimistic UI must reconcile failures.
- Bounded exponential backoff with jitter, deadlines, cancellation, and capped
  `Retry-After` handling applies to eligible network errors, 408, 429, and transient
  5xx. Do not blindly retry authorization, schema, validation, or conflict errors.
- Mutation retries reuse the original idempotency key and exact payload. Never
  create a fresh key after an ambiguous timeout. Resume operation lookup/polling.
- Operation polling has its own bounded backoff; foreground re-entry can resume
  a persisted pending operation without resubmitting a business action.

## R06 — Stateful API and authority

- PostgreSQL owns durable user/shop workflow state, cart versions, orders, admin
  actions, operation results, and audit events. Frontends and direct API callers
  have identical authority: none to override server decisions.
- Model account status, cart/checkout status, order lifecycle, admin resource
  state, and operation lifecycle separately. A single global user enum must not
  prevent a customer shopping while an earlier order is being fulfilled.
- Scope state by principal, shop, and relevant aggregate. Each aggregate has a
  version and explicit command transition rules, guards, and terminal states.
- Record actor, command, aggregate, operation ID, prior/resulting state and
  versions, timestamps, and sanitized rejection reason. Never record raw secrets.
- Every action validates identity, role, tenant, ownership, current account
  status, current aggregate state, expected version, and business invariants.
- Recheck mutable authorization and state in the worker at execution time, not
  only when the command enters the queue. Revoked access must not execute later.
- Success/pending/error envelopes include request ID, operation ID when one
  exists, processing status, and authorized workflow state/version. Unauthenticated
  and unauthorized responses must not disclose another user's state.
- Publish allowed actions as UI guidance; workers always enforce the rules again.
- Illegal transitions have no business side effects. Stale commands return a
  typed conflict with only authorized current state. Never trust client prices,
  totals, ownership IDs, roles, stock, workflow state, or completion claims.

## R07 — Database-first asynchronous processing

All business logic executes in workers, including business queries. The HTTP
ingress performs transport/security validation and durable command acceptance;
operation status retrieval and health probes are infrastructure endpoints.

1. Enforce request size/content/schema limits, authenticate, apply abuse limits,
   and check scope before accepting work. Reject malformed/unauthorized traffic
   without adding sensitive payloads to the business queue.
2. In one PostgreSQL transaction, persist an operation/inbox record and its
   queue entry or transactional outbox. Return 202 only after durable commit,
   with an operation ID and authorized polling URL.
3. A worker claims work using database locking/leases and a bounded attempt
   policy. Preserve per-aggregate ordering or reject stale expected versions.
4. In a transaction, lock relevant rows in a stable order, revalidate guards,
   apply the transition, and atomically save business effects, result, and events.
5. Mark success or a typed terminal rejection. Transient failures use bounded
   retries; exhausted failures enter an observable dead-letter state.
6. Clients retrieve the stored result via authorized operation polling. Query
   results include their snapshot/version and expire according to retention policy.

Operation states: `queued -> processing -> succeeded | rejected | failed`;
transient processing failures can return to `queued` with attempt history.
Specify lease expiration and fencing so a stale worker cannot commit after a
replacement worker takes ownership. Do not promise exactly-once delivery:
at-least-once processing must produce idempotent business effects.

Idempotency uniqueness is scoped by shop, principal, command, and key. Store a
canonical payload hash; the same key/payload returns the same operation/result,
while a different payload is a conflict. Retention must exceed supported client
retry windows; define behavior for expired keys explicitly.

Checkout locks/version-checks the cart and relevant products, validates quantities,
computes integer-money totals on the server, creates one order, and decrements
stock atomically. Direct requests, duplicate delivery, reordered actions, worker
crashes, or concurrent customers must not oversell or produce partial orders.
External side effects use a transactional outbox and provider idempotency; a
database transaction alone cannot atomically commit a third-party payment.

## R08 — PostgreSQL storage interpretation

Use PostgreSQL for the database, queue, sessions, cache, coordination, and workflow
state; no Redis dependency is planned. “PostgreSQL memory storage” is interpreted
as PostgreSQL-backed caching with database-managed memory buffers, not a separate
durable RAM-only database engine. This interpretation is an explicit design
assumption to settle before implementing storage adapters.

Use logged durable tables for inbox/jobs, idempotency, accounts, stock, carts,
orders, audit, and sessions. Cache entries have TTL and can be reconstructed.
Unlogged tables are not crash-safe and must never hold authoritative state;
even optional disposable-cache use requires a measured reason and recovery tests.
See [PostgreSQL unlogged tables](https://www.postgresql.org/about/featurematrix/detail/unlogged-tables/).

Bound queue depth, payload/result size, per-user outstanding operations, retention,
poll frequency, and retries. If PostgreSQL is unavailable, return a recoverable
service failure and never acknowledge an operation that was not durably stored.

## R09 — Tests and logic coverage

The latest user testing scope is recorded in [testing acceptance](testing-acceptance.md)
and supersedes earlier mandatory browser/native and mutation gates below.

- Inventory every business rule, guard, error branch, retry rule, and navigation
  rule; map each to tests and, where applicable, a Lean theorem.
- Target 100% statement/function/branch coverage for owned domain and data logic
  in TypeScript, PHP, and Python. Presentation view-model logic is included.
  Generated code and declarative markup are reported separately, not used to
  inflate the denominator. Unreachable branches need review and removal/proof.
- Unit and API functional tests are the required test categories. Mutation and
  browser/device tests are optional diagnostics, not required release gates.
- Run real PostgreSQL and real workers for integration and concurrency tests.
  SQLite-only tests cannot establish PostgreSQL transaction/locking correctness.
- A Python black-box harness sends raw requests without frontend protections,
  awaits operation completion, and checks response contracts plus observable
  invariants and isolated test-database state.
- Enumerate every defined state/command/role combination, permitted and rejected.
  Add property-based generated sequences, boundary values, malformed payloads,
  fuzzing, concurrency, and deterministic replay seeds.
- Cases include cross-shop IDs, guest/expired/revoked users, disabled accounts,
  customer admin attempts, forged state/prices, negative/fractional/overflow
  quantities, stale versions, duplicate keys/different payloads, reordered requests,
  parallel checkout, failed transactions, and unauthorized result polling.
- Inject crashes before/after enqueue commit, business commit, and acknowledgment;
  test expired leases, duplicate delivery, deadlocks, worker restarts, database
  outages, poison jobs, cache corruption, and retry exhaustion.
- Test all frontend HTTP outcomes, offline/timeout recovery, cache partitioning,
  logout cleanup, and navigation methods on supported browser/native platforms.
- Finite tests cannot cover every possible input and schedule. Reports must state
  the enumerated model, bounds, seeds, coverage, and remaining assumptions rather
  than claim unrestricted exhaustive testing.

## R10 — Lean proof obligations

Use Lean 4 to define executable state-transition models and prove:

- Authorized tenant-local transitions preserve ownership/isolation.
- Invalid commands preserve business state (audit/operation metadata may change).
- Stock stays nonnegative and successful checkout conserves stock/order quantities.
- Money totals follow the specified integer arithmetic and boundary rules.
- Replaying an accepted idempotency key cannot create another business effect.
- Only declared account/cart/order/admin/operation transitions are possible.
- Back-navigation resolution never returns a temp screen.

Prove invariant preservation for arbitrary finite transition sequences by
induction, not merely examples. State concurrency linearization, transaction,
authentication, and liveness assumptions explicitly. Eventual completion requires
worker/database availability and fair scheduling; safety proofs do not prove it.

Pin Lean and Lake dependencies. CI builds all required theorem modules, rejects
`sorry`/`admit`, and inspects transitive `#print axioms` output against an explicit
allowlist of Lean's standard foundational axioms. Disallow custom axioms and
unchecked native proof shortcuts in required proofs. Verify theorem existence and
signatures so deletion or replacement with a trivial proposition cannot pass.
See [Lean proof validation](https://lean-lang.org/doc/reference/latest/ValidatingProofs/).

Lean proves the formal model, not arbitrary PHP/TypeScript automatically. Maintain
a rule-to-model-to-handler mapping and run differential transition traces against
the real implementation. An end-to-end implementation correctness claim additionally
requires a verified refinement link; tests alone do not supply that proof.

## R11 — Python-orchestrated manual release pipeline

Python is the local verification and manual release orchestrator. GitHub Actions workflows are not used; pushes and pull requests do not schedule verification or deployment. The same pinned tools run locally. Use `python -m tools.pipeline verify` for the required verification gates and `python tools/manual_release.py {testing|production} --config .deploy/release.json` for deployment. The older `python -m tools.pipeline deploy` command describes a prior release design and is not the current EC2 deployment interface. The release script requires a clean checkout and a verification report tied to the exact commit.

Required gates, in order of dependency:

1. File-size inventory, dependency boundaries, route/control inventory, strict compiler configuration, formatting/lint, secret scan, dependency review.
2. Application unit tests, 100% coverage, and Python orchestrator tests.
3. Lean proof compilation, axiom audit, required theorem/signature audit.
4. PostgreSQL/worker integration, model differential tests, adversarial API and concurrency/recovery tests; fail on unexpected skipped tests.
5. API functional purchase/admin flows, API schema compatibility and generated-client drift checks. Browser/native and mutation suites remain optional.
6. Build the backend/worker and all three frontend web apps on the target EC2 host through `compose.server.yaml`; this release path does not publish images to a registry.
7. Manually deploy `testing` to its isolated environment and verify configured HTTPS and worker readiness. Production deploys only from `deployment`; after the production server passes HTTP and worker readiness, the script fast-forwards and pushes that same commit to `main`. `main` is a promotion record, not the production deploy branch. Testing never promotes or deploys to production.

PR checks have no deployment secrets or production access. The operator explicitly invokes each deploy with a private local config and verified SSH host key. Never execute untrusted PR scripts in a privileged deployment job. `developement` is the exact spelling of a local-only branch and must not be pushed or deployed.

Deployment must include backend, workers, scheduler, fashion/electronics/admin web, gateway, and database migration orchestration. Use least-privilege credentials, pinned SSH host identity, deployment serialization, health/readiness checks, and auditable release metadata. The current release tool uploads a source archive over SSH and runs `sudo docker compose -f compose.server.yaml`; it builds locally on EC2, with no public inbound 80/443 requirement and no image registry. Cloudflare Tunnel routes the public hostnames to the host's loopback-bound gateways. Supabase is a separately managed service on a private external Docker network; its configuration and secret files remain server-only.

Drain workers safely and keep command/schema compatibility across rolling versions. Use expand/contract migrations and tested backups. On failure, restore previous compatible release images when explicitly enabled; do not assume database migrations can be reversed. Verify operation completion, tenant isolation, and frontend/API compatibility after deployment. Do not roll back data independently of its release schema.

Docker deploys Expo web exports. Android/iOS require separate native build, signing, distribution, and platform test jobs; Docker web deployment does not install native apps. Signing and production credentials remain external secrets.
## R14 — Multi-agent implementation and model selection

For the Shopify-style expansion, spawn multiple subagents for independent bounded
implementation/review jobs, choosing different available models by job type.
Use gpt-6-astra for architecture, payment/security/concurrency review and Lean
model review; gpt-6-sol for backend, frontend and test implementation; use
gpt-6-luna for bounded documentation, inventories and mechanical consistency
checks. Increase model capability when the task requires it; record actual model,
scope and evidence. Never silently substitute an unavailable requested model.
The coordinating agent owns contracts, integration, cross-module verification and
the final acceptance report. Give each agent explicit file ownership; do not let
agents concurrently edit shared contracts or migrations. Delegate only independent
work, within available concurrency slots. Agent completion is not acceptance:
integrated tests, review and the evidence gates must pass. Model choice does not
change FunctionGemma 270M as the application's conversational routing model.

## R15 — Expansion parity and payment authority

Follow the linked expansion plan for the complete prior Shopify capability
inventory, Stripe-default multi-provider payments, custom invoice attestations,
UI/API/AI parity and evidence-based completion. This is a target requirement;
it supersedes the historical simulated-default payment choice when implemented.
Provider webhooks and infrastructure endpoints remain restricted machine APIs,
not customer-callable tools. All business capabilities must have authorized UI,
API and AI paths; permissions remain authoritative at worker execution.

## Review acceptance evidence

Each change records affected requirement IDs, implementation paths, tests and
reports, proof theorem/model mappings, assumptions, migration/rollback implications,
and unresolved deviations. Missing evidence is an open item, not a passing review.

## Historical delivery hold

This hold predates the user's explicit authorization for the initial deployment. It is superseded by that authorization and the current manual deployment procedure above. This record does not claim that a deployment succeeded.

## R12 — Conversational API and FunctionGemma

User update (2026-09-27): use Laravel AI SDK v1 as the AI integration layer.
FunctionGemma remains the inference model, accessed through the private compatible
adapter. SDK tool proposals never bypass the authoritative confirmation and worker
pipeline. SDK conversation helpers do not replace ownership/tenant checks.

All versioned APIs belong to the generated tool registry. Every commerce action
is discoverable according to the caller's role. The conversational endpoint and
operation polling are infrastructure entries excluded from recursive dispatch.
FunctionGemma 270M proposes one tool and arguments; it never supplies identity,
permissions, authoritative prices, versions, or confirmation. Reject unknown
names, unknown fields, malformed outputs and unauthorized commands.

PostgreSQL stores encrypted conversation drafts/results, ownership, receipt hash,
version and 30-minute expiry. The existing durable operation worker handles turns.
Typed data and natural-language follow-ups fill missing fields. Product names use
real indexed catalog lookup; ambiguous matches require a choice. Confirmation is
bound to an unchanged stored preview and version. All writes require a separate
explicit confirmation; duplicate completion returns the original result.

Dispatch uses the same executor and transaction as REST commands. Recheck account,
token, role, ownership, stock and workflow versions at execution. Checkout quotes
are checked for price/version changes before the existing checkout handler runs.
Never claim success before a committed business result. Secrets stay out of model
context and preview output; supply passwords only as structured data.

Tests separate deterministic orchestration from real model accuracy. Mocked model
outputs are acceptable for unit/API boundary tests but cannot count as real-model
language evaluations. Lean covers the deterministic authorization/completeness/
confirmation guard model only. No claim of proving neural inference is permitted.

Natural-language reads also require review and confirmation. Discard model values
not grounded in the current message; preserve validated prior conversation data.

## R13 — Configured business permissions and assistant parity

The explicit business-action configuration is `backend/config/commerce.php`.
It enumerates enabled actions and guest/customer/admin role allowlists; unknown
or disabled actions fail closed. Ordinary authenticated users are customers.
Configuration may restrict but cannot elevate existing authorization boundaries.
Apply it to REST ingress, worker execution, AI discovery and confirmation.
Discovery returns the effective caller role, permitted tools, schemas and roles.
The same 17 business tools cover both shops, with tenant isolation preserved.
API tests must invoke every tool through the assistant, assert business outcomes,
and save redacted wire evidence. Real-model routing accuracy is a separate metric;
passing structured dispatch cannot be described as perfect natural-language routing.


## Payment integration implementation (2026-09-26)

Billplz hosted DuitNow QR is opt-in; simulated checkout remains the default.
Payment state is independent of fulfillment. Existing checkout/orders/admin-orders
and AI tools expose server-owned payment metadata; the provider webhook is registered
but deliberately not callable by users or the model. The webhook only authenticates
and persists an inbox event. Workers perform all settlement logic and provider I/O,
with I/O outside SQL transactions, lease fencing and strict bill/reference/amount
matching. Terminal paid/cancelled states cannot be reopened. Stock release occurs
once and only after verified provider deletion, never on redirect or failed attempt.
Ambiguous POST creation is not retried; stock remains reserved for merchant review.

Theorems `payment_paid_is_terminal`, `payment_unverified_unchanged` and
`payment_release_is_idempotent` model guards in `PaymentProcessor::apply`.
`PaymentTest` exercises PHP HTTP handlers and provider failures with a real database;
`tests/api/test_payments.py` exercises real HTTP, PostgreSQL and workers with a
provider fake mounted only into the isolated test stack. Neither substitutes for
merchant sandbox/UAT or proves the entire PHP implementation. Configuration,
remaining recovery/refund limitations and activation steps are in README.
