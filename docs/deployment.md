# Manual Docker release

This repository has no GitHub Actions workflow. A push, pull request, or branch update does not run verification or deploy an environment. The supported deployment interface is `tools/manual_release.py`, invoked by an operator from a clean local checkout after the exact commit passes the verification gates. This guide documents the current interface; it does not claim that a host is provisioned or a release has succeeded.

## Branches and environments

`deployment` is the production deployment branch. `testing` is the isolated testing deployment branch. `main` is the production promotion record: after the production deployment passes public HTTP readiness and worker readiness, the release tool fast-forwards and pushes that same commit to `main`. It does not deploy `main` separately. Testing deployments never promote to production. `developement` (spelling intentional) remains local-only.

| Branch | Environment | Storefront | Electronics | Admin | API | Host gateway |
|---|---|---|---|---|---|---|
| `testing` | Testing | `test.shop3i.com` | `test-electronics.shop3i.com` | `test-admin.shop3i.com` | `test-api.shop3i.com` | `127.0.0.1:8081` |
| `deployment` | Production | `shop3i.com` | `electronics.shop3i.com` | `admin.shop3i.com` | `api.shop3i.com` | `127.0.0.1:8080` |
| `developement` | Local only | Local development host | Local development host | Local development host | Local development host | Local development |

Cloudflare Tunnel routes public hostnames to the matching loopback gateway. The Compose gateway binds only to loopback; the host does not need public inbound ports 80/443. Keep testing and production on separate Compose project names, release directories, environment files, session cookies, database names, roles, and application secrets. Set the testing DNS and environment hostnames to the agreed `test-*` names in the table; the checked-in env template still needs those values updated when the runtime configs are provisioned.

## Host and database boundary

The current target is a Linux EC2 host with Docker Engine and Compose. The server release configuration invokes `sudo -n docker compose` and uses `compose.server.yaml` as a standalone Compose project. Install Docker with the official [Docker Engine instructions](https://docs.docker.com/engine/install/). Compose builds the Laravel backend and worker, the three Expo web apps, and the Caddy loopback gateway directly on that host. No image registry is required by this release flow.

Supabase is installed and managed separately on the host using its [official self-hosted Docker Compose configuration](https://supabase.com/docs/guides/self-hosting/docker) (outside this repository). The application joins its existing private Docker network (the example names `shop3i-supabase_default`) and connects to PostgreSQL over that network. Keep Supabase configuration and secret files on the server only; do not add them to this repository. Keep production and testing data isolated with separate PostgreSQL databases and restricted database roles, and set the corresponding credentials in each private runtime environment file. The Supabase CLI is project/service tooling; it does not host this Laravel/Compose application. The recorded host tool versions are Supabase CLI 2.118.0, Supabase stack 0.8.2, and Docker Compose 2.39.4. Confirm the installed versions and health before release; this document is not a live health check.

## Prepare release configuration

Use a local Linux or Windows release workstation with Python and Git, the pinned project dependencies, Docker build support, SSH and SCP clients. Copy `tools/manual-release.example.json` to `.deploy/release.json` (the directory is ignored by Git). Set both environments' host, dedicated remote directory and runtime env-file path, project name, SSH identity and pinned `known_hosts` file, readiness URLs, and worker catalog readiness URL. The checked-in example contains placeholders and must not be passed unchanged. Keep credentials out of the JSON where possible and never commit populated runtime environment files.

On the EC2 host, create a private runtime file at the corresponding configured path. Use the checked-in [production environment example](../docker/server.production.env.example) and [testing environment example](../docker/server.testing.env.example) only as variable templates. Set unique application keys, database names/roles/passwords and session-cookie names. Configure production payment credentials and settings only in production; keep testing sandbox settings in testing. Set the Supabase network name to the actual external Docker network. Confirm Cloudflare Tunnel ingress maps each environment's four hostnames to its loopback gateway port.

## Verify and deploy

From the repository root, run the documented verification workflow for the exact commit. The release script requires a clean checkout on the matching branch and a `test-results/verified.json` report whose commit and gate list match the checkout. The six gate identifiers are `review`, `lint`, `test`, `prove`, `integration`, and `coverage`.

```sh
python -m tools.pipeline verify
```

Deploy explicitly with the current CLI. Testing requires branch `testing`; production requires branch `deployment`:

```sh
python tools/manual_release.py testing --config .deploy/release.json
python tools/manual_release.py production --config .deploy/release.json
```

The release tool archives the committed source, transfers it over SSH with strict pinned-host-key checking, and runs `sudo docker compose` against `compose.server.yaml` under the configured isolated project and runtime env file. The server validates Compose configuration, builds images locally, migrates and seeds, waits for Compose services, checks every configured public HTTPS readiness URL, then checks the worker through the catalog endpoint. On success it switches the `current` release symlink. For production only, it then verifies ancestry and fast-forwards `main` to the deployed commit, pushing that promotion record. If readiness fails, it does not promote `main`; database migration rollback is never automatic. The `backward_compatible_migrations` setting controls only whether the previous compatible release image is restarted. The script serializes deployments per environment.

A successful testing release changes only the testing host. Production promotion to `main` happens only after the production host passes HTTP and worker readiness. Never use `main` as a substitute for the `deployment` branch in the production command. The older `python -m tools.pipeline deploy` interface describes a prior release design and is not the current deployment command for this EC2 host.

## Readiness and recovery

The local example config's readiness URLs must match the intended environment. Confirm storefront, admin, API health, and worker catalog responses after the release. Continue monitoring container health, API errors, host disk, database capacity, and backup completion; this repository does not configure an external monitoring service.

Back up each environment's database, uploads volume, and runtime environment file through a secured process. Store encrypted backups outside the EC2 host and test restoration into an isolated recovery project. Keep backups and rollback images compatible with the deployed schema. `docker compose down` retains named volumes; do not remove volumes during routine release or rollback.

Compose publishes the web exports only. Android/iOS builds, signing, distribution, and device testing remain separate release work.
