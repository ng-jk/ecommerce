# Refactor status — 2026-09-22

This is implementation evidence, not a declaration of full specification compliance.
The acceptance requirements remain in `engineering-spec.md` and `crud-rules.md`.

## Implemented

- Laravel business routes durably record encrypted operations before execution.
  PostgreSQL workers claim rows, recover expired leases, bound retries, recheck
  account/token/role authority, and atomically store results with business changes.
- Mutation receipts are private; retries compare canonical payload hashes.
  Existing-record mutations require authoritative versions. Checkout locks stock,
  uses server prices, and rejects conflicting checkout-key reuse.
- Business models use soft deletion, model-owned enum labels, unique identifiers,
  indexed filters, and normalized paginator metadata. Monetary columns are bigint.
  Validation errors use the `validation_error` field-to-message-array map.
- Product create/edit use standalone routes and a shared two-step TypeScript form.
  Admin lists expose indexed filters; product deletion is soft deletion.
- Shared frontend domain/data/presentation/composition layers include runtime
  schemas, retry classification, operation polling, cache and storage adapters,
  persistent mutation receipts, and extracted storefront view models.
- All current routes are registered as main screens; form variants are explicitly
  inventoried. Loading feedback stays inside its main route. No temp route is
  currently pushed into browser/native history. The tested main/temp policy must
  be wired into navigation before adding any future temp route.
- Strict TypeScript, unchecked-index and exact-optional checks, type-aware async
  lint rules, source-size checks, and generated API declaration splitting are active.
- Python orchestrates review/lint/test/prove/build/integration/coverage/deploy.
  Browser and mutation stages are optional. GitHub Actions calls these gates; deployment requires complete
  evidence for the clean commit, configured registry/SSH credentials, and the
  protected production environment. No remote deployment has been performed.
- Eleven Lean theorems compile with audited standard axioms and no proof holes.
  They cover the abstract stock, authorization, replay, money, navigation, and
  order-transition models. They do not prove the PHP or TypeScript implementation.

## Verification evidence

Latest testing scope: [testing acceptance](testing-acceptance.md). Required tests
are unit tests and API functional tests; browser/mutation commands are optional.

- Frontend: 107 unit tests pass. All executable TypeScript in `packages/` and
  `frontend/*/src/` reaches 100% statements, branches, functions, and lines,
  including storage, screens, view models and composition. Generated type-only
  declarations are excluded because they have no executable runtime behavior.
- Laravel: 32 tests / 179 assertions pass on SQLite and again on PostgreSQL.
  Combined Clover evidence covers every executable line in `backend/app/`
  (338/338 at this verification). This is line coverage, not a claim of PHP
  path/branch coverage or coverage of vendor/framework internals.
- Python pipeline: 50 tests pass with 100% statement and branch coverage.
- Raw PostgreSQL/worker HTTP: eight scenarios pass. All 18 documented method/path
  operations are exercised. Sanitized per-case exchanges and the route matrix
  are saved in `test-results/api/exchanges.json` and `coverage.json`.
- API assertions cover CRUD, filters/pagination, server-priced checkout, replay,
  sequential order transitions, logout revocation, authorization, malformed UUIDs,
  strict quantities, stale versions, oversize requests and last-unit concurrency.
- The PostgreSQL suite exposed a malformed checkout UUID reaching a replay query
  before validation. Validation now runs first and the HTTP regression returns 422.
- PHP evidence is in `test-results/php/`; Python evidence is in
  `test-results/python-coverage.json`; frontend evidence is in `coverage/`.
- All three apps and the unit tests pass strict TypeScript checking.
- Eleven Lean logical-model proofs build and pass theorem/signature/axiom audits.

## Remaining specification and deployment boundaries

1. The user clarified that the 1,000-line rule applies only to authored logic.
   Generated dependency lockfiles are outside scope; the review gate reflects this.
2. Framework cache/session/queue/token/migration tables retain framework
   semantics. The requested universal soft-delete/timestamp rule still needs
   an explicit compatibility decision for those infrastructure tables.
3. Deployment and release are explicitly on hold. A future remote release requires a configured host, domains, registry,
   SSH host key and credentials. No remote deployment or rollback rehearsal is
   claimed. Release evidence also requires a clean committed checkout and a
   passing review gate.

## Further hardening, separate from completed test coverage

Coverage is evidence that code executed under assertions; it is not exhaustive
proof over all possible inputs or concurrent schedules. More crash-injection
scenarios and implementation-to-model differential traces can strengthen this.
Lean remains limited to its stated logical models.

The current HTTP client explicitly rejects unsupported 304 responses, bounds
retries and polling, and resumes mutations with the same persisted identity.
ETag revalidation, per-screen cancellation, and resume by saved polling URL are
further improvements. The upload helper is tested, including rollback cleanup;
product screens currently use HTTPS image URLs, not an upload endpoint. Operation
retention/monitoring policy and native signing/distribution remain future work.
Admin and account event orchestration has now been extracted into view models;
shared forms retain only rendering and bindings.

## Compatibility decisions

Expo uses JSON validation results, not Inertia session props. Shared full-page
forms use `.tsx`, preserving strict TypeScript. PostgreSQL's database cache is
the implemented interpretation of PostgreSQL-backed memory storage; PostgreSQL
remains the durable source of truth. These adaptations are recorded explicitly
and must not be confused with implementing a separate Inertia application or a
RAM-only database engine.

Local availability verified on 2026-09-22: all three frontend images and the
backend/worker were rebuilt, pending demo migrations applied, and the normal
Docker stack started on port 8080. Both storefronts load catalogs and the admin
demo account signs in. Screenshots are in `test-results/screenshots/`.
The isolated integration stack remains on port 8088. Remote deployment and release
are on hold; the CI deployment job is explicitly disabled.


## FunctionGemma integration, 2026-09-23

Implemented the durable assistant endpoint, generated 19-operation registry,
17 commerce dispatch targets, encrypted versioned drafts, missing-input collection,
authorization checks, confirmation and shared worker execution. The official
270M model runs privately in Docker; local images were rebuilt with final code.
A real model catalog proposal/confirmation/dispatch passed and responses are saved
in `test-results/assistant-live-confirmed.json`.

Verification: 47 backend tests / 373 assertions on each of SQLite and PostgreSQL;
combined application executable-line coverage 100%. Inference service: 29 tests,
100% statement and branch coverage. Python pipeline: 56 tests, 100% coverage.
The raw API suite passed 9 tests covering all 19 documented operations,
including structured assistant calls. Lean verifies 14 deterministic theorems.

Remaining language-quality work: the preliminary generated-base-registry selection
benchmark passed 11/17 fixed prompts. It excludes runtime cart schema extensions
and does not measure argument accuracy. No fine-tuning has been performed. This is
a working API integration, not evidence of reliable arbitrary-language routing.
Domain training and a larger held-out evaluation are still needed before release.
Deployment/release remain on hold. No chat UI was added by this API change.
