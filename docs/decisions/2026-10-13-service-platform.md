# Shop3i service platform scope amendment — 2026-10-13

Status: accepted product scope; implementation roadmap, not released functionality.
This amendment supersedes the commerce-only product definition in the
[2026-10-09 amendment](2026-10-09-shop3i-amendment.md). Engineering R01–R15,
CRUD C01–C10, interface parity, isolation and release requirements continue to apply.

## Product scope

Shop3i is a general-purpose, multi-organization business service platform.
Its e-commerce website showcases and sells general and customized product solutions.
Commerce remains an application of the platform. An organization can use other
applications without becoming a merchant or opening a storefront.

The user listed nine reference projects, plus e-commerce. All nine are included:
ERPNext, Frappe HR, Learning, Insights, CRM, Helpdesk, Lending, Framework and Builder.
Their names identify reference products, not Shop3i branding or a claim of affiliation.
Their full breadth is a target; no cloned repository, placeholder screen or generic
CRUD endpoint establishes feature equivalence.

## Implementation strategy

Accepted direction: implement equivalent capabilities as Laravel/PostgreSQL
services and Expo/TypeScript Mini Apps using the existing platform contracts.
The user confirmed native Laravel/Expo rebuilding, using upstream projects as
references. Source copying requires the provenance and license checks below.
The user additionally permits Redis as an optional cache service. This does not
authorize replacing PostgreSQL durable command/event storage with Redis queues.

The original apps depend on Frappe's Python/JavaScript framework and its runtime.
Cloning them does not convert them to Laravel/Expo services. If original apps are
selected, record their supported runtime/database versions, Redis requirements,
dependencies between apps, identity integration and exceptions explicitly. Do not
describe individual Frappe apps as independent microservices merely because each
has a container: upstream shared-framework/schema dependencies must be assessed.

## Reference projects and source reuse

Repository license labels checked on 2026-10-13:

| Reference | Official source | Repository license | Proposed Shop3i responsibility |
| --- | --- | --- | --- |
| ERPNext | https://github.com/frappe/erpnext | GPL-3.0 | Accounting, procurement, stock, manufacturing, assets and projects |
| Frappe HR | https://github.com/frappe/hrms | GPL-3.0 | Employees, recruitment, attendance, leave and payroll |
| Learning | https://github.com/frappe/lms | AGPL-3.0 | Courses, enrollment, assessments, progress and certificates |
| Insights | https://github.com/frappe/insights | AGPL-3.0 | Authorized data sources, datasets, reports and dashboards |
| CRM | https://github.com/frappe/crm | AGPL-3.0 | Leads, contacts, activities and sales pipeline |
| Helpdesk | https://github.com/frappe/helpdesk | AGPL-3.0 | Tickets, queues, service levels and knowledge articles |
| Lending | https://github.com/frappe/lending | GPL-3.0 | Loan applications, schedules, disbursements and repayments |
| Framework | https://github.com/frappe/frappe | MIT | Application contracts, schemas, permissions, workflows and extension SDK |
| Builder | https://github.com/frappe/builder | MIT | Visual page composition, revisions, preview and publishing |

Record the actual source revision, license files, attribution and modifications
before importing any upstream source. A translation can remain a derivative;
changing language or isolating a service does not automatically remove license
obligations. Distribution and hosted modifications require review against the
specific licenses. Preserve required notices and source availability obligations.
Use Shop3i-owned branding and assets. Cloning for study is distinct from adopting
code into shipped services.

Sources: [Frappe products](https://frappe.io/products),
[framework architecture](https://docs.frappe.io/framework-git/getting-started/architecture),
[license and trademark policy](https://docs.frappe.io/legal/others/license-and-trademark),
and the official repositories listed above.

## Service boundaries and authority

The platform owns organizations, identity, membership, application installations,
entitlements, scoped permissions, service discovery and operation/audit contracts.
An organization can have zero or more shops and multiple applications. Existing
shop-scoped access must not be widened by assigning a new organization identifier.
Migration requires explicit shop-to-organization ownership and denial tests.

Each application service owns its database, credentials, migrations, business
rules, workers and API. Database-per-service is distinct from database-per-customer:
shared versus dedicated tenant deployments are explicit profiles. Services never
join or mutate another service's database. Cross-service identifiers are typed
references, not cross-database foreign keys.

UI, AI chat/MCP/CLI and HTTPS/SDK adapters invoke the same authorized commands in
each owning service. A capability descriptor records its service/version, input
and result schemas, permissions, tenant scope, confirmation and availability.
Installation or discovery cannot grant permissions by itself. The worker rechecks
current membership, entitlement, installation and business state at execution.

Durable command/inbox/outbox rows and worker leases stay in PostgreSQL. NOTIFY is
a local wakeup, not a cross-database message bus. A relay delivers committed
outbox events over authenticated service APIs; destination inboxes deduplicate,
retain retry/dead-letter evidence and wake their own workers. This is at-least-once
delivery. Cross-service workflows use explicit compensations and reconciliation;
no distributed transaction or exactly-once side effect is assumed.

Redis may cache disposable values with bounded expiry and organization/principal
partitioning. It cannot own accepted operations, business state, payment evidence
or execution-time permission decisions. Its Docker service is opt-in, authenticated
and private to the internal network. A cache loss must not lose committed work.

Destination transport acknowledgment follows committed inbox persistence. Event
contracts include source/event identity, tenant and recipient authority, schema
version, ordering/version guards, correlation identifiers, replay and retention.
The current event handler is a local-database transaction contract; cross-service
transport requires new implementation and recovery evidence.

Commerce owns checkout, payment-provider interaction and solution purchases.
Paid solution entitlements/provisioning become active only after verified settlement.
Free, trial, internal or explicitly granted installations follow separate authorized
entitlement rules and do not fabricate payment success. Billing
and ERP accounting must use stable posting references and reconcile rather than
both authoritatively editing the same invoice or payment. HR owns payroll rules;
ERP owns accounting postings; Lending owns loan schedules and settlement rules.
Insights consumes authorized read models/API exports, without core database
credentials or unrestricted SQL against transactional services.

Stock must have one authoritative reservation/ledger owner shared by commerce
and ERP workflows. Keep the current atomic checkout boundary until a tested
reservation/confirmation/compensation workflow replaces it. Payroll and Lending
own their subledgers; ERP accounting owns the general ledger. Posted financial
records are corrected through reversals, never hidden by ordinary soft deletion.
CRM contacts are business records and do not automatically become login identities.

Idempotency, operation polling, files, caches and uniqueness must include the
organization and relevant resource scope. Existing shop-only schemas and fixed
tool counts describe current commerce implementation, not general platform limits.
Business reads continue to use the worker contract, including Insights queries;
projections include freshness metadata and retain tenant authorization.

Framework is the shared platform foundation, not a second competing framework.
Trusted typed metadata may describe forms, schemas and workflows; custom business
logic remains versioned plugin code with the existing sandbox/SDK boundary.
Builder pages are declarative, validated and versioned. Arbitrary merchant scripts
must remain in the Mini App/plugin sandbox, never the trusted host or core service.

## Delivery phases

### Initial organization foundation milestone

The first implementation slice adds `Organization`, `OrganizationMembership`,
`OrganizationApplication`, database uniqueness/indexes and an internal
`OrganizationAccess` availability guard. `backend/config/platform.php` declares
the ten application keys; unfinished services are explicitly unavailable.
This is shared foundation code, not independently deployed product services.

The guard queries persisted principal/organization/membership/installation state,
allows only recognized membership roles, and paginates authorized installation
metadata. Organization roles do not change existing shop authorization. It is a
read snapshot, not business-command authorization: future worker handlers must
lock/recheck relevant rows and enforce action-specific permissions/entitlements
inside their execution transaction. The current tables support organizations
without shops, but existing `users.shop_id` is still mandatory; standalone platform
identity/onboarding and shop-to-organization migration remain pending.

No organization HTTP routes, UI screens, assistant tools, invitation/install
mutation handlers or entitlement/provisioning flow are claimed by this slice.
Those follow as an end-to-end milestone under the delivery and acceptance gates.
The Lean organization model describes a trusted current authorization snapshot;
it does not prove database snapshots, PHP query behavior or distributed execution.

### Framework workspace milestone

The following development slice adds five durable worker commands: organization
listing, creation, detail, owner-only rename and installed-application discovery.
Creating a workspace atomically creates an active owner membership and a free
Framework installation. It does not purchase or provision another product.
Create/Edit are full pages sharing one form; membership, organization state,
installation, immutable code and expected version remain server authority.
Completed operation polling rechecks access, including structured AI results.

The Expo workspace entry is `/workspace`; organization pages are under
`/organizations`. HTTPS commands currently live beneath
`/api/v1/shops/{shop}/platform/organizations`, a transitional transport bridge
using the existing authenticated principal. Organizations have no shop foreign
key, and shop administrators cannot bypass organization membership. This is not
standalone shop-free identity/onboarding or a completed shop-ownership migration.
Applications discovery advertises only the available installed Framework
workspace; the other eight new product families remain unavailable.

OpenAPI generates the five assistant tools. Chat, Python SDK/CLI/MCP and the UI
invoke the same worker handlers. Natural-language previews require a separate
confirmation; deterministic SDK-proposal tests do not establish real model
accuracy. Owner rename previews capture a server version and the worker rejects
stale versions or revoked permission when the user confirms.

The [product inventory](../service-platform-product-inventory.md) pins upstream
research revisions and records the feature backlog, service owners and acceptance
criteria. A workspace is a bounded Framework feature, not full Framework parity.
All other product features and independent service deployments remain pending.

### Application delivery sequence

1. Inventory upstream feature areas and dependencies at pinned revisions; record
   native/integration strategy, source provenance and feature-level acceptance.
2. Extend organization identity, service capabilities and installations; preserve
   existing shop boundaries. Build the solution catalog and provisioning workflow.
3. Deliver one end-to-end vertical slice for CRM and Helpdesk, then Learning and
   Builder. Every slice includes UI, API and AI access, domain logic and persistence.
4. Deliver ERP capabilities in distinct domains, then HR and Lending with explicit
   accounting integration. Payroll/loan jurisdiction rules require defined scope.
5. Add Insights datasets/projections once source-service contracts are stable.
6. Expand each product through its indexed feature backlog; publish only completed
   capabilities. A first slice does not establish full upstream product parity.

## Completion criteria

Each feature has indexed requirements, ownership, implementation paths, tests,
API wire evidence and relevant bounded Lean proof mappings. Five review gates
cover requirements, architecture, code, security and compatibility. Existing
100% owned-logic coverage metrics, file-size, strict TypeScript, screen structure,
navigation and CRUD standards remain mandatory.

API tests cover wrong tenant/service, missing or revoked installation, invalid
transitions, retries, duplicate events, unavailable service, failed provisioning,
recovery and cross-service reconciliation. Live readiness checks verify each
published service and supported interface. The manually invoked Python lifecycle
builds immutable images, publishes testing then production, checks readiness and
promotes main only after success, with an HTML report. This amendment has not
deployed or implemented the nine new products.
