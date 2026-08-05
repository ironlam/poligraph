-- Extensions required by the lot 1B search substrate.
-- Runs once at container creation, before any `prisma db push`.
--
-- unaccent only, and deliberately absent from docker/init.sql: the #477 harness never
-- needed it, this substrate calls it on every write and every read.
--
-- pg_trgm used to be created here, for a GIN trigram index this lot no longer declares.
-- Lot 7 owns approximate search and will create whatever its own measurements justify.
CREATE EXTENSION IF NOT EXISTS "unaccent";
