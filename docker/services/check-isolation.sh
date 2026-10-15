#!/bin/sh
set -eu
check_role() {
    runtime_role="$1"
    own_database="$2"
    foreign_database="$3"
    export PGPASSWORD="$4"
    psql -h service-db -U "$runtime_role" -d "$own_database" -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null
    if psql -h service-db -U "$runtime_role" -d "$foreign_database" -v ON_ERROR_STOP=1 -c 'SELECT 1' >/tmp/isolation-error 2>&1; then
        echo 'Foreign service database unexpectedly accessible.' >&2
        exit 1
    fi
    if ! grep -q 'permission denied for database' /tmp/isolation-error; then
        echo 'Foreign connection failed for an unexpected reason.' >&2
        exit 1
    fi
}
check_role platform_runtime platform_service domain_service "$PLATFORM_DATABASE_PASSWORD"
check_role domain_runtime domain_service platform_service "$DOMAIN_DATABASE_PASSWORD"
echo 'Both runtime credentials connect locally and are denied foreign database access.'
