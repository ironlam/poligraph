#!/usr/bin/env bash
# Disposable Docker Postgres harness for the #477 DB integration tests.
#
# SAFETY: never uses .env / .env.prod / Supabase / any shared DB. It injects its
# own DATABASE_URL + DIRECT_URL pointing at a local throwaway container, forces
# DATABASE_SSL=false, and sets DOTENV_CONFIG_PATH=/dev/null so the Prisma CLI
# (prisma.config.ts runs `import "dotenv/config"`) cannot read the real .env.
# The container + volume are always destroyed on exit, including on failure.
set -euo pipefail

COMPOSE=(docker compose -f docker-compose.test.yml)
PORT=55432
TEST_DB_URL="postgresql://poligraph_test:poligraph_test@localhost:${PORT}/poligraph_test?sslmode=disable"

# --- self-contained env; .env is never used to target the DB ---
export DATABASE_URL="$TEST_DB_URL"
export DIRECT_URL="$TEST_DB_URL"        # prisma.config.ts prefers DIRECT_URL for migrations
export DATABASE_SSL=false
export NODE_ENV=test
export DOTENV_CONFIG_PATH=/dev/null     # neutralize prisma.config.ts's dotenv/config

# --- refuse to run against anything that is not the local disposable DB ---
for v in DATABASE_URL DIRECT_URL; do
  val="${!v}"
  case "$val" in
    *"localhost:${PORT}/poligraph_test"*) : ;;
    *) echo "REFUSING: $v is not the local test DB: $val" >&2; exit 1 ;;
  esac
  case "$val" in
    *supabase*|*pooler*|*amazonaws*|*neon*) echo "REFUSING: $v looks remote/prod: $val" >&2; exit 1 ;;
  esac
done

cleanup() {
  echo "[test:db:477] teardown: destroying container + volume (down -v)"
  "${COMPOSE[@]}" down -v --remove-orphans || true
}
trap cleanup EXIT

echo "[test:db:477] DATABASE_URL=$DATABASE_URL"
echo "[test:db:477] DATABASE_SSL=$DATABASE_SSL  DOTENV_CONFIG_PATH=$DOTENV_CONFIG_PATH"
"${COMPOSE[@]}" up -d

echo "[test:db:477] waiting for postgres..."
for i in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T db-test pg_isready -U poligraph_test -d poligraph_test >/dev/null 2>&1; then
    echo "[test:db:477] ready (${i}s)"; break
  fi
  [ "$i" -eq 60 ] && { echo "[test:db:477] not ready after 60s" >&2; exit 1; }
  sleep 1
done

echo "[test:db:477] prisma generate"
npx prisma generate

echo "[test:db:477] prisma db push (schema -> disposable DB)"
npx prisma db push --url "$DATABASE_URL" --accept-data-loss

echo "[test:db:477] creating poligraphId sequences (publicId generator backing)"
npx tsx scripts/create-public-id-sequences.ts

echo "[test:db:477] running the two #477 integration test files"
npx vitest run \
  src/services/sync/reconcile-scrutin-dossier/__tests__/remediate.integration.test.ts \
  src/services/scrutin-policy-title/__tests__/force-regen-fields.integration.test.ts
