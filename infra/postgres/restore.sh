#!/usr/bin/env bash
set -euo pipefail

# --- Configuration ---
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

# --- Resolve project root ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

# --- Argument check ---
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <path-to-dump-file>" >&2
  echo "Example: $0 /opt/epion/backups/postgres/epion-postgres-20260704-033000.dump" >&2
  exit 1
fi

DUMP_FILE="$1"

# --- Preflight checks ---
if [[ ! -f "$DUMP_FILE" ]]; then
  echo "ERROR: Dump file not found: $DUMP_FILE" >&2
  exit 1
fi

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

# --- Warning ---
echo ""
echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
echo "  WARNING: DESTRUCTIVE OPERATION"
echo ""
echo "  This will OVERWRITE the database: $POSTGRES_DB"
echo "  Using dump: $DUMP_FILE"
echo ""
echo "  All current data in '$POSTGRES_DB' will be replaced."
echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
echo ""
read -rp "Type exactly RESTORE EPION to confirm: " CONFIRMATION

if [[ "$CONFIRMATION" != "RESTORE EPION" ]]; then
  echo "Aborted. No changes were made." >&2
  exit 1
fi

# --- Run restore ---
echo ""
echo "Starting PostgreSQL restore..."
echo "  Database: $POSTGRES_DB"
echo "  Source:   $DUMP_FILE"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  bash -c "PGPASSWORD='$POSTGRES_PASSWORD' pg_restore -U '$POSTGRES_USER' -d '$POSTGRES_DB' --clean --if-exists --no-owner --no-privileges" \
  < "$DUMP_FILE"

# --- Summary ---
echo ""
echo "=== Restore complete ==="
echo "  Database: $POSTGRES_DB"
echo "  Source:   $DUMP_FILE"
echo "  Date:     $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
echo "NOTE: Run 'npx prisma migrate deploy' if migrations are ahead of this dump."
