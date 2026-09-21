# Commerce Portfolio

Two independent shops. One Laravel API. Three Expo applications.

- **Maison** — an editorial fashion storefront in warm neutral colours.
- **Volt** — a dark electronics storefront with product specifications.
- **Commerce Studio** — a web admin for products, stock, and order progression.

The storefronts target **web, Android, and iOS**. Docker hosts their web exports, Laravel, PostgreSQL, and the Caddy reverse proxy. Native apps connect to the same API.

## Start the local demo

Requirements: Docker Desktop with Linux containers, Docker Compose 2.24.4+, and Node.js 24 for the setup script/frontend development. PHP and Composer run in Docker.

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
docker/                  Runtime images, web server, gateway
docs/                    API specification and deployment guide
tests/browser/           Browser shopping and admin tests
```

Shared shopping screens avoid duplicating authentication, checkout, and cart logic. Each storefront has its own Router entry points, native app identifiers, branding, and build configuration. Replace an app’s route export with its own screen to diverge its design further.

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
- Browsers use host-only Sanctum sessions plus CSRF tokens. Native clients receive seven-day tokens stored in SecureStore. Logout revokes the current native token or browser session.
- Carts are stored per account. Checkout locks the account and product rows, calculates prices on the server, decrements stock transactionally, snapshots item details, and clears the cart.
- A UUID checkout key makes retries idempotent. The first successful result is returned for repeated keys. Clients persist pending keys across interrupted requests.
- Admin order states advance through `placed → processing → shipped → completed`.

See [OpenAPI specification](docs/openapi.json). Regenerate its TypeScript definitions with `npm run api:types` after changing the contract. Product prices/stock and shipping totals shown in the bag are estimates until checkout confirms them.

## Verification

```sh
npm run typecheck
npm run export:web
docker compose exec backend php artisan test
npm exec -- playwright install chromium
npm run test:e2e
node scripts/test-concurrency.mjs
npm exec --workspace @portfolio/fashion -- expo export --platform all --output-dir dist-native
npm exec --workspace @portfolio/electronics -- expo export --platform all --output-dir dist-native
```

Laravel tests use an isolated in-memory SQLite database. The concurrency test exercises row locking against the running PostgreSQL demo. Browser tests create unique customer accounts and demo orders, and set Maison overshirt stock to 30. The concurrency test hides its fixture product afterwards. Run these integration tests against the local demo only.

Native bundle compilation checks JavaScript and Hermes output; it does not replace device testing. Before distribution, verify login persistence, navigation/back behavior, keyboard handling, checkout retries, and logout on physical Android and iOS devices.

## Deployment and boundaries

See [self-hosting, backups, and upgrades](docs/deployment.md).

This is a portfolio demo: checkout never charges a card; shipping is a flat RM 8 within Malaysia. Tax calculation, carrier integrations, variants/sizes, refunds, transactional email, password reset, email verification, and payment gateways are outside this version. Web apps use client-side routing with server fallback; server-rendered product SEO is not included. Product images use external Unsplash URLs; administrators can use their own HTTPS image URLs. The uploads volume is reserved for future file uploads, while the current admin accepts image URLs.

Dependency notes: React 19.2.3, Reanimated 4.5.1, and Worklets 0.10.1 are pinned to the Expo SDK 57 compatibility matrix. An override upgrades Xcode tooling’s UUID library to 11.1.1. The remaining npm audit findings concern Expo Router’s older `query-string` / `decode-uri-component` chain; an incompatible ESM major override is deliberately avoided. Review upstream fixes before a public launch. Static production web containers do not ship Node tooling or `node_modules`.
