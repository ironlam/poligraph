#!/usr/bin/env bash
# Disposable Docker Postgres 17 harness for the lot 1B search substrate tests.
#
# SAFETY: never uses .env / .env.prod / Supabase / any shared DB. It injects its
# own DATABASE_URL + DIRECT_URL pointing at a local throwaway container, forces
# DATABASE_SSL=false, and sets DOTENV_CONFIG_PATH=/dev/null so the Prisma CLI
# (prisma.config.ts runs `import "dotenv/config"`) cannot read the real .env.
# The container + volume are always destroyed on exit, including on failure.
set -euo pipefail

COMPOSE=(docker compose -f docker-compose.test-search.yml)
PORT=55433
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
  echo "[test:db:search] teardown: destroying container + volume (down -v)"
  "${COMPOSE[@]}" down -v --remove-orphans || true
}
trap cleanup EXIT

echo "[test:db:search] DATABASE_URL=$DATABASE_URL"
echo "[test:db:search] DATABASE_SSL=$DATABASE_SSL  DOTENV_CONFIG_PATH=$DOTENV_CONFIG_PATH"
"${COMPOSE[@]}" up -d

echo "[test:db:search] waiting for postgres..."
# -h localhost is not cosmetic: the entrypoint starts a TEMPORARY server to run
# /docker-entrypoint-initdb.d/*.sql, with listen_addresses='' so it only answers on
# the Unix socket. A socket probe therefore reports "ready" against a server that is
# about to be shut down, and the next command fails with "the database system is
# shutting down". Probing over TCP only succeeds once the real server is listening.
for i in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T db-search pg_isready -h localhost -U poligraph_test -d poligraph_test >/dev/null 2>&1; then
    echo "[test:db:search] ready (${i}s)"; break
  fi
  [ "$i" -eq 60 ] && { echo "[test:db:search] not ready after 60s" >&2; exit 1; }
  sleep 1
done

echo "[test:db:search] engine + extensions"
"${COMPOSE[@]}" exec -T db-search psql -U poligraph_test -d poligraph_test -c \
  "SELECT current_setting('server_version') AS version, string_agg(extname, ',' ORDER BY extname) AS extensions FROM pg_extension WHERE extname = 'unaccent';"

echo "[test:db:search] prisma generate"
npx prisma generate

echo "[test:db:search] prisma db push (schema -> disposable DB)"
npx prisma db push --url "$DATABASE_URL" --accept-data-loss

# --no-file-parallelism is not optional: the drift test runs `prisma db push` mid-suite,
# which takes a lock on SearchDocument and drops an undeclared column. With vitest's
# default parallel file execution, that races against the other test files and the
# failures look random.
if [ "$#" -gt 0 ]; then
  echo "[test:db:search] running requested test files: $*"
  npx vitest run --no-file-parallelism "$@"
else
  echo "[test:db:search] running the lot 1B integration test files"
  npx vitest run --no-file-parallelism src/lib/search
fi
