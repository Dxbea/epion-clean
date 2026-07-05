#!/usr/bin/env bash
set -euo pipefail

# --- Configuration ---
BACKUP_DIR="/opt/epion/backups/postgres"
RETENTION_DAYS=14
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

# --- Resolve project root ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

# --- Preflight checks ---
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found in $PROJECT_ROOT" >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "ERROR: $COMPOSE_FILE not found in $PROJECT_ROOT" >&2
  exit 1
fi

# --- Load required variables ---
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

: "${POSTGRES_DB:?POSTGRES_DB is not set in $ENV_FILE}"
: "${POSTGRES_USER:?POSTGRES_USER is not set in $ENV_FILE}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is not set in $ENV_FILE}"

# --- Prepare backup directory ---
mkdir -p "$BACKUP_DIR"

# --- Generate filename ---
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_FILE="$BACKUP_DIR/epion-postgres-${TIMESTAMP}.dump"

# --- Run backup ---
echo "Starting PostgreSQL backup..."
echo "  Database: $POSTGRES_DB"
echo "  Target:   $DUMP_FILE"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  bash -c "PGPASSWORD='$POSTGRES_PASSWORD' pg_dump -U '$POSTGRES_USER' -d '$POSTGRES_DB' -Fc" \
  > "$DUMP_FILE"

# --- Verify output ---
if [[ ! -s "$DUMP_FILE" ]]; then
  echo "ERROR: Backup file is empty or was not created" >&2
  rm -f "$DUMP_FILE"
  exit 1
fi

# --- Retention: remove backups older than N days ---
echo "Cleaning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "epion-postgres-*.dump" -type f -mtime +${RETENTION_DAYS} -delete

# --- Summary ---
FILE_SIZE="$(du -h "$DUMP_FILE" | cut -f1)"
echo ""
echo "=== Backup complete ==="
echo "  File: $DUMP_FILE"
echo "  Size: $FILE_SIZE"
echo "  Date: $(date '+%Y-%m-%d %H:%M:%S')"
