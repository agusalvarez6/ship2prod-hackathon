#!/usr/bin/env bash
# Apply SQL migrations and seeds to the running Postgres container.
# The Postgres docker entrypoint only runs top-level .sql files in
# /docker-entrypoint-initdb.d; our compose mounts subdirs, so we
# apply them manually here.
#
# Every migration is expected to use CREATE TABLE/INDEX IF NOT EXISTS and
# ALTER TABLE ADD COLUMN IF NOT EXISTS so re-running this script is safe.
# We intentionally do NOT short-circuit on an existing `briefings` table:
# that would silently skip follow-up migrations (e.g. 003_phone_identity)
# when a user upgrades their DB, causing runtime "column does not exist"
# errors on the new UI.

set -euo pipefail

DB="${POSTGRES_DB:-insforge}"
USER="${POSTGRES_USER:-postgres}"

cyan() { printf "\033[36m%s\033[0m\n" "$*"; }

if ! docker compose ps --status running postgres >/dev/null 2>&1; then
  printf "postgres container is not running. Run: pnpm infra:up\n" >&2
  exit 1
fi

cyan "applying migrations..."
for f in infra/seed/migrations/*.sql; do
  cyan "  $f"
  docker compose exec -T postgres psql -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 < "$f" >/dev/null
done

cyan "applying seeds..."
for f in infra/seed/seed/*.sql; do
  cyan "  $f"
  docker compose exec -T postgres psql -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 < "$f" >/dev/null
done

cyan "done."
