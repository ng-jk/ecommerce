#!/usr/bin/env bash
set -euo pipefail
cd -- "$1"
exec 9>.deploy.lock
flock -n 9 || { echo 'Another release is running.' >&2; exit 1; }
test -s .env || { echo 'Provision the production .env first.' >&2; exit 1; }
compose() { docker compose --env-file .env --env-file release.env -f compose.release.yaml "$@"; }
rollback() {
  if test -s release.previous.env; then
    cp release.previous.env release.env
    compose up -d --remove-orphans
  fi
}
if test -s release.env; then cp release.env release.previous.env; fi
cp release.next.env release.env
trap rollback ERR
compose pull
mkdir -p backups
chmod 700 backups
if compose ps --status running db --quiet | grep -q .; then
  compose exec -T db pg_dump -U commerce commerce > "backups/pre-release-$(date +%Y%m%d%H%M%S).sql"
fi
compose up -d db
compose stop worker
compose run --rm backend php artisan migrate --force --no-interaction
compose up -d --remove-orphans --wait
compose exec -T backend php artisan route:list --path=api --except-vendor
trap - ERR
