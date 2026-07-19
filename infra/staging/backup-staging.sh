#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.staging.yml"
ENV_FILE=".env.staging"
BACKUP_DIR="${STAGING_BACKUP_DIR:-/opt/epion-staging/backups/postgres}"
RETENTION_DAYS="${STAGING_BACKUP_RETENTION_DAYS:-14}"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

[[ -f "$COMPOSE_FILE" ]] || { echo "Missing $COMPOSE_FILE" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }

set -a
source "$ENV_FILE"
set +a
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

umask 077
mkdir -p "$BACKUP_DIR"
timestamp="$(date +%Y%m%d-%H%M%S)"
dump_file="$BACKUP_DIR/epion-staging-${timestamp}.dump"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  sh -c "PGPASSWORD='${POSTGRES_PASSWORD}' pg_dump -U '${POSTGRES_USER}' -d '${POSTGRES_DB}' -Fc" > "$dump_file"

[[ -s "$dump_file" ]] || { rm -f "$dump_file"; echo "Backup is empty" >&2; exit 1; }
find "$BACKUP_DIR" -type f -name 'epion-staging-*.dump' -mtime +"$RETENTION_DAYS" -delete
printf 'Backup created: %s\n' "$dump_file"
