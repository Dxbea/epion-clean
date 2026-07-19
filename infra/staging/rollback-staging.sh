#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.staging.yml"
ENV_FILE=".env.staging"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

[[ -f "$COMPOSE_FILE" ]] || { echo "Missing $COMPOSE_FILE" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }
set -a
source "$ENV_FILE"
set +a

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
workers=(worker-document-corpus worker-discovery worker-editorial-shadow worker-editorial-brief worker-editorial-draft worker-editorial-verification)

echo "Activating Redis kill switches and stopping API/workers."
"${compose[@]}" exec -T redis sh -c "redis-cli -a '\$REDIS_PASSWORD' SET epion:discovery:kill-switch 1 && \
  redis-cli -a '\$REDIS_PASSWORD' SET epion:document-corpus:kill-switch 1 && \
  redis-cli -a '\$REDIS_PASSWORD' SET epion:editorial-shadow:kill-switch 1 && \
  redis-cli -a '\$REDIS_PASSWORD' SET epion:editorial-brief:kill-switch 1 && \
  redis-cli -a '\$REDIS_PASSWORD' SET epion:editorial-draft:kill-switch 1 && \
  redis-cli -a '\$REDIS_PASSWORD' SET epion:editorial-verification:kill-switch 1"
"${compose[@]}" stop epion-api "${workers[@]}"

if [[ "${1:-}" != "--restore" ]]; then
  echo "Services stopped. No database restore requested."
  exit 0
fi

dump_file="${2:-}"
[[ -f "$dump_file" ]] || { echo "Usage: $0 --restore /absolute/path/to/epion-staging.dump" >&2; exit 1; }
read -r -p "Type exactly RESTORE EPION STAGING to overwrite ${POSTGRES_DB}: " confirmation
[[ "$confirmation" == "RESTORE EPION STAGING" ]] || { echo "Restore cancelled." >&2; exit 1; }

"${compose[@]}" exec -T postgres sh -c "PGPASSWORD='${POSTGRES_PASSWORD}' pg_restore -U '${POSTGRES_USER}' -d '${POSTGRES_DB}' --clean --if-exists --no-owner --no-privileges" < "$dump_file"
echo "Database restored. Run migrate deploy only if the restored dump predates the required schema."
