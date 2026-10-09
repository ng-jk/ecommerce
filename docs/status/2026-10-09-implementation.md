# Shop3i amendment implementation checkpoint

This is an implementation checkpoint, not a successful release report. The working tree contains the amendment and earlier Mini App work. No production deployment is asserted by this document.

| Area | Delivered source | Verification and remaining work |
| --- | --- | --- |
| Indexed standards | `docs/INDEX.md`, `docs/registry.json`, `tools/context_index.py` | Machine validation links requirements, source, tests and proof identifiers. Empty evidence means unverified. |
| Three interfaces | `interfaces/python/shop3i`, existing Laravel action registry and frontend API client | SDK, CLI and MCP use the existing backend authority. Isolated adapter tests pass; live Laravel tests need the running stack. |
| Durable EDA | `backend/app/Modules/Events` | Transactional outbox, broker fanout, leased deliveries and PostgreSQL notification wakeups are implemented. New PHP/real PostgreSQL tests have not run on this checkout. Handlers must deduplicate effects using the supplied event key: delivery is at least once. |
| Company frontend | `packages/storefront/services/profile` | Public runtime profile selects branding and a general or single Mini App home. This does not provision a merchant or native signing account. Custom merchant slugs still require backend provisioning and contract completion. |
| Script plugin service | `extensions/runtime`, `compose.plugin.yaml` | Approved ZIPs, installation grants, separate persistence and restricted Docker execution are implemented. Unit coverage is recorded in `reports/plugin-coverage.json`. Real PostgreSQL and sandbox tests are blocked. Fee outputs are proposals; checkout does not yet apply them. |
| SDLC release | `tools/lifecycle` | Five distinct automated review stages, verification, immutable image promotion and per-stage reports are implemented. Isolated release-tool tests pass. Production execution and native signing are unverified. Profile kind alone does not provision a separate plugin service. |
| Lean | `formal/Commerce` | Existing commerce/plugin/Mini App models compile and the required theorem axiom audit passes. These bounded models do not prove the new Docker runtime or EDA implementation. |

## Verification resumed after Docker restart

Docker Desktop now reports engine 29.7.2. The backend passes 119 tests and 1,068 assertions on each of SQLite and PostgreSQL; combined executable-line coverage is 1,408/1,408. The plugin runtime passes two real PostgreSQL/Docker functional tests. The live application API suite passes 20 tests after using a workspace-owned temporary directory. No production deployment is established by these local results. Release security review and final commit-bound verification remain required.

## Executed checks

- Pipeline/context/lifecycle unit suite: 205 passed, 100% statement and branch coverage for the measured modules.
- Python interface adapters: 18 passed, 100% statement and branch coverage.
- Frontend aggregate: 249 passed across 31 test files; 100% statements, branches, functions and lines in the configured frontend scope.
- Isolated plugin runtime unit suite: 17 passed, 100% statement and branch coverage. The later real integration run passes both tests with a disposable PostgreSQL database and pinned sandbox image.
- Existing required Lean models compiled and their axiom audit passed.
- Repository review passed, including dependency analysis of 219 modules and 482 dependencies. The README layer-check regression was corrected and its targeted tests pass at 100% statement/branch coverage.
- Release preflight report: `test-results/lifecycle/3d2e625ec84045ae95252ab4ead46db3.json`, blocked on the local `developement` branch. Publication and main promotion were skipped.

These results are working-tree checks. They are not a commit-bound release certificate. Unsupported dedicated/plugin release profiles fail closed until deployment support is implemented.

## Acceptance still pending

Run the complete pipeline against the final source revision. Resolve all coverage, lint and API failures; verify raw API terminal responses. Complete checkout integration for plugin proposals and merchant provisioning before claiming those features available. Exercise dedicated service deployment separately from the general platform. Configure company domains/signing only for distributions being published. Do not promote historical test reports into current release evidence.

The resumed release audit identified vulnerable npm dependencies. Compatible fixes removed the critical finding; high-severity findings still prevent the security review from approving publication. Production and testing runtime files now contain separate public Mini App origins and parent-origin allowlists, with private backups retained. Cloudflare's dedicated Mini App route configuration still needs verification. A source push is not a successful deployment or permission to bypass these release gates.
