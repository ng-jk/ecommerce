# Shop3i architecture and delivery amendment — 2026-10-09

This amendment records the user's current product and architecture decisions. It supplements engineering R01–R15, CRUD C01–C10 and their linked plans. Where an older statement conflicts with an item below, this dated amendment is authoritative. The underlying implementation is not presumed complete; see [requirement status](../status/requirements.md) and [registry.json](../registry.json).

## Product and interfaces

Shop means a merchant's ecommerce3i experience. Shop3i targets responsive mobile, tablet and desktop web, native mobile, AI chat, MCP and CLI, and application integrations over HTTPS through an SDK. These interfaces share business logic, Shop data and TypeScript contracts within each runtime. PostgreSQL and backend workers remain authoritative. The 42 categories define general Shopify-style scope, not a claim that all categories are implemented.

## Durable work and service ownership

Accepted work and business state live in PostgreSQL logged durable tables. PostgreSQL `LISTEN/NOTIFY` only wakes workers; durable records remain the source of work, with polling allowed as a fallback. A transient queue or notification cannot satisfy durable acceptance. A backend agent is changing the existing polling implementation; this is work in progress, not proof the target is finished.

Shared business services serve the platform. An independently deployed plugin service owns its database, migrations and scripts, and integrates through the platform SDK/API. It receives no core database credentials and does not query core tables. Platform-managed plugin APIs own persisted plugin data when the plugin is managed by the platform.

## Extension and compatibility

Plugin business logic is code; profiles and typed settings configure deployments. Avoid company-name conditionals that grow with each customer. Plugin contracts use semantic versioning and compatibility rules. Normal customization and core updates use one codebase; forks are not required. A separate single-app deployment can use its own domain and signing profile while retaining supported service contracts. The reusable frontend Mini App host remains an applicable shared extension option.

## Reviews, tests and release

Approved proposals pass requirement, architecture, code, security and compatibility reviews. Unit and API functional tests are mandatory. Owned executable logic targets 100% TypeScript statement/branch/function/line, PHP executable-line, and Python statement/branch coverage. Browser, native and mutation checks are optional diagnostics except when a feature's own acceptance explicitly requires them. Lean proofs cover bounded models only.

The Python release flow is manually triggered once per run intent and then orchestrates validation of the exact commit, review/verification gates, testing publication, readiness probes, promotion under the defined branch policy, production publication and probes, and per-stage reports. No GitHub Actions and no Git-push deployment trigger are used. `developement` remains local-only. A previous manual hold does not block a newly authorized run intent, but an intent or successful local gate never means a deployment has completed. Report deployment only when the deployment tool and readiness evidence confirm it. The current per-environment release CLI is a baseline to migrate to this single-run behavior, not proof the orchestration is complete.

## Older statements superseded

- Any claim that Shopify-style 42-category scope is already implemented is superseded by per-capability status and evidence tracking.
- Any transient queue or notification-as-queue interpretation is superseded by durable PostgreSQL records; `LISTEN/NOTIFY` is only a wakeup.
- Any requirement for a Git push or pull request to start release work is superseded by the operator-triggered Python workflow.
- An earlier release hold is superseded only for a new, explicitly authorized release run. It is not evidence that a run occurred or succeeded.
- Browser/native/mutation testing as mandatory general release categories is superseded by the current unit/API categories; feature-specific acceptance can still require focused checks.
- Company-specific code forks and ever-growing company conditionals are superseded by shared code plus profiles, versioned contracts and service boundaries.
