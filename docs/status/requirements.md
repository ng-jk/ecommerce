# Requirement status

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
