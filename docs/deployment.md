# Self-hosting

## Linux server

Use a Linux server with Docker Engine and Compose 2.24.4 or newer, enough memory to build the Expo bundles, and inbound ports 80/443. Check out this repository on the server. Point four DNS names to it: fashion, electronics, admin, and API. The example uses subdomains, but separate shop domains also work because browser requests stay on their own origin.

Create `.env` from `.env.example`, generating a fresh 32-byte base64 Laravel key and a strong database password. With Node installed, `node scripts/setup.mjs` does this without printing secrets. Keep the application key stable across upgrades. Populate `FASHION_HOST`, `ELECTRONICS_HOST`, `ADMIN_HOST`, `API_HOST`, and `TLS_EMAIL` with real values. Never commit `.env`.

```sh
docker compose -f compose.yaml -f compose.production.yaml up -d --build
docker compose -f compose.yaml -f compose.production.yaml exec backend php artisan migrate --force
docker compose -f compose.yaml -f compose.production.yaml exec backend php artisan optimize
docker compose -f compose.yaml -f compose.production.yaml exec backend php artisan commerce:admin fashion owner@example.com
docker compose -f compose.yaml -f compose.production.yaml exec backend php artisan commerce:admin electronics owner@example.com
```

The administrator command prompts for a name and password, creates the shop if necessary, and explicitly confirms before replacing an existing account. Add products through Commerce Studio. The demo seeder refuses production use. Deploy to a fresh production database rather than copying local demo accounts.

Caddy obtains and renews TLS certificates and stores them in persistent volumes. Secure, host-only session cookies isolate the browser storefronts; CSRF protection stays enabled. Native apps use `https://API_HOST` as their build-time API URL and bearer tokens. All prices are MYR.

Only Caddy publishes ports in the production configuration. PostgreSQL and PHP-FPM remain inside the Compose network. Application debug output is disabled. Caddy forwards the original host/scheme to Laravel, whose trusted proxy setting assumes this private network layout; do not expose PHP-FPM directly. Mounts expose only Laravel’s public directory and uploaded media to Caddy.

## Check and monitor

```sh
docker compose -f compose.yaml -f compose.production.yaml ps
docker compose -f compose.yaml -f compose.production.yaml logs --tail=100 backend gateway
curl --fail https://YOUR_API_HOST/up
curl --fail https://YOUR_API_HOST/api/v1/shops/fashion/products
```

Monitor `/up` for framework availability and the catalog endpoint for database-backed readiness. Alert on repeated HTTP 5xx responses, unhealthy containers, low disk space, and failed backups. No external monitoring account or automated schedule is installed by this repository.

## Backups

Back up the database, uploads, and `.env` together. The application key is necessary to preserve encrypted sessions and data. Store backups outside the server with restricted access and encryption.

On the Linux host:

```sh
mkdir -p backups
docker compose -f compose.yaml -f compose.production.yaml exec -T db pg_dump -U commerce -d commerce -Fc > backups/commerce.dump
docker compose -f compose.yaml -f compose.production.yaml exec -T backend tar -czf - -C storage/app/public . > backups/uploads.tar.gz
```

These are Linux shell commands; use binary-safe redirection when adapting to Windows. Copy `.env` using your secure backup mechanism without printing it into logs. Caddy certificate volumes can also be backed up, although certificates can be reissued.

To restore into a **fresh recovery stack**, first start its database, then:

```sh
docker compose -f compose.yaml -f compose.production.yaml exec -T db pg_restore -U commerce -d commerce --no-owner < backups/commerce.dump
docker compose -f compose.yaml -f compose.production.yaml exec -T backend tar -xzf - -C storage/app/public < backups/uploads.tar.gz
```

Use the backed-up application key and run migrations for the checked-out application version. Verify customer login, product counts, sample order totals, and media URLs. Do not restore over a live database; restore into an empty database and test before switching traffic.

## Updates and rollback

1. Take and verify a backup; record the current Git revision/image digests.
2. Pull the desired version and build the production images.
3. For a schema-changing release, enter maintenance mode with `php artisan down`, run the migrations, recreate services, run `php artisan optimize`, then `php artisan up`.
4. Check the health/catalog endpoints and perform a sample shopping and admin flow.

Compose deployment can briefly interrupt requests; this is a single-server setup, not a zero-downtime cluster. Do not automatically run destructive migrations. For rollback, restore the previous images and use a compatible database backup if a schema change cannot be reversed safely. Normal `docker compose down` retains data; `down -v` does not.

## Native release checklist

Build each storefront with its own app identifier, signing credentials, and HTTPS API origin. Test on Android and iOS devices, including secure token storage after restart and idempotent checkout after a network interruption. Docker does not build or serve installable mobile binaries. The provided EAS profiles are starting configurations and do not create remote Expo projects or upload apps automatically.
