# Shopify-style commerce expansion

Status: implementation in progress, 2026-09-27. Completion is tracked per capability
in [the inventory](commerce-capability-inventory.md), not implied by this plan. Existing engineering R01–R15, CRUD C01–C10 and
testing-acceptance.md apply. This dated hold statement is superseded by the
[2026-10-09 Shop3i amendment](decisions/2026-10-09-shop3i-amendment.md): a
previous hold does not block a newly authorized manual Python release run, but
no release may be claimed without current deployment and readiness evidence.

## Scope and traceability

Build an independently implemented Shopify-style product on the existing Laravel,
PostgreSQL worker and Expo architecture. Retain both storefronts and the admin app.
The previous 42-category inventory is the scope baseline, not a claim of complete
Shopify parity. Expand each category into explicit actions and acceptance examples
before coding it; broad categories alone cannot establish completion.

| Prior inventory IDs | Capability family | Delivery wave |
| --- | --- | --- |
| 35, 38 | Staff, roles, permissions, API and extension contracts | 1 |
| 13–15 | Stripe, Billplz, custom/manual methods, payment lifecycle, disputes/fraud | 2 |
| 3–10 | Products, variants/media, collections/search, imports, custom fields, inventory, purchasing/transfers/alerts | 3 |
| 11–12, 16–20 | Cart, checkout, delivery, orders, drafts/invoices, returns/refunds/exchanges, shipping/fulfillment | 4 |
| 21–25 | Customers/accounts, credit, discounts, gift cards, bundles/digital products, subscriptions/preorders/try-before-buy | 5 |
| 1–2, 26–28 | Theme/page editor, CMS/blog/navigation, email/SMS, affiliates/ads, SEO/tracking | 6 |
| 29–33, 41 | Sales-channel connectors, markets, taxes/duties, B2B, POS and sourcing | 7 |
| 34, 36–40, 42 | Analytics, automation, AI assistant, developer/headless tools, privacy and finance integrations | 8 |

The action registry, API contracts and AI access apply in every wave, not only
wave 8. Wave 8 extends analytics and advanced assistant/automation behavior.
External networks, carrier labels, advertising, tax services, POS hardware,
banking/credit/lending and proprietary Shopify services require explicit provider
integrations and eligibility. Record these as externally blocked until verified;
do not label an adapter stub, outbound link or mock as a working equivalent.
Native equivalents replace Shopify-specific infrastructure names (for example
self-hosted Expo web/headless APIs rather than claiming to implement Oxygen).
No silent omission of an inventory category; any reduced scope requires a user decision.

## One business implementation, three entry paths

Laravel AI SDK (`laravel/ai` v1) is the required AI integration layer. The private
FunctionGemma service exposes a restricted Chat Completions adapter. The SDK agent
advertises tool schemas but registers no executable SDK commerce tools; it returns
one proposal to the existing confirmation/authorization workflow. Do not replace
tenant-scoped encrypted conversations with unscoped SDK conversation continuation.
Keep inference bounded, without automatic cloud failover or extra tool loops.

Maintain a machine-readable capability manifest keyed by stable action ID with:
module, request/result schemas, handler, indexed filters, role/shop policy,
feature configuration, UI screen, AI tool, confirmation policy, test IDs, proof
mapping, implementation status, dependencies and evidence artifacts.

Generate/validate OpenAPI, TypeScript types, AI discovery and permission metadata
against the manifest. Fail CI on an unregistered business route, missing UI/AI
mapping, contract drift or unsupported role. Configuration restricts capabilities;
it cannot bypass tenant, ownership or workflow checks.

UI -> domain use case -> API -> durable operation -> worker.
AI -> permitted tool discovery -> validated draft -> confirmation -> same operation.
Direct API -> same durable operation and worker guards.

Add visible conversational interfaces to admin and both storefronts, including
available actions, missing fields, previews, confirmation, pending state and result.
Preserve R12 confirmation requirements, including natural-language reads. Do not
allow model output to supply identity, privileges or authoritative financial data.
Use permission-scoped tool retrieval for FunctionGemma as the catalog grows; test
that retrieval does not omit the intended action before measuring tool selection.

Webhooks, health probes and operation polling are documented infrastructure APIs.
Their business effects are visible in UI/API/AI, but provider credentials and
webhook impersonation are never exposed as customer assistant actions.

## Payments

Introduce provider-neutral invoices, payment attempts, allocations, events,
refunds and reconciliation records. Separate payment, invoice and fulfillment
state. Specify partial payments, multiple attempts, overpayments, currency,
rounding, refund and dispute transitions before implementing them.

Stripe becomes the default provider; preserve Billplz as optional. Simulated
payments require explicit test/demo configuration. Missing Stripe configuration
must report unavailable rather than silently settle using simulation. The admin
can configure enabled methods and their ordering per shop; checkout displays only
configured eligible methods. Store secrets outside public configuration/AI context.

Use Stripe hosted Checkout initially, server-calculated totals, provider
idempotency, signed raw-body webhooks, durable event ingestion and worker
reconciliation. Handle delayed success/failure, duplicate/out-of-order events,
expiry, refunds and disputes. A browser return is never proof of payment.
Payment-method availability depends on the merchant account, currency and region.

Custom methods are merchant/admin-created integrations, not customer-created
settlement privileges. A proposed endpoint is:

`POST /api/v1/payment-integrations/{integration}/confirm`

Minimal business payload: `{"invoice_id":"<public UUID>"}`.
Require a scoped server credential, request idempotency key and replay protection;
signed requests additionally bind a timestamp and the exact body. Never place
integration credentials in browser/mobile apps or model prompts. Recheck credential
revocation, shop, configured method and invoice eligibility when executing.

The endpoint means the trusted integration attests full payment of the immutable
invoice total/currency. It does not independently prove a bank transfer. Bind the
integration to invoices using its payment method; reject Stripe/Billplz invoices,
cross-shop IDs, cancelled/expired invoices and ambiguous partially paid invoices.
Partial payments use a separate explicit amount/reference contract. On replay,
return the original result; conflicting attestations reject. Save attestor,
invoice version, operation and event evidence without secrets.

Persist acceptance before returning 202. The worker locks the invoice/payment,
checks the current state and commits settlement exactly once in business effect.
Authorized merchant manual recording uses the same audited domain transition
through UI/API/AI, with explicit confirmation; ordinary customers cannot do it.

Sources for implementation: [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment),
[Stripe webhooks](https://docs.stripe.com/webhooks),
[Stripe idempotency](https://docs.stripe.com/api/idempotent_requests).

## Delivery and delegation

1. Audit existing behavior and create the detailed capability/action matrix and
   provider dependency inventory. Preserve existing uncommitted work.
2. Define shared contracts, migrations, permissions and state machines centrally.
3. Implement each wave as small complete UI/API/AI slices, with tests and relevant
   logical proofs in the same slice. Preserve all CRUD, screen and layering rules.
4. Use multiple subagents as required by R14: Astra for difficult design/security/
   payment/Lean review, Sol for implementation and tests, Luna for bounded inventory
   and documentation checks. Assign non-overlapping files and explicit interfaces.
5. Coordinator integrates and runs Python review/lint/unit/API/proof/build gates.
   Review findings must be resolved and affected verification rerun.
6. Run the local Docker stack, demonstrate business flows and record evidence.
   Do not publish images, deploy remotely, release or charge real funds.

## Definition of done

Each action needs a row containing UI route, API method/path, AI tool, permitted
roles, unit/API evidence, actual FunctionGemma evaluation, logical proof mapping,
provider verification state and unresolved limitations.

- UI pages exist and their view-model/rendering behavior is unit-tested; all main/
  temp routes, seven-control inventories and shared standalone forms comply.
- Required unit and real HTTP API functional tests pass against PostgreSQL and
  workers. Assert final business results and database invariants, not only 202.
- Owned executable logic meets 100% coverage under declared instrumentation;
  report PHP lines separately from branch coverage. Unsupported instrumentation
  is a visible gap, never grounds for claiming every path was covered.
- Every registered API operation and business AI action has functional evidence,
  including denied roles, cross-shop requests, validation and state conflicts.
- Run actual FunctionGemma for every business action with canonical requests and
  a frozen paraphrase/ambiguous/adversarial dataset. Canonical supported requests
  must succeed; ambiguous/unsafe requests must clarify or reject. Publish per-tool
  accuracy and all failures. Structured dispatch tests do not establish language
  accuracy. Any failed supported scenario remains open, even if overall accuracy
  is high; no claim of perfect handling of arbitrary natural language.
- Exercise retries, duplicate events, same/different idempotency payloads, expired
  leases, worker crashes, revocation, stock contention and payment races.
- Lean proves applicable logical invariants without holes or unapproved axioms;
  mappings and differential tests connect models to handlers without claiming a
  full implementation proof.
- Strict TS, lint, architecture, CRUD, indexed filters, authored logic <=1000 lines,
  secret handling and contract drift gates pass. Docker images build and local
  services complete representative customer/admin flows.
- Record sanitized HTTP transcripts, coverage, proof and review reports. Refresh
  historical metric tables rather than treating their old counts as current.
- Provider fakes establish local behavior only. Mark Stripe/Billplz/other external
  adapters sandbox-verified only after real provider sandbox tests with credentials.
  Missing credentials leave a visible external-verification blocker.

Completion labels: planned, in progress, locally verified, sandbox verified,
externally blocked. Do not report the whole clone done while a scoped capability
is missing or blocked. Local completion is distinct from production readiness;
release and deployment stay held even after all development gates pass.
