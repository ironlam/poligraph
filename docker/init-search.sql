-- Extensions required by the lot 1B search substrate.
-- Runs once at container creation, before any `prisma db push`:
-- the GIN trigram index cannot be created if pg_trgm is missing.
--
-- unaccent is deliberately here and absent from docker/init.sql: the #477 harness
-- never needed it, this substrate calls it on every write and every read.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
