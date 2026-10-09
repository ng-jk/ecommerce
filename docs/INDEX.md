# Shop3i documentation index

This index is the human entry point; [`registry.json`](registry.json) is the machine-readable catalog and requirement ledger. Paths in the registry are relative to the repository root. Generated OpenAPI component and path documents are included because they are versioned API contracts. Build output, screenshots, test reports and other generated evidence are excluded from the documentation inventory; requirement evidence paths may point to them when they exist.

The canonical engineering and CRUD requirements remain in [engineering-spec.md](engineering-spec.md) and [crud-rules.md](crud-rules.md). This index does not replace them. The [2026-10-09 Shop3i amendment](decisions/2026-10-09-shop3i-amendment.md) resolves current product, architecture, extensibility, testing and release-policy decisions where older documents conflict. Requirement statuses describe documented implementation evidence, not intent: `planned`, `partial`, `implemented`, `blocked` or `historical`.

## Product and architecture

- [Product overview](product/overview.md) — Shop3i scope, clients and delivery target.
- [Target architecture](architecture/target.md) — shared interfaces, runtime boundaries, authoritative services and persistence.
- [Extension and quality standards](standards/extensions-and-quality.md) — plugins, Mini Apps, contracts, review and test gates.
- [Decisions and amendments](decisions/2026-10-09-shop3i-amendment.md) — current decisions and superseded statements.
- [Requirement status](status/requirements.md) — evidence-aware implementation status and open work.
- [Current implementation checkpoint](status/2026-10-09-implementation.md) — delivered changes, verification limits and release blockers.
- [Company deployment profiles](company-deployment-profiles.md) — shared frontend branding and single Mini App composition.
- [Event contract](../backend/app/Modules/Events/README.md) — durable delivery, database-effect fencing and handler obligations.
- [Isolated plugin runtime](../extensions/runtime/README.md) — ZIP approval, SDK persistence and sandbox deployment.
- [Python SDK, CLI and MCP](../interfaces/python/shop3i/README.md) — shared backend capability adapters.

## Canonical requirements and plans

| Document | Purpose |
| --- | --- |
| [Engineering specification](engineering-spec.md) | R01–R15 architecture, implementation and review requirements |
| [CRUD rules](crud-rules.md) | C01–C10 mandatory backend/frontend CRUD rules |
| [Testing acceptance](testing-acceptance.md) | Required unit/API categories, coverage and evidence limits |
| [Implementation plan](implementation-plan.md) | Migration phases and acceptance gates |
| [Deployment](deployment.md) | Operator-triggered Python release and host procedures |
| [Shopify-style expansion](shopify-expansion-plan.md) | 42-category product scope and capability delivery |
| [Commerce capability inventory](commerce-capability-inventory.md) | Capability inventory and current status |
| [Merchant plugins](merchant-plugins.md) | Bundled merchant-scoped plugin contract |
| [Mini Apps](miniapps.md) | Independent web package and SDK contract |
| [Mini App formal model](miniapp-formal-model.md) | Lean model scope and implementation mapping |
| [Frontend module specification](frontend-module-spec.md) | Frontend dependency and public module boundaries |
| [Dependencies](dependencies.md) | Toolchain and reproducible dependencies |
| [AI SDK and payments](ai-sdk-and-payments.md) | AI integration and payment decisions |
| [Assistant access audit](assistant-access-audit.md) | Assistant capability and access review |
| [Refactor status](refactor-status.md) | Recorded migration status and evidence |
| [OpenAPI root](openapi.json) and [OpenAPI modules](openapi/) | Versioned API contract |

## Reading the registry

Each requirement links to one canonical document and anchor. `implementation`, `tests`, `proofs`, `evidence` and `reviews` are separate arrays of repository-root-relative paths or stable identifiers; an empty array means no path or artifact is currently asserted. Historical result tables are not promoted to current proof unless their scope and date match the requirement. The registry intentionally records known implementation as `partial` where broader product scope or missing evidence prevents an end-to-end completion claim.

## Repository instructions

These instruction files are indexed too: [repository instructions](../AGENTS.md), [backend instructions](../backend/AGENTS.md) and [fashion frontend instructions](../frontend/fashion/AGENTS.md). Vendor and generated dependency instructions are outside this product documentation inventory.
