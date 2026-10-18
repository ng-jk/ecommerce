# Manual Docker release

The lifecycle CLI prints the path to a standalone HTML release report in
`test-results/lifecycle/<run-id>.html`. Open it in a browser to review status,
commit, stage results, skipped stages, artifact digests and full stage history.
The report works offline. JSON and text sidecars remain internal automation
evidence; HTML is the user-facing report.

This repository has no GitHub Actions workflow. A push, pull request, or branch update does not run verification or deploy an environment. The supported deployment interface is `tools/manual_release.py`, invoked by an operator from a clean local checkout after the exact commit passes the verification gates. This guide documents the current interface; it does not claim that a host is provisioned or a release has succeeded.

The current interface below is the per-environment baseline. The authoritative
release target is one manually triggered Python run that validates the exact
commit, publishes testing, probes readiness, promotes only after its gates pass,
publishes production, probes again, and writes a report for every stage. The
single-run orchestration is not evidence of a completed deployment; retain the
per-stage reports and readiness results for each run. See [R11](engineering-spec.md#r11--python-orchestrated-manual-release-pipeline).

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

The nine-product expansion uses the opt-in `services` profile in both environments
(see the example configuration). This enables `compose.server.services.yaml` and
the server-local `tools.service_release` prepare/deploy phases. The eight domain
services each receive a distinct database and restricted PostgreSQL role; Framework
remains the central platform. Runtime credentials and private TLS material persist
in `<environment directory>/service-runtime`, outside versioned release folders.
They are generated on the server and must never be copied from test fixtures.

The prepare phase requires at least 2,560 MiB of available host memory. Deployment
stops workers before migrations, backs up domain databases, checks cross-database
connection denial and signed service readiness, then enables provisioned services.
These phases fail closed. A unit-test pass is not evidence that the production
database ACL changes or container limits work: exercise the real PostgreSQL and
container integration gates before release. Creating future databases or roles
requires reapplying the documented connection-isolation policy.

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


## Shared production/testing inference

`compose.inference.shared.yaml` runs one stable FunctionGemma container and two
fixed-upstream Caddy proxies in an independent `shop3i-inference` project. Each
proxy joins only its own application network plus the private inference network.
The model joins only the inference network: it receives no database credentials,
application volumes or public ports. Conversations, permissions and tool execution
remain in each application's backend/database. Requests share generation capacity;
a busy model can return 503, which clients must treat as a retryable outcome.

Operator configuration pins `SHARED_INFERENCE_IMAGE` to an inspected image digest,
`SHARED_INFERENCE_CACHE_VOLUME` to the retained external model cache, and
`SHARED_INFERENCE_MODEL_PATH` to its exact cached snapshot. The cache is read-only
and Hugging Face/Transformers offline flags prevent downloads. The proxies retain
the application hostname `functiongemma:8000`; backend settings need not change.

When this mode is active, remove `assistant` from both environments' private
release configuration profiles (keep `services` when deploying domain services).
Never invoke a historical release with `--profile assistant`: it would recreate a
separate model. Current manual release/rollback commands use the current operator
profile list, so ordinary application publication and compatible rollback leave
shared inference running independently. Update the shared model only in an explicit
separate maintenance operation after testing its image/model combination.

For migration, preserve both old model containers and volumes. Stop the testing
model, start the pinned shared model, then stop/disconnect the production model and
activate each proxy's `functiongemma` DNS alias. Verify real inference and guest
assistant requests in both environments. If cutover fails, stop the shared proxies,
restore each old model's original application network/DNS aliases and restart it.
Do not remove model volumes. The dedicated shared project must be restored before
application AI readiness checks after a host recovery.
