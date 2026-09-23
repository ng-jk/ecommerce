# Testing acceptance — latest user requirements

This specification supersedes earlier requirements to make browser, native UI,
or mutation tests mandatory release gates. Required test categories are unit tests
and API functional tests. Existing optional browser/mutation commands may remain.

- Require 100% executable owned-code coverage. Keep uncovered files visible;
  do not exclude logic, suppress instrumentation, or reduce thresholds to pass.
- Unit tests assert outputs, failures, state changes, and boundary behavior.
- API functional tests send synthetic HTTP requests to the isolated PostgreSQL
  stack and await worker completion. A 202 receipt is not business success.
- Exercise every documented method/path, authentication and authorization
  failures, validation, replay, stale versions, transitions, and concurrency.
- Save sanitized request/response evidence and an endpoint coverage matrix under
  `test-results/api`. Never persist passwords, bearer tokens, cookies or receipts.
- Endpoint coverage and code coverage are separate measurements. Neither proves
  every possible input or interleaving has been tested.
- Lean covers logical models and their stated invariants only. It does not prove
  framework code, HTTP adapters, presentation markup, or deployment correctness.

Required pipeline stages: review, lint, test, prove, integration, coverage.
The coverage gate remains fail-closed at 100%; a successful API run alone must
never create release verification evidence.

## Measured scope and evidence

| Scope | Required measurement | Current result |
| --- | --- | --- |
| Executable frontend TypeScript in `packages/` and `frontend/*/src/` | Statements, branches, functions, lines | 100%; 107 tests |
| Laravel application classes in `backend/app/` | Executable lines, combined SQLite/PostgreSQL | 100%; 32 tests on each engine |
| Python modules in `tools/pipeline/` | Statements and branches | 100%; 50 tests |
| OpenAPI method/path operations | Exercised routes with verified successful responses | 18/18; eight functional scenarios |
| Lean logical models | Required theorem compilation and axiom audit | 11 passing proofs |

Dependency code, type-only declarations, configuration, migrations and test code
are not included in these application-code coverage percentages. The PHP result
is not a claim of 100% branch/path coverage. API endpoint coverage does not imply
every input or concurrent schedule has been enumerated.

`python -m tools.pipeline test` and `python -m tools.pipeline coverage` passed
through the real orchestrator. The API response artifact is
`test-results/api/exchanges.json`; each exchange names its scenario and redacts
credentials. `test-results/api/coverage.json` fails if a documented operation is
missing or has no successful completion. A queued 202 alone cannot satisfy it.

## Rule-to-test and proof mapping

| Rule | Main test evidence | Lean logical obligation |
| --- | --- | --- |
| Tenant/role authority and execution-time revocation | `WorkerBoundaryTest`, `OperationTest`, raw API role/shop cases | `foreign_shop_unchanged`, `unauthorized_unchanged` |
| Stock conservation and server-priced totals | `CommerceTest`, concurrent last-unit API scenario | `purchase_conserves_stock`, `stock_nonnegative`, `money_total_correct` |
| Idempotent mutation/checkout recovery | `recovery.test.ts`, replay API cases | `purchase_idempotent`, `replay_unchanged` |
| Sequential order transitions | Complete CRUD/checkout API journey | `order_advance_valid` |
| Back never resolves to a temporary screen | `domain.test.ts` generated histories | `back_never_temp` |
| Runtime validation, storage isolation, HTTP outcomes | Data/repository/storage unit suites | Tested adapter behavior; no whole-adapter proof claim |
| Shared forms, main screen states and view-model behavior | Admin/storefront screen and view-model unit suites | Logical navigation policy only |
| Upload whitelist and rollback cleanup | `CommerceTest`, `FileUploaderFailureTest` | Tested I/O boundary; no filesystem proof claim |
