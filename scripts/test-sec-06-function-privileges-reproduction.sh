#!/usr/bin/env bash
# Isolated SEC-06 PostgreSQL 17 reproduction. No repository environment file is
# loaded, and the disposable container never connects to a shared database.
set -euo pipefail

CONTAINER_NAME="poligraph-sec06-${RANDOM}"
REPRODUCTION_PATH="$(pwd)/tests/security/sec-06-function-privileges-reproduction.sql"
TARGET_CONTRACT_PATH="$(pwd)/tests/security/sec-06-function-privileges-target-contract.sql"
MIGRATION_PATH="$(pwd)/prisma/migrations/20260815170649_sec_06_function_privileges/migration.sql"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

node --test scripts/guards/sec-06-security-definer-guard.test.mjs
node scripts/guards/sec-06-security-definer-guard.mjs

docker run --detach --rm \
  --name "$CONTAINER_NAME" \
  --env POSTGRES_PASSWORD=sec06-local-only \
  --volume "$REPRODUCTION_PATH:/reproduction.sql:ro" \
  --volume "$TARGET_CONTRACT_PATH:/target-contract.sql:ro" \
  --volume "$MIGRATION_PATH:/sec06-migration.sql:ro" \
  postgres:17-alpine >/dev/null

for attempt in $(seq 1 60); do
  if docker exec "$CONTAINER_NAME" pg_isready -h localhost -U postgres >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "SEC-06 test database did not become ready" >&2
    exit 1
  fi
  sleep 1
done

docker exec "$CONTAINER_NAME" \
  psql -U postgres -v ON_ERROR_STOP=1 -f /reproduction.sql

TARGET_OUTPUT="$(mktemp)"
if docker exec "$CONTAINER_NAME" \
  psql -U postgres -v ON_ERROR_STOP=1 --single-transaction -f /target-contract.sql \
  >"$TARGET_OUTPUT" 2>&1; then
  echo "SEC-06 target contract unexpectedly passed against the vulnerable state" >&2
  exit 1
fi

if ! grep -q "SEC-06 target invariant violated" "$TARGET_OUTPUT"; then
  echo "SEC-06 target contract failed for an unexpected reason" >&2
  sed -n '1,160p' "$TARGET_OUTPUT" >&2
  exit 1
fi

for violated_signal in \
  public \
  anon_direct \
  authenticated_direct \
  anon_effective \
  authenticated_effective; do
  if ! grep -Eq "${violated_signal}=[1-9][0-9]*" "$TARGET_OUTPUT"; then
    echo "SEC-06 target contract missed ${violated_signal}" >&2
    sed -n '1,160p' "$TARGET_OUTPUT" >&2
    exit 1
  fi
done

rm -f "$TARGET_OUTPUT"
echo "SEC-06 target contract is red against the isolated vulnerable state"

docker exec "$CONTAINER_NAME" \
  psql -U postgres -v ON_ERROR_STOP=1 -f /sec06-migration.sql

docker exec "$CONTAINER_NAME" \
  psql -U postgres -v ON_ERROR_STOP=1 --single-transaction -f /target-contract.sql

echo "SEC-06 before behavior reproduced"
echo "SEC-06 target contract passes after remediation"
