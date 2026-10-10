// @vitest-environment node
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalTestDb, describeIfLocalDb } from "@/test/db-guard";

const url = process.env.GOVERNMENT_SUPPORT_TEST_DATABASE_URL;
const enabled = Boolean(url);
const describeMigrationDb = enabled ? describeIfLocalDb : describe.skip;

if (url) {
  const target = new URL(url);
  if (
    target.hostname !== "127.0.0.1" ||
    target.port !== "55485" ||
    target.pathname !== "/alias_test" ||
    target.username !== "alias_test" ||
    url !== process.env.DATABASE_URL
  ) {
    throw new Error("A dedicated local alias_test database is required");
  }
}

describeMigrationDb("official group SQL migration (disposable DB)", () => {
  let pool: Pool;

  beforeAll(async () => {
    assertLocalTestDb();
    pool = new Pool({ connectionString: url });
    await pool.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF; END $$`
    );
    await pool.query('DROP TABLE IF EXISTS "ScrutinOfficialGroupCount"');
    await pool.query(`ALTER TABLE "Scrutin"
      DROP COLUMN IF EXISTS "codeTypeVote",
      DROP COLUMN IF EXISTS "libelleTypeVote",
      DROP COLUMN IF EXISTS "officialGroupsHash",
      DROP COLUMN IF EXISTS "officialGroupsSourceHash",
      DROP COLUMN IF EXISTS "officialGroupsSourceUrl",
      DROP COLUMN IF EXISTS "officialGroupsSourceFetchedAt",
      DROP COLUMN IF EXISTS "officialGroupsIssues"`);
    await pool.query(`ALTER TABLE "LegislativeDossier"
      DROP COLUMN IF EXISTS "origin",
      DROP COLUMN IF EXISTS "originDocumentRef",
      DROP COLUMN IF EXISTS "originReason",
      DROP COLUMN IF EXISTS "originEvidence",
      DROP COLUMN IF EXISTS "originSourceHash",
      DROP COLUMN IF EXISTS "originSourceUrl",
      DROP COLUMN IF EXISTS "originFetchedAt"`);
    await pool.query('DROP TYPE IF EXISTS "DossierOrigin"');
    await pool.query(
      readFileSync(
        "prisma/migrations/20260917100000_add_government_support_sources/migration.sql",
        "utf8"
      )
    );
    await pool.query(`INSERT INTO "Scrutin"
      ("id", "externalId", "title", "votingDate", "legislature", "votesFor",
       "votesAgainst", "votesAbstain", "result", "updatedAt")
      VALUES ('migration-scrutin', 'MIGRATION-SCRUTIN', 'Fixture', CURRENT_TIMESTAMP,
              17, 0, 0, 0, 'ADOPTED', CURRENT_TIMESTAMP)`);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM "Scrutin" WHERE "id" = \'migration-scrutin\'');
    await pool.end();
  });

  it("preserves duplicate organeRef blocks and rejects a duplicate source index", async () => {
    await pool.query(`INSERT INTO "ScrutinOfficialGroupCount"
      ("id", "scrutinId", "sourceIndex", "organeRef") VALUES
      ('migration-group-1', 'migration-scrutin', 0, 'PO0'),
      ('migration-group-2', 'migration-scrutin', 1, 'PO0')`);

    await expect(
      pool.query(`INSERT INTO "ScrutinOfficialGroupCount"
        ("id", "scrutinId", "sourceIndex", "organeRef")
        VALUES ('migration-group-duplicate', 'migration-scrutin', 1, 'PO0')`)
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("enforces nonnegative counts at the database boundary", async () => {
    await expect(
      pool.query(`INSERT INTO "ScrutinOfficialGroupCount"
        ("id", "scrutinId", "sourceIndex", "memberCount", "forCount",
         "againstCount", "abstainCount", "nonVoterCount", "voluntaryNonVoterCount")
        VALUES ('migration-group-negative', 'migration-scrutin', 2, -1, 0, 0, 0, 0, 0)`)
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("enables RLS and leaves no direct client grants", async () => {
    const { rows } = await pool.query(
      `SELECT relrowsecurity,
        has_table_privilege('anon', '"ScrutinOfficialGroupCount"', 'SELECT') AS anon_read,
        has_table_privilege('authenticated', '"ScrutinOfficialGroupCount"', 'INSERT') AS auth_write
       FROM pg_class WHERE oid = '"ScrutinOfficialGroupCount"'::regclass`
    );

    expect(rows[0]).toEqual({ relrowsecurity: true, anon_read: false, auth_write: false });
  });
});
