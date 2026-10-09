# Independent web Mini Apps

This change implements a custom web-package host inspired by Grab's public
WebView/SDK architecture. It does not depend on Grab services or use its branding.
Existing Laravel business logic remains authoritative. Untrusted package code is
never imported into the core JavaScript bundle or executed by PHP.

## Package and installation

A ZIP contains `manifest.json`, its HTML entry and relative JS/CSS/assets. The
manifest has exactly these fields:

```json
{
  "id": "catalog-viewer",
  "name": "Catalog viewer",
  "version": "1.0.0",
  "entry": "index.html",
  "capabilities": ["catalog", "product"]
}
```

Include `packages/miniapps/services/miniapps/logic/miniapp-sdk.js` in the ZIP.
Web code imports `createMiniappSDK()` from that file. Native code uses the injected
`window.MiniappSDK`. The sample in `tests/fixtures/miniapp-catalog` handles both.
Paths are relative and case-sensitive; no remote dependencies are permitted by
the resource policy. Inline scripts/styles are blocked: use separate files.

Run operator commands as the application's `www-data` OS user (for Docker, use
`docker compose exec --user www-data backend …`). This preserves private directory
ownership so PHP-FPM can read approved assets; never make the private tree
world-writable. An operator stages a ZIP using `php artisan miniapps:import FILE.zip
--visibility=public`; private packages require `--visibility=private --shop=SLUG`.
Staging never grants execution. `miniapps:approve SLUG VERSION --approver-id=ID`
approves the exact digest and extracted asset hashes. The approver ID must appear
in `MINIAPP_APPROVER_USER_IDS`, which defaults empty. These are privileged server
operator commands: an ID flag is audit attribution, not user authentication.
`miniapps:revoke SLUG VERSION --approver-id=ID` revokes the release and advances
its approval epoch. Reapproval does not revive old launches.

The authenticated admin Mini Apps screen lists approved packages and merchant
installations. Install/create and edit are standalone pages using a shared form.
An approved public release needs no additional platform approval to install.
Private releases are installable only by their owner shop. Each merchant chooses
grants and enabled state independently; default installation is disabled. Version
and configuration revisions prevent stale changes or stale launch reuse.

The package registry is shared; installations and launches are merchant-scoped.
Approval does not confer commerce permissions, ownership or platform-admin rights.
Publicly served approved code must not contain secrets: private distribution means
restricted discovery/installation, not confidential downloadable client code.

## SDK, API and authority

The first capability set contains `catalog`, `product`, `cart.read`, `orders` and
`plugin.loyalty.balance`. The loyalty bridge also checks that the separately
installed loyalty plugin permits the current customer.
These are bounded reads. Order projections omit payment URLs and sensitive payment
or delivery metadata. There is no arbitrary URL, SQL, action name or native method
dispatch. The separate backend plugin execution/storage platform is not included
in this change, and neither are discount/fee hooks or marketplace billing.

Management/list/launch/invoke APIs use the existing durable worker queue and are
registered in OpenAPI and the assistant tool registry. Every invocation checks the
current actor, shop, installation, package approval epoch, installed version,
configuration revision, expiry and capability grant. A forged SDK message or a
direct HTTP call has no additional authority. Short-lived launch IDs are bound to
the actor; the Mini App never receives the host's bearer token or session cookie.

Web hosts use an opaque-origin sandboxed iframe and a per-launch MessageChannel.
The bootstrap fragment contains only the parent origin. The bridge validates
message shape, request/session IDs, capability arguments, payload sizes and bounded
request concurrency. It closes on unmount, identity change or document replacement.
Native hosts use a WebView bridge with restricted navigation, no shared cookies,
bounded messages and per-launch teardown. Native device/signing tests remain
separate from Docker web builds and unit tests.

## Hosting and security boundary

Set `MINIAPP_ASSET_ORIGIN` to a dedicated origin, `MINIAPP_PARENT_ORIGINS` to the
permitted storefront/admin origins, and build web clients with matching
`EXPO_PUBLIC_MINIAPP_ASSET_ORIGIN`. The asset host must not be any configured API,
storefront or admin host. Production should use a separate registered domain to
avoid shared-site cookies; never configure a parent-domain authentication cookie.
Missing production origin configuration fails closed.

The local asset host is `http://miniapps.localhost:8080`; the isolated test stack
uses port 8088. Production tunnel routing uses `MINIAPP_ASSET_HOST` and needs its
own DNS/tunnel entry. No production routing or deployment is performed by this
change. The private `miniapp_packages` volume persists archives/assets across
backend/worker restarts. It is not mounted into the static frontend containers.

Responses enforce CSP sandboxing, exact-release resource paths, no fetch/XHR,
forms, child frames, workers or objects, no MIME sniffing and no referrer. Asset
routes reject Cookie and Authorization headers and do not start Laravel web
sessions; commerce/auth routes are rejected on
the asset origin. Archive validation bounds compressed/expanded bytes, file count,
paths/types and detects duplicates, links and malformed manifests.

These controls isolate platform privileges. They do not prove arbitrary HTML/JS
harmless or establish zero Internet egress: frame self-navigation and browser
vulnerabilities remain relevant. Data intentionally returned to a Mini App is
disclosed to its code. Review must assess deceptive UI and misuse of granted data.
No uploaded bundle can prove TypeScript strict mode or source coverage; platform
source is covered by repository gates, while third-party packages require source
review/evidence separately when claiming those guarantees.

Formal authorization scope and theorem mappings are in
[the Mini App model](miniapp-formal-model.md). Runtime, browser, ZIP, cryptographic
and SQL correctness are outside that model and require implementation tests.

## Verification recorded on 2026-10-08

The isolated Docker stack runs at port 8088. All three web exports build, and the
actual fashion Mini App route loads an approved sample ZIP and returns products
through the SDK. Chromium checks confirmed an opaque frame origin, inaccessible
parent DOM/cookies, and CSP-blocked direct fetch. Native bridge behavior is unit
tested; physical Android/iOS device verification remains outstanding.

| Check | Result |
| --- | --- |
| Frontend unit tests | 233 passed; 100% statements, branches, functions and lines |
| Backend SQLite and PostgreSQL suites | Each: 101 passed, 979 assertions; combined executable-line coverage 100% (1241/1241) |
| Raw HTTP API suite | 19 passed; all 35 documented operations exercised successfully |
| Existing storefront/admin browser regressions | 5 passed |
| Python pipeline, inference and deployment tests | 160 passed |
| Python pipeline coverage | 100%, including branch coverage |
| Lean theorem audit | Passed; 16 Mini App logical theorems registered |
| Strict TypeScript, lint and architecture review | Passed |

Sanitized request/response evidence is written to `test-results/api/exchanges.json`
and endpoint coverage to `test-results/api/coverage.json`. Browser evidence and
the sample screenshot are under `test-results/miniapp-browser`; frontend coverage
is under `test-results/frontend`. Endpoint coverage is not exhaustive input-space
coverage. These local results do not constitute a production deployment or a
signed native release.
