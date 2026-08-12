#!/usr/bin/env bash
# Isolated SEC-03 PostgreSQL contract. No repository environment file is loaded,
# and the disposable container never connects to a shared database.
set -euo pipefail

CONTAINER_NAME="poligraph-sec03-${RANDOM}"
MIGRATION_PATH="$(pwd)/prisma/migrations/20260812210000_sec_03_least_privilege_application_grants/migration.sql"
CONTRACT_PATH="$(pwd)/tests/security/sec-03-least-privilege-contract.sql"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Targeted migration guard. An intentional future public grant must change this
# security contract explicitly instead of silently broadening the application surface.
node --test scripts/guards/sec-03-public-grants-guard.test.mjs
node scripts/guards/sec-03-public-grants-guard.mjs

docker run --detach --rm \
  --name "$CONTAINER_NAME" \
  --env POSTGRES_PASSWORD=sec03-local-only \
  --volume "$CONTRACT_PATH:/contract.sql:ro" \
  --volume "$MIGRATION_PATH:/sec03-migration.sql:ro" \
  postgres:17-alpine >/dev/null

for attempt in $(seq 1 60); do
  if docker exec "$CONTAINER_NAME" pg_isready -h localhost -U postgres >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "SEC-03 test database did not become ready" >&2
    exit 1
  fi
  sleep 1
done

docker exec "$CONTAINER_NAME" psql -U postgres -v ON_ERROR_STOP=1 -f /contract.sql
