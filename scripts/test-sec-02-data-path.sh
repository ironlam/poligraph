#!/usr/bin/env bash
# Isolated SEC-02 contract test. It never loads repository environment files and
# never connects to a shared database. The container and its data are destroyed
# on every exit.
set -euo pipefail

CONTAINER_NAME="poligraph-sec02-${RANDOM}"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --detach --rm \
  --name "$CONTAINER_NAME" \
  --env POSTGRES_PASSWORD=sec02-local-only \
  --volume "$(pwd)/tests/security/sec-02-role-contract.sql:/contract.sql:ro" \
  postgres:17-alpine >/dev/null

for attempt in $(seq 1 60); do
  if docker exec "$CONTAINER_NAME" pg_isready -h localhost -U postgres >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "SEC-02 test database did not become ready" >&2
    exit 1
  fi
  sleep 1
done

docker exec "$CONTAINER_NAME" psql -U postgres -v ON_ERROR_STOP=1 -f /contract.sql
