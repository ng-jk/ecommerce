# Commerce Portfolio

Two independent shops. One Laravel API. Three Expo applications.

The next architecture is recorded in the [engineering and code review specification](docs/engineering-spec.md)
and [implementation plan](docs/implementation-plan.md): manually invoked Python release gates, layered frontends,
worker-driven stateful APIs, comprehensive logic tests, and Lean proof obligations.
These are target requirements; the current demo has not yet completed this migration.
Every CRUD must follow the [mandatory CRUD rules](docs/crud-rules.md).
Browse the [Shop3i documentation index](docs/INDEX.md) and [machine-readable requirement registry](docs/registry.json) for the product target, amendments, document catalog and evidence-aware status.
See [development dependencies](docs/dependencies.md) for the installed review,
test, mutation, and proof tools and reproducible installation commands.
See [Mini Apps](docs/miniapps.md) for the independent ZIP package format, SDK,
merchant installations, operator approval, isolation boundary and hosting setup.

- **Maison** — an editorial fashion storefront in warm neutral colours.
- **Volt** — a dark electronics storefront with product specifications.
- **Commerce Studio** — a web admin for products, stock, and order progression.

The storefronts target **web, Android, and iOS**. Docker hosts their web exports, Laravel, PostgreSQL, and the Caddy reverse proxy. Native apps connect to the same API.

## Start the local demo

Requirements: Docker Desktop with Linux containers, Docker Compose 2.24.4+, and Node.js 24 for the setup script/frontend development. PHP and Composer run in Docker.

The example environment limits Compose to one build at a time, and web builds use two Metro workers to keep memory use manageable on a development computer.

```sh
node scripts/setup.mjs
docker compose up -d --build
docker compose exec backend php artisan migrate --force
docker compose exec backend php artisan db:seed --force
```

| App             | URL                                                 |
| --------------- | --------------------------------------------------- |
| Maison          | http://fashion.localhost:8080                       |
| Volt            | http://electronics.localhost:8080                   |
| Commerce Studio | http://admin.localhost:8080                         |
| API example     | http://localhost:8080/api/v1/shops/fashion/products |

Chrome and Edge resolve `*.localhost` to the local machine. If your browser does not, map these three names to `127.0.0.1` in your hosts file. The sites share port 8080 and use separate hostnames.

Demo password: **`Portfolio2026!`**. Each shop has separate accounts:

| Shop   | Customer                  | Administrator          |
| ------ | ------------------------- | ---------------------- |
| Maison | customer@fashion.demo     | admin@fashion.demo     |
| Volt   | customer@electronics.demo | admin@electronics.demo |

You can also register a new customer in each storefront. Switching shops in the admin signs out the current account. Demo seeding is repeatable and only permitted in local/testing environments; it does not overwrite stock or passwords.

Stop with `docker compose down`. Database and uploads survive container replacement and shutdown. `down -v` deletes those volumes and their data.

## Repository

```text
backend/                 Laravel API, migrations, policies, tests
frontend/fashion/        Maison Expo app and platform configuration
frontend/electronics/    Volt Expo app and platform configuration
frontend/admin/          Commerce Studio Expo web app
packages/api-client/     Shared client and generated API types
packages/storefront/     Shopping screens and per-shop themes
packages/miniapps/       Sandboxed Mini App host, SDK and management screens
docker/                  Runtime images, web server, gateway
docs/                    API specification and deployment guide
tests/browser/           Browser shopping and admin tests
```

Shared shopping screens avoid duplicating authentication, checkout, and cart logic. Each storefront has its own Router entry points, native app identifiers, branding, and build configuration. Replace an app’s route export with its own screen to diverge its design further.

Every frontend follows the [shared module specification](docs/frontend-module-spec.md):
services expose `data/` and `logic/` through `index.ts`; screens add `interface/`
and use names such as `account_screen`. Expo routes import public screen entrypoints.
Use `npm run architecture` to check module boundaries and the Python review gate
for required folder structure. Shared workspace export maps also hide internal paths.

## Development with hot reload

```sh
npm ci
docker compose -f compose.yaml -f compose.development.yaml up -d --build
docker compose exec backend php artisan migrate --force
docker compose exec backend php artisan db:seed --force
```

Use the same `*.localhost:8080` URLs, which proxy API requests and Expo dev servers on the same origin. Open Metro directly on 8081–8083 only for native development; browser API requests require the gateway origin. Source is bind-mounted, and dependencies live in named Docker volumes. After dependency changes, run `npm ci` in a frontend container and `composer install` in the backend container, or recreate only the dependency volumes after stopping the dev stack. Do not remove the database volume.

Switch back to exported websites with `docker compose up -d --build --force-recreate`.

For native development, run Metro on the host for reliable LAN discovery:

1. Start the default Docker stack for the API.
2. Copy a storefront’s `.env.example` to its `.env` and set `EXPO_PUBLIC_API_URL` to the computer’s LAN address, e.g. `http://192.168.1.10:8080`. A phone’s `localhost` points to the phone. Android emulator can use `http://10.0.2.2:8080`.
3. Run `npm run dev:fashion` or `npm run dev:electronics`, then connect a compatible Expo Go app or development build on the same network. Allow only the required local ports through your firewall.
4. Restart Metro after changing the API address. Use HTTPS for distribution builds.

App identifiers are `com.ngjk.portfolio.fashion` and `com.ngjk.portfolio.electronics`; change these before publishing. EAS profiles are included. From the chosen app folder, configure your Expo project and use `npm exec --package=eas-cli@latest -- eas build --platform android --profile preview` for an APK or `npm exec --package=eas-cli@latest -- eas build --platform ios --profile production` for iOS distribution. Set `EXPO_PUBLIC_API_URL` in the EAS build environment. Signing credentials and store accounts are your own. Local iOS builds/simulator require macOS and Xcode; local Android builds require the Android SDK. Expo Go may lag this SDK, in which case use a development build.

## API and data rules

- REST endpoints live under `/api/v1/shops/{shop}`; prices use integer **MYR sen**.
- Accounts belong to one shop. The same email can register independently in both shops.
- Protected routes verify account shop ownership, and admin writes verify role and resource ownership. Composite foreign keys keep orders attached to accounts in the same shop.
- Browsers use host-only Sanctum sessions plus CSRF tokens. Native clients receive seven-day tokens stored in SecureStore. Logout revokes native tokens, invalidates the browser session, and advances the authorization version so queued actions cannot reuse old authority.
- Carts are stored per account. Checkout locks the account and product rows, calculates prices on the server, decrements stock transactionally, snapshots item details, and clears the cart.
- A UUID checkout key makes retries idempotent. The first successful result is returned for repeated keys. Clients persist pending keys across interrupted requests.
- Admin order states advance through `placed → processing → shipped → completed`.

See [OpenAPI specification](docs/openapi.json). Regenerate its TypeScript definitions with `npm run api:types` after changing the contract. Product prices/stock and shipping totals shown in the bag are estimates until checkout confirms them.

## Verification

The manually invoked Python entry point orchestrates repository review, strict
TypeScript lint, unit tests, Lean logic proof audits, isolated PostgreSQL/worker
API functional tests, 100% coverage, Docker builds, and deployment. GitHub Actions
workflows are removed, so pushes and pull requests start no gates or deployment.
Browser and mutation suites remain optional commands under the latest testing
specification.

```sh
python -m pip install -r tools/pipeline/requirements.lock.txt
npm ci
npm exec -- playwright install chromium
python -m tools.pipeline verify
```

The 1,000-line limit applies only to authored logic code. Deployment and release
are on hold pending local availability review. Application coverage passes the
configured gates within its documented scope. See
[refactor status and remaining requirements](docs/refactor-status.md).
Individual stages (`review`, `lint`, `test`, `prove`, `build`, `integration`,
`browser`, `coverage`, `mutation`) can run while those gaps are being resolved.
Lean uses the pinned toolchain in `formal/lean-toolchain`.

Integration uses `compose.test.yaml`, project `commerce-tests`, database
`commerce_test`, and port 8088. Browser tests run against that isolated stack,
create unique accounts and orders, and change its demo stock. Unit Laravel tests
allow only SQLite `:memory:` or explicitly isolated PostgreSQL `commerce_unit`
on the test Compose database host. Coverage combines both engines without
discarding unexecuted lines. Raw API tests check real workers and concurrency.
Sanitized requests/responses are saved in `test-results/api/exchanges.json`;
`test-results/api/coverage.json` lists every documented API method/path.

Native bundle compilation does not replace Android/iOS device testing. Signing
and distribution require separately configured credentials and destinations.

## Deployment and boundaries

See [self-hosting, backups, and upgrades](docs/deployment.md).

Checkout defaults to Stripe; configure merchant credentials before accepting payments. Billplz and server-configured custom methods are optional; simulation requires an explicit demo/test override. Shipping remains a flat RM 8 within Malaysia. Tax calculation, carrier integrations, variants/sizes, refunds, transactional email, password reset, and email verification remain planned in the Shopify-style expansion. Web apps use client-side routing with server fallback; server-rendered product SEO is not included. Product images use external HTTPS URLs; file-upload UI remains planned.

Dependency notes: React 19.2.3, Reanimated 4.5.1, and Worklets 0.10.1 are pinned to the Expo SDK 57 compatibility matrix. An override upgrades Xcode tooling’s UUID library to 11.1.1. The remaining npm audit findings concern Expo Router’s older `query-string` / `decode-uri-component` chain; an incompatible ESM major override is deliberately avoided. Review upstream fixes before a public launch. Static production web containers do not ship Node tooling or `node_modules`.

## Durable operation API

Business requests require a UUID `Idempotency-Key` and a random 64-character
hexadecimal `X-Operation-Token`. A `202` response means the operation was stored;
it does not mean the business action succeeded. Poll the returned `poll_url`
with the receipt token and the same account credentials. Interpret its terminal
`status`, `http_status`, `result`, and `state`. The shared client handles this.

Workers claim operations with PostgreSQL row locks, recheck authorization and
record versions, commit results with business changes, and recover expired
claims with bounded retries. Start the `worker` service alongside the API.
PostgreSQL database caching is durable storage, not a separate RAM-only engine.

## Conversational API (FunctionGemma 270M)

Laravel AI SDK v1 now mediates model requests. The admin and both storefronts have
an `/assistant` screen. See [SDK and payments implementation](docs/ai-sdk-and-payments.md)
for Stripe/custom-method configuration and the explicitly remaining scope.
The current [capability inventory](docs/commerce-capability-inventory.md) tracks the
Shopify-style expansion; the entire clone is not yet complete.

`POST /api/v1/shops/{shop}/assistant` accepts natural language or structured
follow-up data. Like existing operations it first returns 202; use the returned
`poll_url` with `X-Operation-Token` to retrieve the response.

Local inference setup:

1. Accept Google's model terms at https://huggingface.co/google/functiongemma-270m-it.
2. Set `HF_TOKEN` to an authorized read token in the root `.env` (never commit it).
3. Run `docker compose -f compose.yaml -f compose.assistant.yaml up -d --build`.
4. Run `docker compose exec backend php artisan migrate --force`.

The inference service has no published port. Its Docker health check reports
whether the official model loaded. If download access is unavailable, language
requests fail safely; no fake model or keyword fallback is substituted.
The structured `action`/`data` path and discovery still work without inference.

Send `Idempotency-Key` (new UUID per turn, same on retries) and
`X-Operation-Token` (64 random hex characters, the SAME receipt throughout a
conversation). Authenticated actions also require the existing session/Bearer
credentials. Browser callers retain the existing CSRF requirements.

Example request bodies, sent sequentially after polling each preceding turn:

```json
{"message":"Add the everyday overshirt to my cart"}
```

```json
{"conversation_id":"<returned UUID>","conversation_version":1,"data":{"quantity":2}}
```

```json
{"conversation_id":"<returned UUID>","conversation_version":2,"confirm":true}
```

Use the actual returned version, not the example number. The response contains
`available_actions`, `message`, `required_input`, `collected_data` and a preview.
Every natural-language proposal (including reads) and every mutation requires
an unchanged preview and a separate `confirm:true` turn. Explicit structured reads
can execute immediately. Inferred values absent from the message are discarded;
missing required values are requested again.
Checkout quotes include server prices; changed prices or record versions reject
execution. Conversations expire after 30 minutes and are scoped to shop, user and
receipt. New actions require a new conversation. Arrays replace previous values;
nested object fields merge. Credentials belong in `data`, never in `message`.

`{"discover":true}` returns the caller-authorized tools and schemas.
`{"action":"catalog","data":{"page":1}}` explicitly selects a registered action.
All 19 documented operations are registered, including the assistant itself and
operation polling; those two infrastructure operations are intentionally excluded
from model dispatch to prevent recursive calls. All 17 commerce actions dispatch
through the same backend executor as their existing HTTP endpoints.

Regenerate registry after contract changes:
`python scripts/generate-assistant-registry.py` then `npm run api:types`.
Unit checks reject missing route registration and stale registry schemas.

Verification: `python -m pytest tests/inference`, Laravel `AssistantTest`, and
`python -m tools.pipeline integration`. Inference unit tests use controlled model
outputs; they do not establish the real model's language accuracy. Official-model
accuracy evaluation requires access to the weights and must be reported separately.
Deployment and release remain on hold.

Local verification on 2026-09-23: the official model loaded successfully, and
"List all products" followed by confirmation executed through the real worker.
Recorded responses: `test-results/assistant-live-confirmed.json`.
The preliminary base-registry benchmark selected the expected tool on 11/17 fixed
prompts (`test-results/model-evaluation.json`). This benchmark uses generated base
schemas rather than runtime cart extensions and measures selection only, not
argument correctness. The model has not been domain fine-tuned; broader language
reliability remains unfinished. Use discovery and structured action/data when a
proposal is wrong. Do not treat passing code coverage as language accuracy.


### Configurable access and API audit

`backend/config/commerce.php` is the permission source for all 17 current business
actions. Each action declares `enabled` and explicit `guest`, `customer`, `admin`
roles. A signed-in ordinary user is a `customer`; there is no separate `user` role.
Rules restrict both REST ingress and worker execution. They cannot override admin,
tenant, ownership, account-state or version checks. Disabled/missing rules deny
access. Assistant discovery (`{"discover":true}`) returns the caller's role and
only available tools, including effective `allowed_roles` and input schemas.

To run with the config file mounted instead of rebuilding for permission changes:

```sh
docker compose -f compose.yaml -f compose.assistant.yaml -f compose.permissions.yaml up -d --build
```

After editing the config, clear any cached Laravel configuration in the backend
and worker (`php artisan config:clear`), then restart both services. Keep the same
configuration on both. Restricting an action also invalidates pending execution
and confirmation; discovery is guidance, never the authorization boundary.
Normal limits are 300 commerce requests/minute and 30 assistant turns/minute.
The isolated test override increases limits for the larger HTTP audit only.

`python -m pytest tests/api -q` exercises every business tool through the assistant
for both shops as well as the original REST suite. `tests/live/test_assistant_language.py`
is an opt-in real-FunctionGemma evaluation requiring the isolated API on 8088 and
a reachable inference service. It records routing accuracy separately from
successful structured tool dispatch. All recorded wire exchanges redact secrets.

## DuitNow QR through Billplz

The integration uses Billplz hosted bills, not direct PayNet connectivity. Public
contract: https://www.billplz.com/api/ and https://support.billplz.com/api.
Configure a verified merchant account with DuitNow QR enabled on each collection.
The requested `BP-RHBQR` bank code can fall back to the provider's payment chooser;
configure the collection's allowed methods if QR-only checkout is required.

For an explicitly simulated demo only, set `PAYMENT_DRIVER=simulated`.
Set `PAYMENT_DRIVER=billplz`, `BILLPLZ_SANDBOX=true`, the API key, X Signature key,
and each shop's collection ID in the root `.env` (names in `.env.example`).
Set `PAYMENT_WEBHOOK_BASE_URL=https://api.your-domain.example` and each shop's
HTTPS return URL to its `/orders` page. Both local Compose and the future release Compose forward these to backend and worker.
Rebuild images, run migrations, and restart both services when enabling payments.
Sandbox and production accounts/keys are separate; never switch credentials while
unsettled bills remain without reconciling them first.

The worker creates a bill after checkout commits. Customer and admin order APIs
include `payment`, `payment_label`, and `can_fulfill`; the existing AI order tools
return those same authorized values. Storefront orders offer the provider payment
link. The callback URL is generated as
`{PAYMENT_WEBHOOK_BASE_URL}/api/v1/payments/billplz/{payment-public-uuid}`.
The public callback accepts signed form/JSON data, stores an encrypted deduplicated
inbox record, and responds 200. The worker retrieves the bill from Billplz and checks
its collection, payment reference, amount, and paid amount before settlement.
The browser return URL never marks an order paid.

Stock is reserved at checkout. Only verified provider deletion releases it, once;
failed attempts keep the bill payable. Known unpaid bills are reconciled every five
minutes. Transport failures stop after 12 attempts (callback retries after 5).
Ambiguous bill creation becomes `review` with stock held: there is no blind second
POST. A signed callback can recover its bill by the payment reference. Merchant
review is required when creation is uncertain and no callback arrives. For known pending bills, provider reconciliation observes a later deletion.
For a `review` record, a new signed callback can trigger recovery; otherwise
operator-assisted investigation is required before changing any stored state. Refunds and an in-app manual recovery console are not implemented.

Deployment/release remain on hold. Local tests use HTTP fakes, not real money or
an acquirer sandbox account. Before live activation, test actual QR success/failure,
duplicate/delayed callbacks, public TLS routing, and return URLs with merchant keys.


Historical payment verification (2026-09-26; superseded by the expansion evidence): 65 PHP tests / 567 assertions passed on SQLite
and PostgreSQL, with combined 712/712 executable application lines covered. The
109 frontend unit tests passed the 100% statement/branch/function/line gate; strict
TypeScript and ESLint passed. All 17 Lean theorem checks passed. The 13 real HTTP
API tests recorded 649 sanitized exchanges and successful coverage of all 20
contract operations, including the payment flow through the AI interface.
Evidence is under `test-results/php/duitnow-coverage.json`,
`test-results/api/coverage.json`, and `test-results/api/exchanges.json` (ignored).
These results use an isolated provider fixture, not Billplz merchant sandbox/UAT.
