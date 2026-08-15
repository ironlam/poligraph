#!/usr/bin/env bash
# Isolated SEC-06 PostgreSQL 17 reproduction. No repository environment file is
# loaded, and the disposable container never connects to a shared database.
set -euo pipefail

CONTAINER_NAME="poligraph-sec06-${RANDOM}"
SECURITY_TESTS_PATH="$(pwd)/tests/security"
MIGRATION_PATH="$(pwd)/prisma/migrations/20260815170649_sec_06_function_privileges/migration.sql"
TARGET_OUTPUT="$(mktemp)"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  rm -f "$TARGET_OUTPUT"
}
trap cleanup EXIT

run_sql() {
  local database="$1"
  local sql_path="$2"
  docker exec "$CONTAINER_NAME" \
    psql -U postgres -d "$database" -v ON_ERROR_STOP=1 -f "$sql_path"
}

create_database() {
  docker exec "$CONTAINER_NAME" createdb -U postgres "$1"
}

prepare_hardened_database() {
  local database="$1"
  create_database "$database"
  run_sql "$database" /security/sec-06-function-privileges-no-history.sql
  run_sql "$database" /sec06-migration.sql
  run_sql "$database" /security/sec-06-function-privileges-catalog-contract.sql
}

expect_catalog_failure() {
  local database="$1"
  local scenario="$2"
  local signal="$3"

  if docker exec "$CONTAINER_NAME" \
    psql -U postgres -d "$database" -v ON_ERROR_STOP=1 \
      --single-transaction \
      -f /security/sec-06-function-privileges-catalog-contract.sql \
      >"$TARGET_OUTPUT" 2>&1; then
    echo "SEC-06 catalog contract unexpectedly accepted ${scenario}" >&2
    exit 1
  fi

  if ! grep -q "SEC-06 catalog invariant violated" "$TARGET_OUTPUT" ||
     ! grep -Eq "${signal}=[1-9][0-9]*" "$TARGET_OUTPUT"; then
    echo "SEC-06 catalog contract failed unexpectedly for ${scenario}" >&2
    sed -n '1,160p' "$TARGET_OUTPUT" >&2
    exit 1
  fi

  echo "SEC-06 catalog contract detected ${scenario}"
}

node --test scripts/guards/sec-06-security-definer-guard.test.mjs
node scripts/guards/sec-06-security-definer-guard.mjs

docker run --detach --rm \
  --name "$CONTAINER_NAME" \
  --env POSTGRES_PASSWORD=sec06-local-only \
  --volume "$SECURITY_TESTS_PATH:/security:ro" \
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

run_sql postgres /security/sec-06-function-privileges-reproduction.sql

if docker exec "$CONTAINER_NAME" \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    --single-transaction \
    -f /security/sec-06-function-privileges-target-contract.sql \
    >"$TARGET_OUTPUT" 2>&1; then
  echo "SEC-06 target contract unexpectedly passed against the vulnerable state" >&2
  exit 1
fi

if ! grep -q "SEC-06 catalog invariant violated" "$TARGET_OUTPUT"; then
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

echo "SEC-06 target contract is red against the isolated vulnerable state"

run_sql postgres /sec06-migration.sql
run_sql postgres /security/sec-06-function-privileges-target-contract.sql

create_database sec06_without_history
run_sql sec06_without_history /security/sec-06-function-privileges-no-history.sql
run_sql sec06_without_history /sec06-migration.sql
run_sql sec06_without_history /security/sec-06-function-privileges-no-history-contract.sql

create_database sec06_partial_history
run_sql sec06_partial_history /security/sec-06-function-privileges-no-history.sql
run_sql sec06_partial_history /security/sec-06-function-privileges-partial-history.sql
run_sql sec06_partial_history /sec06-migration.sql
run_sql sec06_partial_history /security/sec-06-function-privileges-no-history-contract.sql

prepare_hardened_database sec06_adversarial_public
run_sql sec06_adversarial_public \
  /security/sec-06-function-privileges-adversarial-public.sql
expect_catalog_failure sec06_adversarial_public "an ordinary-name PUBLIC EXECUTE grant" public

prepare_hardened_database sec06_adversarial_direct
run_sql sec06_adversarial_direct \
  /security/sec-06-function-privileges-adversarial-direct.sql
expect_catalog_failure sec06_adversarial_direct "an ordinary-name anon EXECUTE grant" anon_direct

prepare_hardened_database sec06_adversarial_authenticated
run_sql sec06_adversarial_authenticated \
  /security/sec-06-function-privileges-adversarial-authenticated.sql
expect_catalog_failure sec06_adversarial_authenticated \
  "an ordinary-name authenticated EXECUTE grant" authenticated_direct

prepare_hardened_database sec06_adversarial_overload
run_sql sec06_adversarial_overload \
  /security/sec-06-function-privileges-adversarial-overload.sql
expect_catalog_failure sec06_adversarial_overload \
  "an ordinary-name overloaded routine grant" authenticated_direct

prepare_hardened_database sec06_adversarial_owner
run_sql sec06_adversarial_owner \
  /security/sec-06-function-privileges-adversarial-owner.sql
expect_catalog_failure sec06_adversarial_owner \
  "an ordinary-name alternate creator default" public

prepare_hardened_database sec06_adversarial_definer
run_sql sec06_adversarial_definer \
  /security/sec-06-function-privileges-adversarial-definer.sql
expect_catalog_failure sec06_adversarial_definer \
  "ordinary-name dynamic SECURITY DEFINER DDL" security_definer

echo "SEC-06 before behavior reproduced"
echo "SEC-06 target contract passes after remediation with historical routines present"
echo "SEC-06 target contract passes after remediation with historical routines absent"
echo "SEC-06 target contract passes after remediation with partial historical routines"
echo "SEC-06 adversarial catalog regressions detected"
