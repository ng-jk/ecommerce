# Requirement status

## Service platform expansion — 2026-10-13

The [current scope amendment](../decisions/2026-10-13-service-platform.md) adds
nine business/developer product families plus solution commerce. The six
`PLATFORM-BOUNDARIES` is `partial`: organization models, membership/application
availability checks and optional Redis cache infrastructure are implemented.
The other `PLATFORM-*` requirements remain `planned`. This milestone implements
no new application service and establishes no upstream feature parity. Native
Laravel/Expo implementation with upstream references is now selected; Redis is
permitted as optional cache infrastructure. The older table
below records its own dated scope and must not override this product amendment.

Current foundation verification: 125 backend tests / 1,124 assertions pass on
both SQLite and PostgreSQL; combined application executable-line coverage is
1,453 / 1,453. The Redis integration test passes with seven assertions. Twelve
bounded Lean authorization theorems pass the proof/axiom gate. Organization
onboarding, service provisioning, entitlements and UI/API/AI adapters remain
pending. Redis is opt-in and has not been deployed to production.

## Framework workspace development slice — 2026-10-13

Organization creation, listing, detail, owner-only rename and installed Framework
discovery now have shared worker handlers, standalone Expo screens and generated
assistant tools. `PRODUCT-FRAMEWORK` is `partial`; the other eight `PRODUCT-*`
requirements remain `planned` in the indexed
[product inventory](../service-platform-product-inventory.md).
Existing shop authentication is a transitional identity transport bridge;
shop-free registration, identity migration, invitations, entitlements, provisioning
and independent application services are still open. No new production deployment
or full product-parity claim is made.

Verification: 137 backend tests / 1,298 assertions pass on each database; an
additional four-test assistant run verifies the disabled-Framework policy.
Combined application executable-line coverage is 1,577 / 1,577. All 266 frontend
tests pass with 100% statement/branch/function/line coverage; all 275 Python pipeline
tests pass with 100% measured statement/branch coverage. The 23 API tests record
verified successful requests for all documented operations, including the five
new commands. Fifteen workspace model theorems pass the Lean gate. These metrics
cover the configured owned-code/test scopes, not arbitrary inputs or full upstream
equivalence. Current evidence is linked in the Framework registry entry and the
HTML development report.

## Earlier scope snapshot

Statuses below summarize documented scope as of 2026-10-09. `partial` means the repository records some implementation or evidence but does not establish the full target. `planned` means a target is documented without sufficient implementation evidence. `implemented` is reserved for a bounded requirement with current, linked evidence. A previous dated report is historical evidence for its stated scope and is not a current release report.

| Area | Status | Basis and remaining work |
| --- | --- | --- |
| Existing Maison, Volt and Commerce Studio applications | partial | Applications and APIs exist; the full interface set, universal shared behavior and responsive acceptance are not verified here. |
| Shopify-style breadth | partial | Forty-two categories are inventoried; the inventory records delivery status per capability. |
| Durable database-first operations | partial | The target and historical stack evidence exist; durable worker, wakeup and recovery status must be confirmed per current implementation. |
| PostgreSQL notification wakeups | partial | Durable event delivery and `LISTEN/NOTIFY` wakeups are implemented; PHP/PostgreSQL verification is blocked by Docker startup. |
| Frontend TypeScript contracts | partial | TypeScript clients and generated OpenAPI declarations exist; universal contract coverage across all clients is not established. |
| Shared Mini App host | partial | The Mini App implementation and dated test evidence are documented; production hosting and native device release remain separate. |
| General backend plugin service platform | partial | Independent script runtime and scoped persistence API implemented with unit coverage; real sandbox/API tests and checkout integration remain pending. |
| Manual Python release orchestration | partial | Tooling and release procedure are documented; environment provisioning and a successful deployment require separate current evidence. |
| Five review gates | partial | Five distinct automated review stages are implemented; this does not assert independent human approval or a successful full release. |
| Unit/API test and coverage targets | partial | Dated reports exist for named scopes; reports must be regenerated and tied to each current commit and requirement before release. |

The machine-readable record in [registry.json](../registry.json) is the requirement-level source. Empty evidence arrays mean there is no artifact asserted for that entry. Update status only with evidence at the same or narrower scope as the requirement; do not infer completion from planned work, old reports, generated contracts or a successful subset of tests.
