# Shop3i target architecture

## Shared business behavior

Every interface for a Shop uses the same business logic and Shop data within its runtime. Web and native applications share TypeScript contracts and domain behavior where practical. Interfaces call the versioned application API over HTTPS through supported SDKs. The API and worker layer owns authentication, authorization, validation, workflow transitions, pricing, persistence and results. Client state is a presentation aid and never business authority.

The interfaces are responsive web for mobile, tablet and desktop; native mobile apps; AI chat; MCP and CLI clients; and application integrations using HTTPS and an SDK. The API contract is the stable boundary across these clients. AI proposals and SDK calls use the same authorized commands as direct API calls and cannot bypass confirmation requirements where required.

## Durable asynchronous work

Business commands are durably accepted before the API returns an accepted response. PostgreSQL logged tables hold the operation/inbox, jobs or transactional outbox, idempotency records, business state, results and audit events. Workers claim and execute those records with authorization rechecked at execution time, version guards, bounded retries, leases and recovery behavior. PostgreSQL `LISTEN/NOTIFY` may wake workers after commit; it is a wakeup signal only. Polling may remain as a fallback. Neither notifications nor polling is the durable queue, and unlogged or transient queues cannot hold accepted work.

PostgreSQL is authoritative for durable Shop state. Cache entries are disposable and rebuildable. Shared services own shared platform behavior. A backend plugin service is a separate service boundary with its own database and migrations; it receives narrow platform capabilities through the SDK/API and must not receive core database credentials or query core tables directly.

## Extension boundaries

Reusable frontend Mini Apps are a shared host for approved extensions, with Shop-specific installation, grants and configuration. A company that needs independent products may operate a separate single-app deployment with its own domain and signing profile while following the same API contract. These are deployment choices, not grounds to fork shared business logic for ordinary branding, configuration or feature enablement.

Backend plugin business behavior is shipped as reviewed code and is configured by profiles and versioned settings. Configuration cannot become a growing collection of company-name conditionals. Platform-managed plugin APIs own persistent plugin data. Each independently deployed plugin service owns its own schema, migrations and data. Contracts use semantic versions and compatibility rules so core updates can support multiple plugin integrations in one codebase. Forks are not required for normal customization.

Core APIs and SDKs evolve through explicit versioned contracts and compatibility review. Breaking changes require a major contract version or a migration window; compatible core upgrades do not require per-company code branches. See the [extension standards](../standards/extensions-and-quality.md) and existing [Mini App](../miniapps.md) and [bundled plugin](../merchant-plugins.md) contracts for current implementation scope.
