-- Extensions required by the lot 1B search substrate.
-- Runs once at container creation, before any `prisma db push`.
--
-- unaccent only, and deliberately absent from docker/init.sql: the #477 harness never
-- needed it, this substrate calls it on every write and every read.
--
-- pg_trgm used to be created here, for a GIN trigram index this lot no longer declares.
-- Lot 7 owns approximate search and will create whatever its own measurements justify.
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- The poligraphId sequences, which `prisma db push` cannot create because they are not
-- in the datamodel: they are created by scripts/create-public-id-sequences.ts and read
-- by the publicId extension in src/lib/db.ts, which fires on every `create` for these
-- models. Without them a fixture as ordinary as `db.election.create(...)` fails with
-- `relation "poligraph_election_seq" does not exist`, and the failure points at the
-- fixture rather than at the missing sequence.
--
-- Same START 1 as the script. No setval alignment: the container starts empty, so there
-- is no existing publicId to stay ahead of.
CREATE SEQUENCE IF NOT EXISTS poligraph_politician_seq START 1;
CREATE SEQUENCE IF NOT EXISTS poligraph_affair_seq START 1;
CREATE SEQUENCE IF NOT EXISTS poligraph_factcheck_seq START 1;
CREATE SEQUENCE IF NOT EXISTS poligraph_scrutin_seq START 1;
CREATE SEQUENCE IF NOT EXISTS poligraph_party_seq START 1;
CREATE SEQUENCE IF NOT EXISTS poligraph_election_seq START 1;
CREATE SEQUENCE IF NOT EXISTS poligraph_mandate_seq START 1;
CREATE SEQUENCE IF NOT EXISTS poligraph_dossier_seq START 1;
CREATE SEQUENCE IF NOT EXISTS poligraph_group_seq START 1;
CREATE SEQUENCE IF NOT EXISTS poligraph_electoral_list_seq START 1;
