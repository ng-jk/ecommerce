# Merchant-scoped bundled plugins

A shop is the merchant boundary in this release. A plugin is approved code shipped
with the application, with a separate installation record for each shop. Installing
or configuring it for one shop never enables it for another shop. New executable
plugin code requires review, tests, a build and a release; the administration API
does not accept PHP, JavaScript, package URLs or arbitrary executable uploads.

## Reference capability and interfaces

The loyalty reference plugin lets an administrator credit points to an active
account in the same shop, and lets an authorized account read its own balance.
Credits are manual adjustments with an audit reason, not currency, discounts or
automatic rewards for purchases. A per-installation maximum of 1–10,000 limits
each credit; the cumulative balance cannot exceed 2,147,483,647 points. Only an
active customer in the same shop can receive a credit, not another administrator.

| Capability | REST path under `/api/v1/shops/{shop}` | AI tool |
| --- | --- | --- |
| List installations | GET `admin/plugins` | `adminPlugins` |
| View installation | GET `admin/plugins/{id}` | `adminPlugin` |
| Install approved plugin | POST `admin/plugins` | `installPlugin` |
| Configure / disable | PATCH `admin/plugins/{id}` | `updatePlugin` |
| Read own points | GET `plugins/loyalty/balance` | `loyaltyBalance` |
| Credit same-shop account | POST `admin/plugins/loyalty/credit` | `creditLoyalty` |

All business commands use the existing database-first operation API and worker.
The admin frontend exposes standalone installation/configuration pages with a
shared form and a separate credit screen. The storefront exposes loyalty through
effective capability discovery; hiding a screen is not an authorization boundary.
AI discovery filters tools by the same effective permissions. AI confirmations
recheck those permissions and current configuration before dispatch.

## Isolation and lifecycle requirements

- Installations are disabled by default. Enabling requires an explicit admin command.
- `shop_id` scopes installation uniqueness, list/detail queries and loyalty data.
- Effective access combines the global commerce action allowlist, active account,
  same-shop membership, installed/enabled plugin and per-shop customer grant.
- Workers recheck access and lock the installation before executing plugin logic.
  Configuration changes lock that same row. A disable that commits before a pending
  operation executes causes rejection. An already committed credit is retained.
- Configuration updates require the current version; stale writes fail with conflict.
- Credits and balances commit atomically with the operation result. Retrying an
  idempotency key cannot award points twice. Cross-shop recipient IDs are rejected.
- Disabling preserves configuration, balances and audit records. This release has
  no destructive uninstall or arbitrary version-upgrade endpoint.
- Plugin settings and balances are never shared through global frontend cache keys.
  Account/shop changes must clear privileged plugin screen state.
- No plugin credentials are needed by this reference plugin. Future credentials
  must be encrypted server-side and omitted from discovery and public resources.

## Extending the system

Add a reviewed backend plugin descriptor and handler, register its bounded input
schemas and explicit actions, add its tenant-scoped migrations and permission
checks, then add frontend service/screen modules exposed only through public
indexes. Add API definitions and regenerate client and AI schemas. Do not bypass
the core operation executor to invoke a plugin from either the UI or the model.

Package separation is organizational isolation, not a sandbox. All bundled plugins
share the application process and database privileges. Untrusted merchant code
requires a separate container/service, restricted credentials and network policy;
that execution platform is outside this release. A broken shared code deployment
can still affect multiple shops even though settings and data are isolated.

## Verification and release acceptance

Unit and raw API tests must cover both merchants, forbidden direct calls, disabled
and revoked grants, stale updates, duplicate installs, idempotent credits, bounds,
cross-shop IDs, tool discovery, confirmation and execution. API evidence records
redacted requests and terminal responses. Measured owned logic coverage remains
100%; Lean models deterministic guards and isolation, not the whole implementation.

Deployment is operator-triggered through Python; a Git push never deploys. Testing
deploys first. Production promotion to main requires public HTTP and durable-worker
readiness. The additive migration does not enable plugins for existing merchants.

The implementation uses Sol agents for backend/frontend changes and an Astra agent
for formal models/security review, with integration, wire tests and release checks
owned by the coordinating agent (engineering requirement R14).

## Operator workflow

1. Sign in to Commerce Studio for the merchant and open **Plugins**.
2. Open **Install**, review the bundled loyalty capability and save. Keep it
   disabled while reviewing the configuration.
3. Open its standalone configuration page, set the per-credit limit, enable the
   plugin and optionally grant customer access. Save the current record version.
4. Use **Credit** to award points to an active customer of that merchant. The
   same operation can be requested through the assistant with review/confirmation.
5. Authorized customers see **Loyalty points** in their storefront menu. Disabling
   the plugin prevents new balance/credit operations while preserving its data.

Repeat installation for another merchant only when that merchant needs the
capability. Test installs never propagate to production. The release migration
only adds tables; no production installation or customer grant is seeded.

The release health checker identifies itself as `Shop3i-Release-Healthcheck/1.0`.
This resolves Cloudflare's rejection of the generic Python-urllib User-Agent
without disabling Cloudflare protections or changing the readiness criteria.
