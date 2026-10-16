# Service platform product inventory

Review date: 2026-10-17. Owner: platform architecture, with domain owners below.
Authority: [October 13 scope decision](decisions/2026-10-13-service-platform.md),
[engineering specification](engineering-spec.md), [implementation plan](implementation-plan.md)
and [CRUD C01–C10](crud-rules.md). This is an indexed acceptance backlog, not a
release or feature-parity claim. All nine reference product families now have
development slices under verification; their remaining acceptance backlog is
explicit below. Commerce now has a bounded solution-purchase/provisioning
development slice; refund reconciliation and platform-only purchase identity
remain incomplete. No new production release is asserted here.

## Reference provenance

Official repository pages and product documentation were inspected on the review
date. GitHub's public repository/commit/license APIs supplied the exact default
`develop` revisions and UTC committer dates below. These are research snapshots,
not recommended production releases. Each commit link fixes the complete source
tree; `pyproject.toml` and `<app>/hooks.py` at that revision supplied dependency
metadata. Documentation sites are rolling references, not revision-pinned code.
No upstream repository was cloned and no implementation source was imported.

| Product / key | Pinned official revision | Commit date UTC | License file at revision | Official documentation |
| --- | --- | --- | --- | --- |
| ERPNext / `erp` | [5379bbaf49a34c99814286f41160dd10c4b344fc](https://github.com/frappe/erpnext/tree/5379bbaf49a34c99814286f41160dd10c4b344fc) | 2026-10-12 18:14:45 | [license.txt: GPL-3.0](https://github.com/frappe/erpnext/blob/5379bbaf49a34c99814286f41160dd10c4b344fc/license.txt) | [ERPNext](https://docs.frappe.io/erpnext/introduction) |
| Frappe HR / `hr` | [953357958e30c30eebe2dece687af8b3151d3169](https://github.com/frappe/hrms/tree/953357958e30c30eebe2dece687af8b3151d3169) | 2026-10-12 12:12:18 | [license.txt: GPL-3.0](https://github.com/frappe/hrms/blob/953357958e30c30eebe2dece687af8b3151d3169/license.txt) | [HR](https://docs.frappe.io/hr/introduction) |
| Learning / `learning` | [e0aa47b32ad139465da5ff2a05bcf0de1ac3e976](https://github.com/frappe/lms/tree/e0aa47b32ad139465da5ff2a05bcf0de1ac3e976) | 2026-10-12 20:58:36 | [license.txt: AGPL-3.0](https://github.com/frappe/lms/blob/e0aa47b32ad139465da5ff2a05bcf0de1ac3e976/license.txt) | [Learning](https://docs.frappe.io/learning/setup-guide/your-first-steps-with-frappe-learning) |
| Insights / `insights` | [10a0c82187136ad9efd967ff202d4a23c678f8f4](https://github.com/frappe/insights/tree/10a0c82187136ad9efd967ff202d4a23c678f8f4) | 2026-10-12 07:49:55 | [license.txt: AGPL-3.0](https://github.com/frappe/insights/blob/10a0c82187136ad9efd967ff202d4a23c678f8f4/license.txt) | [Insights](https://docs.frappe.io/insights/introduction) |
| CRM / `crm` | [ef0b4280bcd423b0c29c1c3f212d157eb2dd41a7](https://github.com/frappe/crm/tree/ef0b4280bcd423b0c29c1c3f212d157eb2dd41a7) | 2026-10-12 07:10:01 | [LICENSE: AGPL-3.0](https://github.com/frappe/crm/blob/ef0b4280bcd423b0c29c1c3f212d157eb2dd41a7/LICENSE) | [CRM](https://docs.frappe.io/crm/setup-guide/your-first-steps-with-frappe-crm) |
| Helpdesk / `helpdesk` | [58b82a6e20f11f2527540f3e41d9f5e4e15669fb](https://github.com/frappe/helpdesk/tree/58b82a6e20f11f2527540f3e41d9f5e4e15669fb) | 2026-10-11 14:02:56 | [LICENSE: AGPL-3.0](https://github.com/frappe/helpdesk/blob/58b82a6e20f11f2527540f3e41d9f5e4e15669fb/LICENSE) | [Helpdesk](https://docs.frappe.io/helpdesk/installation) |
| Lending / `lending` | [1e4fb43c0515b1f3e1c3943974650889f3c1e950](https://github.com/frappe/lending/tree/1e4fb43c0515b1f3e1c3943974650889f3c1e950) | 2026-10-12 05:50:43 | [license.txt: GPL-3.0](https://github.com/frappe/lending/blob/1e4fb43c0515b1f3e1c3943974650889f3c1e950/license.txt) | [Lending](https://docs.frappe.io/lending/introduction) |
| Framework / `framework` | [ca8daf525df42a01333483decf0d0cd1f317ec63](https://github.com/frappe/frappe/tree/ca8daf525df42a01333483decf0d0cd1f317ec63) | 2026-10-12 18:42:14 | [LICENSE: MIT](https://github.com/frappe/frappe/blob/ca8daf525df42a01333483decf0d0cd1f317ec63/LICENSE) | [Framework](https://docs.frappe.io/framework/user/en/introduction) |
| Builder / `builder` | [acb6d17a9c24e4b9b6bf4ed502eb07471f492e68](https://github.com/frappe/builder/tree/acb6d17a9c24e4b9b6bf4ed502eb07471f492e68) | 2026-10-12 17:18:09 | [LICENSE: MIT](https://github.com/frappe/builder/blob/acb6d17a9c24e4b9b6bf4ed502eb07471f492e68/LICENSE) | [Builder](https://docs.frappe.io/builder/introduction) |

License labels are GitHub classifications checked against the pinned license-file
heading, not a complete legal determination. Insights' pinned `hooks.py` says
GNU GPLv3 while its actual `license.txt` is AGPL-3.0: do not use the hook label to
approve reuse. Any future import/translation requires file-level provenance,
notices, modifications and obligations review under the scope decision; changing
language does not establish independent authorship. Shop3i uses its own branding.

## Upstream dependencies and native boundaries

The following are observed manifest constraints, not proof that the nine snapshots
can be installed together. Transitive dependency and runtime compatibility audits
are required if original runtimes are ever considered. They are not the chosen
deployment strategy.

| Reference | Pinned upstream dependency evidence | Native service ownership and integration boundary |
| --- | --- | --- |
| ERPNext | Frappe `>=17.0.0-dev,<18.0.0`; Python `>=3.14` | ERP owns general ledger, procurement, manufacturing/assets/projects; define one inventory authority with commerce before moving stock |
| HR | Frappe and ERPNext `>=17.0.0-dev,<18.0.0`; hook requires ERPNext | HR owns employee records, leave, attendance and payroll subledger; emits balanced posting requests to ERP |
| Learning | Frappe `>=17.0.0-dev,<18.0.0`; Python `>=3.14,<3.15`; hook requires `frappe/payments` | Learning owns course/enrollment/progress; commerce settlement grants paid access through deduplicated entitlement events |
| Insights | Frappe `>=15.0.0`; manifest includes PostgreSQL Ibis adapter | Insights owns datasets, queries and projections; consumes authorized exports/APIs, never transactional-service database credentials |
| CRM | Frappe `>=16.0.0-dev,<=17.0.0-dev`; hook requires `whatsapp` | CRM owns contacts/leads/deals; external channels use scoped adapters; contacts never implicitly become platform identities |
| Helpdesk | Frappe `>=16.0.0-dev,<18.0.0`; Python `>=3.14`; hook requires `telephony` | Helpdesk owns tickets, queues, SLAs and knowledge; channel webhooks deduplicate and cannot impersonate organization members |
| Lending | Frappe and ERPNext `>=17.0.0-dev,<18.0.0`; hook requires ERPNext | Lending owns loan schedules and subledger; settlement and general-ledger postings use stable references and reconciliation |
| Framework | Python `>=3.14,<3.15`; Redis client and Frappe runtime dependencies | Platform owns identity, organizations, memberships, installations and capability contracts; native Laravel/PostgreSQL authority replaces upstream runtime |
| Builder | Frappe `>=15.0.0,<18.0.0`; Python `>=3.10` | Builder owns declarative content, revisions and publish jobs; custom executable code remains in the existing sandbox |

Every native service must own a separate PostgreSQL database, role/credentials,
migrations, workers and API. No cross-service database joins or writes; foreign
identifiers are typed references validated through owning-service contracts.
The current shared-backend organization slice is an explicit migration stage,
not evidence of independent service deployment. Database-per-service does not
imply database-per-organization; deployment profiles must specify both axes.

PostgreSQL owns durable acceptance, operations, inbox/outbox, leases and audits.
An authenticated relay acknowledges only after destination inbox commit;
duplicates, replay, schema/version ordering, dead letters and compensations need
tests. PostgreSQL NOTIFY only wakes local workers. Redis is optional disposable
cache with expiry and organization/principal isolation; cache loss cannot lose
work or grant permission. No Redis queue replaces durable PostgreSQL commands.

## Feature backlog and acceptance

P0 = current foundation/release prerequisite; P1 = early domain slice; P2 = later
domain expansion. Owners are service responsibilities, not staffed assignments.
All rows additionally require the common delivery gate below. A grouped feature
area must be split into individual commands and screen/test/proof mappings before
implementation; it is not a claim of exhaustive upstream feature enumeration.

| Feature ID | Priority | Owner | Feature area | Success criteria | Status |
| --- | --- | --- | --- | --- | --- |
| FW-01 | P0 | Platform | Organization workspace | Authenticated ordinary user creates once; worker assigns owner and Framework installation atomically; list/detail/rename/application list enforce current access and versions | Partial slice |
| FW-02 | P0 | Platform identity | Standalone identity and shop migration | User can onboard without shop; explicit shop-organization mapping preserves old authorization; revoked/foreign mappings cannot widen access | Partial: separate platform identities and workspace; no shop transfer |
| FW-03 | P0 | Platform permissions | Invitations, membership and installations | Owner-governed invite/accept/revoke; no last-owner loss; entitlements and installation state rechecked in worker and polling | Partial: memberships and immutable entitlements; integration regression pending |
| FW-04 | P1 | Platform SDK | Typed schemas, workflows and extension contracts | Versioned descriptors drive API/UI/AI with equal guards; malicious metadata cannot execute host code; schema upgrades are recoverable | Planned |
| FW-05 | P0 | Platform operations | Separate services and event transport | Per-service credentials demonstrably deny foreign DB access; crash/replay does not lose accepted work or duplicate business effects | Partial: four isolated local runtime DB-role/network denials verified; production integration pending |
| CRM-01 | P1 | CRM | Leads, contacts and organizations | Indexed paginated records, scoped deduplication, standalone create/edit and conversion that cannot create login authority | Partial: isolated domain, SDK/UI, signed worker API and assistant flow pass; release regression pending |
| CRM-02 | P1 | CRM | Deals, stages and activities | Versioned stage transition and assignment; activities scoped to authorized deals; concurrent movement has one accepted version | Partial: isolated domain, SDK/UI and focused100% tests; actual API regression passes; not released |
| CRM-03 | P2 | CRM | Communications, automation and reports | Channel retries deduplicate; recipient consent/permissions checked; report totals reconcile to authorized pipeline data | Planned |
| HD-01 | P1 | Helpdesk | Tickets, queues and agents | Requester/agent visibility differs by policy; assignment/status transitions survive retries; other organizations cannot read tickets | Partial slice; full acceptance open |
| HD-02 | P1 | Helpdesk | SLA and escalation | Calendar/timezone fixtures establish due dates; duplicate timer events cause one escalation; closed tickets do not reopen accidentally | Planned |
| HD-03 | P2 | Helpdesk | Knowledge and support channels | Article draft/publish permissions enforced; inbound email/telephony events deduplicate; attachments and sender identities validated | Planned |
| LMS-01 | P1 | Learning | Courses, lessons and enrollment | Instructor authoring plus learner enrollment with access gates; draft/private content never leaks through URLs or search | Partial slice; full acceptance open |
| LMS-02 | P1 | Learning | Assessments and progress | Attempts obey limits and server scoring; duplicate completion is harmless; progress cannot be claimed by clients | Partial slice; full acceptance open |
| LMS-03 | P2 | Learning | Cohorts, live sessions and certificates | Scheduled participation respects roles; certificate issuance follows verified completion and has auditable revocation | Planned |
| BLD-01 | P1 | Builder | Visual composition and assets | Validated declarative blocks round-trip editor/preview; unsafe markup/URLs rejected; private assets remain scoped | Partial slice; full acceptance open |
| BLD-02 | P1 | Builder | Revisions, preview and publishing | Expected version prevents lost edits; preview tokens expire; atomic publish and rollback use immutable revisions | Partial slice; full acceptance open |
| BLD-03 | P2 | Builder | Dynamic data, templates and custom domains | Data binding uses authorized service APIs; templates cannot escape sandbox; verified domain routing prevents tenant takeover | Planned |
| ERP-01 | P1 | ERP accounting | Ledger, receivables/payables and reconciliation | Balanced immutable postings and reversal paths; currencies/rounding fixed; duplicate settlement reference cannot post twice | Partial slice; full acceptance open |
| ERP-02 | P1 | ERP procurement | Supplier/order/receipt/invoice workflow | Partial receipts and matching reconcile; approved/posted documents reject illegal edits through every interface | Planned |
| ERP-03 | P1 | Inventory authority | Stock, warehouses and reservations | One stock ledger owner; concurrent checkout cannot oversell; reserve/confirm/release and compensation reconcile | Planned |
| ERP-04 | P2 | ERP manufacturing | BOMs, production and subcontracting | Versioned BOM consumption/yield reconciles stock and costs; shortage and cancellation have tested recovery | Planned |
| ERP-05 | P2 | ERP assets/projects | Asset lifecycle and project costing | Depreciation/disposal postings balance; tasks/timesheets roll up authorized project costs with locked-period guards | Planned |
| HR-01 | P1 | HR | Employees, recruitment and onboarding | Sensitive fields enforce action/field policy; candidate conversion is explicit; terminated staff lose access according to policy | Partial slice; full acceptance open |
| HR-02 | P1 | HR | Attendance, shifts and leave | Overlap/timezone/holiday rules tested; concurrent approvals cannot overspend leave; corrections retain audit history | Partial slice; full acceptance open |
| HR-03 | P2 | HR payroll | Payroll, expenses and performance | Named jurisdiction/version rules approved; payslip totals reconcile; approved runs lock and reverse; ERP postings deduplicate | Planned |
| LND-01 | P2 | Lending | Products, application and approval | Named jurisdiction/product rules; separation of applicant/approver; terms freeze at approval with evidence | Partial slice; full acceptance open |
| LND-02 | P2 | Lending | Schedules, disbursement and repayment | Precision/accrual fixtures reconcile principal and interest; duplicate payment/disbursement cannot change balance twice | Partial slice; full acceptance open |
| LND-03 | P2 | Lending | Collateral, delinquency and restructuring | State transitions retain prior terms; delinquency/as-of calculations reproducible; write-off/reversal postings reconcile | Planned |
| INS-01 | P2 | Insights | Data sources and datasets | Connector credentials scoped/read-only; exports exclude unauthorized columns/rows; revocation removes cached access | Partial slice; full acceptance open |
| INS-02 | P2 | Insights | Queries, charts and dashboards | Bounded asynchronous queries show freshness; parameters validated; dataset-level policy applies to sharing and downloads | Partial slice; full acceptance open |
| INS-03 | P2 | Insights | Refresh, scheduled delivery and lineage | Retries deduplicate refreshes/deliveries; source/schema changes surface controlled errors; lineage identifies source versions | Planned |
| COM-01 | P1 | Commerce | Solution catalog and customization | Published offering/version defines deliverables and quoted customization; server calculates prices and supported entitlements | Partial: immutable offerings and checkout-pinned order quotes; native regressions pass; real wire regression pending |
| COM-02 | P0 | Commerce/platform | Settlement and provisioning | Verified settlement creates entitlement once; failed provisioning remains observable/retryable; refund/revocation reconciles | Partial: verified settlement, deduplicated entitlements and durable provisioning/retry; refunds and platform-only purchase identity remain open |
| COM-03 | P1 | Commerce | Subscriptions and fulfillment | Renewal/cancel/upgrade boundaries explicit; service outage cannot fabricate delivery; billing references reconcile with ERP | Planned expansion |

Common delivery gate: link each ID to requirements, implementation paths,
versioned capabilities, API wire evidence, UI/AI/SDK parity, logic tests and relevant
bounded Lean obligations. Require C01 pagination; C02 filter/index plans; C03
standalone shared forms; C04 locking; C05 uniqueness; C06 model enum options;
C07 deletion/retention; C08 validation maps; C09 upload safety where applicable;
C10 public resources. Posted finance is corrected by reversal, not hidden through
ordinary soft deletion. Strict TypeScript, 1,000-line logic limit, public module
boundaries, seven-control screens and main/temp Back safety remain mandatory.
Five review gates and the manual Python release pipeline must pass before any
feature is presented as released; 100% owned-logic coverage is not waived here.

## Dated implementation and acceptance status (2026-10-17)

The status labels above describe only bounded development slices. Presence of a
module, route, screen, generated client, or focused test does not complete its
success criteria or establish release acceptance. All nine reference product
families remain partial. The current lifecycle report is
[`test-results/lifecycle/platform-expansion-20261017.html`](../test-results/lifecycle/platform-expansion-20261017.html),
for the 17 October continuation (the final commit is recorded in the HTML report). The workspace review,
Docker 29.7.2 runtime check, and fresh backend plus fashion/electronics/admin web
image builds passed. The combined npm, Python, and locked Composer security
audits passed; Composer reported no advisories or abandoned packages. Two plugin
functional tests passed against disposable PostgreSQL and a digest-pinned Python
sandbox. Frontend passed 561 tests across 73 files, with all four coverage
metrics at 100%. Python unit suites passed 419 tests plus 17 subtests; the
pipeline/deployment suites passed 325 tests with 100% statement and branch
coverage. Review and registered Lean gates passed for their bounded scopes.

The initial full API failures remain in the HTML history. The corrected final
run passed all 51 API tests and successfully exercised all 208 documented
operations, including the seven solution-commerce AI tools. Sanitized requests
and responses are recorded in `test-results/api/exchanges.json`. Final PHP
verification passed 343 SQLite tests (two PostgreSQL-only skips) and 349
PostgreSQL tests, with 5,395/5,395 owned executable lines covered. The cached PHP
testing runtime mounted hash-verified current source read-only. All eight service
domains passed real signed-TLS, durable-inbox/domain-worker/outbox/platform-worker
health roundtrips; see `test-results/solution-runtime-health-20261017.log`.

These results cover existing code, not absent product features. Latest server
available memory was 2,391 MiB; the unchanged 2,560 MiB capacity guard rejected
deployment. Local bfloat16 inference passed two bounded prompts with lower memory,
but the server benchmark failed with a malformed function call. Live float32
remains unchanged. There is no new production deployment or full product-parity
claim. Payroll/lending jurisdiction is still required before regulated rules.

| Product / backlog IDs | Existing slice paths | Bounded remaining acceptance work |
| --- | --- | --- |
| ERP / ERP-01–05 | `backend/app/Modules/Erp/{ErpActions.php,ErpCommandHandler.php,Models/Account.php,Models/Journal.php,Models/JournalLine.php}`; `packages/api-client/services/erp/`; `frontend/admin/src/screens/platform_erp_screen/`; `tests/api/test_erp_service.py` | ERP-01 posted-journal database guards now pass raw-SQL, replay and PostgreSQL regression checks; release acceptance remains blocked. Receivables/payables, reversal, currency/rounding rules, settlement deduplication and reconciliation remain open. ERP-02 supplier/PO/receipt/invoice matching is absent. ERP-03 needs a single ERP/commerce stock ledger and reserve/confirm/release concurrency path. ERP-04 BOM, production and subcontracting are absent. ERP-05 asset depreciation/disposal and project costing are absent. No P2 ERP parity claim. |
| HR / HR-01–03 | `backend/app/Modules/Hr/{HrActions.php,HrCommandHandler.php,Models/}`; `packages/api-client/services/hr/`; `frontend/admin/src/screens/platform_hr_screen/`; `tests/api/test_hr_service.py` | HR-01 slice does not evidence recruiting/onboarding, field-level sensitive-data policy, explicit candidate conversion or termination access revocation. HR-02 needs overlap/timezone/holiday rules, concurrent leave-approval limits and correction audit acceptance. HR-03 payroll, expenses, performance, jurisdiction/version rules, locked runs and deduplicated ERP postings remain absent. |
| Learning / LMS-01–03 | `backend/app/Modules/Learning/{LearningActions.php,LearningCommandHandler.php,Models/}`; `packages/api-client/services/learning/`; `frontend/admin/src/screens/platform_learning_screen/`; `tests/api/test_learning_service.py` | LMS-01 needs complete authoring and learner flows plus private/draft URL and search denial evidence. LMS-02 needs attempt limits, server-owned scoring, duplicate completion and anti-forgery acceptance. LMS-03 cohorts, live sessions, scheduled participation and auditable certificate revocation remain absent. |
| Insights / INS-01–03 | `backend/app/Modules/Insights/{InsightsActions.php,InsightsCommandHandler.php,Models/}`; `packages/api-client/services/insights/`; `frontend/admin/src/screens/platform_insights_screen/`; `tests/api/test_insights_service.py` | INS-01 needs scoped read-only connector credentials, row/column filtered exports, and revocation/cache purge evidence. INS-02 needs bounded async query execution, freshness, parameter validation and dataset policy for sharing/downloads. INS-03 refresh scheduling, deduplication, schema-change errors and source-version lineage remain absent. |
| CRM / CRM-01–03 | `backend/app/Modules/Crm/{CrmActions.php,CrmDealActions.php,CrmCommandHandler.php,Models/}`; `packages/api-client/services/crm/`; `frontend/admin/src/screens/platform_crm_screen/` and `platform_crm_growth_screen/`; `tests/api/test_crm_service.py`, `tests/api/test_crm_growth.py`, `tests/unit/platformCrmGrowthRoutes.test.ts` | CRM growth route adapters are wired to their intended public screens (16 focused cases pass on 2026-10-15). CRM-01 still needs acceptance evidence for indexed pagination, scoped deduplication, standalone create/edit and conversion that cannot grant login authority. CRM-02 needs API-level concurrent stage/assignment version conflict and scoped activity acceptance. CRM-03 communications, consent-aware automation and reconciled authorized reports are absent. Route coverage does not establish release regression. |
| Helpdesk / HD-01–03 | `backend/app/Modules/Helpdesk/{HelpdeskActions.php,HelpdeskCommandHandler.php,Models/}`; `packages/api-client/services/helpdesk/`; `frontend/admin/src/screens/platform_helpdesk_screen/`; `tests/api/test_helpdesk_service.py` | HD-01 needs explicit requester/agent visibility and retry-safe ticket assignment/status acceptance. HD-02 calendar/timezone SLA fixtures, duplicate escalation suppression and closed-ticket guards remain absent. HD-03 knowledge publishing permissions, deduplicated email/telephony intake and attachment/sender validation remain absent. |
| Lending / LND-01–03 | `backend/app/Modules/Lending/{LendingActions.php,LendingCommandHandler.php,LendingSchedule.php,Models/}`; `packages/api-client/services/lending/`; `frontend/admin/src/screens/platform_lending_screen/`; `tests/api/test_lending_service.py` | LND-01 still needs named jurisdiction/product rules, applicant/approver separation and immutable approved terms. LND-02 needs precision/accrual fixtures, disbursement/repayment reconciliation and duplicate settlement protection. LND-03 collateral, delinquency/as-of calculations, restructuring and write-off/reversal reconciliation are absent. |
| Framework / FW-01–05 | `backend/app/Modules/Platform/`; `packages/api-client/services/platform_workspace/`; `frontend/admin/src/screens/{platform_workspace_screen,organization_*,membership_*}/`; `tests/api/test_platform_workspace.py` | FW-01/02/03 remain bounded slices: shop-free identity exists, but shop ownership migration, worker authorization recheck/integration regression and membership/invitation lifecycle release gates remain open. A bounded FW-02 legacy-shop association design is recorded below, but is planned and unimplemented. FW-04 typed versioned capability schemas/workflows/extensions are not complete. FW-05 has local isolation groundwork and a passing eight-domain health roundtrip; the corrected 51-case API regression passed. Workspace is not full Framework parity. |
| Builder / BLD-01–03 | `backend/app/Modules/Builder/{BuilderActions.php,BuilderCommandHandler.php,BuilderBlockSchema.php,Models/Page.php}`; `packages/api-client/services/builder/`; `frontend/admin/src/screens/platform_builder_screen/`; `tests/api/test_builder_service.py`, `tests/unit/platformBuilderRoutes.test.ts` | Builder's five route adapters are wired to their intended public screens (five focused cases pass on 2026-10-15). BLD-01 needs full editor/preview round-trip plus unsafe markup/URL and private asset acceptance. BLD-02 needs expected-version conflict, expiring preview tokens, atomic publish and immutable rollback evidence. BLD-03 data binding, constrained templates and verified custom-domain routing remain absent. |
| Commerce / COM-01–03 | `backend/app/Domain/SolutionCommerce.php`, checkout-pinned immutable offerings, verified-payment hooks, durable provisioning models/migrations, solution SDK/UI and ten documented HTTP operations. The final full API suite passed 51/51, including all ten solution commands and seven solution AI tools; initial failures remain in the report history. | COM-01/02 are partial: offering publication, exact checkout quote, verified settlement, one-time entitlements, observable provisioning and owner retry exist. Refund reconciliation and platform-only purchase identity remain open. The repaired PostgreSQL trigger passed the earlier isolated server regression suite. COM-03 subscriptions and ERP billing reconciliation remain absent. |

### Current implementation and release boundary

Posted-journal database immutability and the durable worker readiness probe have
bounded implementation and regression work in the current continuation; the
corrected SQLite suite and eight-domain signed-TLS health roundtrip pass, while
the PostgreSQL suite remains in progress. The corrected 51-case API regression
has not passed. Production capacity preflight remains blocked at 2,274 MiB free
against a 2,560 MiB guard. The service release helper and smoke changes have not
been deployed. No release or production behavior is asserted here. Final release
evidence must match the eventual verified commit after the API and PostgreSQL
gates pass and capacity is resolved.

### FW-02 shop association — planned design

The next bounded FW-02 P0 implementation, after current release gates, is an
explicit association between a legacy shop and a standalone platform
organization. This is a design backlog, not implemented behavior. It has six
commands: legacy-shop challenge creation, cancellation, and administrator read;
platform-owner proof redemption, association listing, and revocation. Both the
current legacy shop administrator and current platform organization owner must
authorize association actions. A short-lived (10-minute), one-use proof is stored
as a hash and validated at the sensitive boundary before any queue acceptance,
model call, or confirmation preview. Association does not transfer or inherit
identity, roles, or permissions. The proposed persistence contract requires shop
row locking, a partial unique constraint for active associations, expected
versions, expiry, and audit history. Implementation and concurrency/revocation
acceptance remain open; no existing shop access may widen through the mapping.

## FW-01 contract and security review checklist

The bounded first slice uses the existing shop-authentication bridge:
`/v1/shops/{shop}/platform/organizations` GET/POST,
`/{id}` GET/PATCH (`name`, `expected_version`) and `/{id}/applications` GET.
These five commands use durable asynchronous acceptance and operation polling,
including business reads. This path does not make the organization a shop or
constitute standalone platform authentication. Existing mandatory `users.shop_id`
remains a limitation until FW-02. Only the worker assigns owner membership;
caller-supplied ownership, membership role, status or installation is never trusted.
The workspace application list is limited to available installed Framework
capabilities for this slice. A global shop administrator gets no organization
override. Existing commerce availability is not new organization-commerce parity.

| Review ID | Required direct-request / recovery evidence |
| --- | --- |
| FW-S01 | Ordinary authenticated user can create; anonymous/disabled/soft-deleted principal cannot; unknown payload fields cannot grant owner or install extra applications |
| FW-S02 | Same-shop nonmember and foreign-shop actor cannot list/detail/rename/poll another organization's data; a shop admin without membership is denied |
| FW-S03 | Member may read; trusted action policy controls rename role; client role changes and forged allowed-actions never escalate |
| FW-S04 | Accepted command followed by account suspension, organization suspension/deletion, membership revocation/deletion or installation disable/revoke must reject when worker executes |
| FW-S05 | Completed operation must not leak stored results after access is revoked; both operation lookup and idempotency replay need current authorization, not only matching actor/shop |
| FW-S06 | Lock principal, organization, membership and installation in one documented order; authorization changes participate in the same locking discipline; demonstrate behavior with PostgreSQL concurrent sessions |
| FW-S07 | Duplicate create idempotency key/payload yields one organization, owner and Framework install; changed payload conflicts; uniqueness also prevents concurrent code collisions |
| FW-S08 | Two renames at one expected version yield one change and one authorized conflict; suspended/deleted organization cannot mutate; server ignores immutable fields |
| FW-S09 | Page/per-page/filter validation and stable tie-breaker work at boundaries; authorized lists expose `{ data, meta }` only and only indexed filter patterns |
| FW-S10 | Worker crash/lease expiry/retry does not duplicate effects; failed transaction cannot leave orphan owner/install; poll deadlines and resumption do not resubmit mutations |
| FW-S11 | Full-page shared Create/Edit form, model enum metadata, runtime validation, all HTTP outcomes, principal/shop/org cache partitioning and temp navigation survive errors/reload |
| FW-S12 | UI, direct API, assistant/MCP/CLI and SDK capabilities use the same commands; unfinished services are not advertised as usable merely because an installation row exists |

`OrganizationAccess` alone performs separate current-state reads; it is not an
atomic worker authorization snapshot. Lock/recheck inside the worker transaction
and protect operation results independently. Cache state and interface hiding
cannot replace either decision.

## Formal model scope

`formal/Commerce/OrganizationAccess.lean` models trusted current principal,
organization, membership, application, installation and action-policy inputs. Its
guard theorems cover revoked membership, disabled principal/installation, unknown
tenant/application, unavailable application, cross-tenant targets, claimed-role
irrelevance and scoped-state isolation. The accepted-then-revoked theorem is a
current-snapshot denial theorem, not a distributed scheduling proof.

Authentication, PostgreSQL constraints/isolation, query consistency, row locks,
shop-to-organization migration, HTTP/operation-result disclosure and crash recovery
remain outside this model. The separate workspace model below adds bounded
creation/rename/version obligations; implementation tests remain necessary. No
complete Laravel/Expo correctness claim follows from guard compilation.

### Workspace transition mapping

`formal/Commerce/OrganizationWorkspace.lean` adds 15 required, statement-hashed
theorems, imported by `formal/Commerce.lean` and audited by
`tools/pipeline/proofs.py`. Roles align with FW-01: only owner may rename.

| Requirement / review checks | Workspace theorem names | Bounded interpretation |
| --- | --- | --- |
| FW-01; FW-S02–04 | `workspace_rename_unauthorized_unchanged`, `workspace_rename_nonowner_unchanged`, `workspace_rename_revoked_unchanged`, `workspace_rename_inactive_unchanged`, `workspace_rename_uninstalled_unchanged` | Denied trusted execution snapshot leaves aggregate unchanged; guard includes matching target, active principal/organization/membership, owner role and available installed Framework |
| FW-S07–08 | `workspace_rename_rejected_unchanged`, `workspace_rename_stale_unchanged`, `workspace_rename_success`, `workspace_rename_replay_unchanged` | Valid normalized name and exact version permit name update plus one increment; repeating that expected version is rejected |
| FW-S08 | `workspace_rename_preserves_identity`, `workspace_rename_sequences_preserve_identity` | Every finite sequence preserves immutable ID/code, including mixed allowed/denied commands |
| FW-S03–04 | `workspace_unauthorized_sequences_unchanged` | A finite sequence whose commands are unauthorized at the initial snapshot leaves that snapshot unchanged |
| FW-S01, FW-S07, FW-S10 | `workspace_create_denied_no_result`, `workspace_create_success_bundle`, `workspace_create_duplicate_denied` | Given trusted freshness/uniqueness/valid-input and active-principal/available-Framework inputs, construction returns organization plus active owner and installation together, or no result |

Creation models an atomic value, not a database transaction. Fresh IDs and unique
codes are assumptions established externally by PostgreSQL constraints, not proved
by these theorems. Input validation/normalization, authentication, current snapshot
acquisition and concurrent locking are also external. Versions are unbounded Lean
natural numbers, not SQL integers. Replay here means replay of an already-successful
expected version, not proof of durable idempotency-key storage. Different commands
may carry different trusted authority snapshots; the model does not prove that the
worker reads them consistently. The sequence proofs quantify over arbitrary finite
lists within this deliberately limited aggregate model.

Local verification on 2026-10-13: `lake build Commerce` and the full Python `prove()`
gate (UTF-8 mode), including statement-signature and dependency audits, passed;
`tests/pipeline/test_cli_proofs.py` passed all 14 fixture cases using
a workspace-local pytest temporary directory. The new proofs use only audited
standard logical dependencies (`propext`, with `Quot.sound` for replay arithmetic).
Release-wide test/proof/deployment evidence remains the parent pipeline's gate.

## Current continuation: identity, membership and service delivery

Development now includes separate `PlatformUser` identities and bearer-only
`/api/v1/platform` registration, login, logout, identity, organization and membership
commands. Existing shop users remain separate even when emails or numeric IDs
match. No automatic account linking or shop ownership transfer exists. Organization
membership selects a trusted principal type; invitations cannot create login
authority, and the final active owner cannot be revoked or demoted.

The new standalone full-page identity/workspace forms are registered as main
screens. They are stable destinations, not transient modal flows. The pure
`durableHistory` model is not evidence of a global native/browser navigation
adapter; existing transient screen behavior remains subject to R04 verification.

Service delivery groundwork uses authenticated HTTPS, bounded retries, signed
nonce-bound receipts, logged outbox/inbox records, deduplication and lease fencing.
HTTP runs outside local effect transactions. Central authority checks give a fresh
snapshot; they do not establish an atomic lock spanning independent databases.
Peer routes default to disabled, with empty operator-owned bindings. The opt-in
database isolation fixture demonstrates denied foreign database connections; it
does not deploy or advertise nine independent product services. CRM domain work
is in progress. All changes here remain unreleased until the complete release gate.


## HR logical model verification — 15 October 2026

`formal/Commerce/Hr.lean` adds eight registered proofs for HR-02. The model
maps `HrActions::decideLeave` to `hrDecide`: unauthorized, stale, terminal,
self-approval and inactive-employee approval requests preserve state; every
decision preserves employee identity. `hrReserve` models the guarded calendar-day
reservation in `requestLeave`; single and arbitrary finite request sequences
preserve the allowance bound when the initial used amount is within allowance.
The dates/overlap predicates, authenticated authorization snapshot, SQL integer
bounds and employee-row locking are assumptions tested separately, not proved
by Lean. These proofs do not establish payroll law, calendar correctness or
whole-program refinement. The full registered Lean build, statement-signature
and axiom gate passed on 15 October. Actual PHP/PostgreSQL execution for the
current continuation includes native SQLite feature tests. PostgreSQL locking,
separate-database integration and container runtime tests still require their
own successful execution; SQLite is not evidence for those properties.

## Historical verification checkpoint — 15 October 2026

The HTML stage report is `test-results/lifecycle/platform-expansion-20261015.html`.
The current frontend run passes 561 tests and all four coverage metrics at 100%.
All three Expo web exports and strict TypeScript checks pass. Python unit suites
pass 415 tests plus 17 subtests. Deployment tooling passes 219 tests with 100%
statement/branch coverage; pipeline/lifecycle tooling passes 325 tests with 100%
statement/branch coverage. These are bounded executable-code results, not proof
of the complete feature backlog. The first native and PostgreSQL runs exposed failures that were corrected. The
final isolated server run passes all 327 PostgreSQL tests (3,758 assertions) and
323 SQLite tests (3,737 assertions), with two PostgreSQL-only SQLite skips.
Both engines stayed within 115 MiB of PHP memory. Final executable-line coverage
is recorded by the unchanged combined Clover gate in the HTML report; this is
not a claim of complete PHP branch coverage or upstream feature parity.

The 15 October checkpoint recorded its own server and environment observations;
those observations are historical and are superseded for current build, Docker,
Composer, and integration status by the 17 October lifecycle report above. The
product feature gaps and unresolved financial-jurisdiction decisions remain open.
