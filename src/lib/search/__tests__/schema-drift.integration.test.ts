import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

// Deferred import, and not a convenience: `@/lib/db` throws at module load when
// DATABASE_URL is unset, so a top-level import would fail the whole suite instead of
// skipping this block. describeIfDisposableDb only skips the block, it cannot undo an import.
let db: typeof import("@/lib/db").db;

type IndexRow = { indexname: string; indexdef: string };
type ColumnRow = { data_type: string; is_nullable: string };

async function searchDocumentIndexes(): Promise<IndexRow[]> {
  return db.$queryRaw<IndexRow[]>`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'SearchDocument'
  `;
}

describeIfDisposableDb("SearchDocument schema", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("declares searchVector as a nullable tsvector column", async () => {
    const rows = await db.$queryRaw<ColumnRow[]>`
      SELECT data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'SearchDocument' AND column_name = 'searchVector'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.data_type).toBe("tsvector");
    // Not a style preference: a non-nullable Unsupported column makes some write
    // operations disappear from the generated client (spec 7.2).
    expect(rows[0]?.is_nullable).toBe("YES");
  });

  it("indexes searchVector with GIN", async () => {
    const indexes = await searchDocumentIndexes();
    const gin = indexes.filter(
      (i) => i.indexdef.includes("USING gin") && i.indexdef.includes("searchVector")
    );

    expect(gin).toHaveLength(1);
  });

  it("declares no derived column besides the vector", async () => {
    const columns = await db.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'SearchDocument'
    `;
    const names = columns.map((c) => c.column_name);

    // searchText and its GIN trigram index were removed with the substring fallback.
    // Asserting their absence, and not merely not asserting their presence: a column
    // recomputed on every write and indexed on every write, that nothing reads, is a
    // cost no test would otherwise notice.
    expect(names).toContain("searchVector");
    expect(names).not.toContain("searchText");

    const indexes = await searchDocumentIndexes();
    expect(indexes.filter((i) => i.indexdef.includes("gin_trgm_ops"))).toHaveLength(0);
  });

  it("indexes visibility", async () => {
    const indexes = await searchDocumentIndexes();

    expect(indexes.some((i) => i.indexdef.includes("visibility"))).toBe(true);
  });

  it("declares a nullable election scope with its visibility index", async () => {
    const columns = await db.$queryRaw<ColumnRow[]>`
      SELECT data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'SearchDocument' AND column_name = 'electionId'
    `;
    const indexes = await searchDocumentIndexes();

    expect(columns).toEqual([{ data_type: "text", is_nullable: "YES" }]);
    expect(
      indexes.some(
        (index) =>
          index.indexdef.includes('(\"electionId\", visibility)') ||
          index.indexdef.includes('(\"electionId\", \"visibility\")')
      )
    ).toBe(true);
  });
});

// Runs `prisma db push` the way the harness does: explicit --url so prisma.config.ts
// cannot retarget it, and DOTENV_CONFIG_PATH=/dev/null so its `import "dotenv/config"`
// cannot read the real .env. The describeIfDisposableDb gate already guarantees the URL
// is the throwaway container, this is the second lock.
function dbPush(): void {
  const url = process.env["DATABASE_URL"];
  if (!url?.includes("localhost:55433/poligraph_test")) {
    throw new Error(`refusing db:push against ${url}`);
  }
  execFileSync("npx", ["prisma", "db", "push", "--url", url, "--accept-data-loss"], {
    env: { ...process.env, DOTENV_CONFIG_PATH: "/dev/null" },
    stdio: "pipe",
  });
}

/**
 * The exact set expected, spelled out rather than counted.
 *
 * Counting them was weaker than it looked: `_` is a single-character wildcard in LIKE,
 * so 'poligraph_%' also matches a hypothetical "poligraphX...", the query did not pin
 * the schema, and a missing required sequence plus any unrelated matching one keeps the
 * total at ten. Listing the names is also the point of the test: it fails the day an
 * eleventh sequence is added to scripts/create-public-id-sequences.ts without being
 * added to docker/init-search.sql, which is exactly the drift that would otherwise
 * surface as a fixture failing to create a row.
 */
const EXPECTED_PUBLIC_ID_SEQUENCES = [
  "poligraph_affair_seq",
  "poligraph_dossier_seq",
  "poligraph_election_seq",
  "poligraph_electoral_list_seq",
  "poligraph_factcheck_seq",
  "poligraph_group_seq",
  "poligraph_mandate_seq",
  "poligraph_party_seq",
  "poligraph_politician_seq",
  "poligraph_scrutin_seq",
];

/** Filtered in JavaScript, so no LIKE pattern can widen the match. */
async function publicIdSequences(): Promise<string[]> {
  const rows = await db.$queryRaw<{ sequencename: string }[]>`
    SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename
  `;
  return rows.map((row) => row.sequencename).filter((name) => name.startsWith("poligraph_"));
}

// One `prisma db push` through npx costs about four seconds, so the two tests below
// blow through vitest's 5s default. The timeout is per test and generous on purpose:
// a tighter one would fail on a cold npx cache rather than on a real regression.
const DB_PUSH_TIMEOUT_MS = 60_000;

describeIfDisposableDb("db:push drift", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
  });

  it(
    "silently drops a column and an index that the schema does not declare",
    async () => {
      await db.$executeRaw`ALTER TABLE "SearchDocument" ADD COLUMN IF NOT EXISTS "legacyVector" tsvector`;
      await db.$executeRaw`CREATE INDEX IF NOT EXISTS "idx_legacy_vector" ON "SearchDocument" USING gin ("legacyVector")`;

      const before = await db.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'SearchDocument' AND column_name = 'legacyVector'
    `;
      expect(before).toHaveLength(1);

      dbPush();

      const after = await db.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'SearchDocument' AND column_name = 'legacyVector'
    `;
      const index = await db.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE indexname = 'idx_legacy_vector'
    `;

      // No warning, no --accept-data-loss prompt, just gone. This is why the substrate
      // declares everything in schema.prisma and nothing in a manual SQL file.
      expect(after).toHaveLength(0);
      expect(index).toHaveLength(0);
    },
    DB_PUSH_TIMEOUT_MS
  );

  it(
    "keeps the declared tsvector column and its GIN index across two pushes",
    async () => {
      dbPush();
      dbPush();

      const column = await db.$queryRaw<{ data_type: string }[]>`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'SearchDocument' AND column_name = 'searchVector'
    `;
      const indexes = await db.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'SearchDocument'
    `;

      expect(column[0]?.data_type).toBe("tsvector");
      expect(
        indexes.filter(
          (i) => i.indexdef.includes("USING gin") && i.indexdef.includes("searchVector")
        )
      ).toHaveLength(1);
      // No trigram index survives either, because none is declared any more. A push that
      // reintroduced one would mean the schema drifted back.
      expect(indexes.filter((i) => i.indexdef.includes("gin_trgm_ops"))).toHaveLength(0);
    },
    DB_PUSH_TIMEOUT_MS
  );

  it(
    "keeps the publicId sequences, which the datamodel does not declare",
    async () => {
      // Not a curiosity: the lot 1 fixtures create a Politician and an Election, and the
      // publicId extension of src/lib/db.ts reads a sequence on every such create. Those
      // sequences are created by docker/init-search.sql because `prisma db push` cannot
      // create them, so the question "does a push also DROP them" decides whether the
      // measures tests can run after this file. An undeclared column and an undeclared
      // index are dropped, per the two tests above; a standalone sequence is not part of
      // the datamodel at all. Asserted rather than assumed, because the failure mode is
      // an unrelated test suite breaking depending on file order.
      expect(await publicIdSequences()).toEqual(EXPECTED_PUBLIC_ID_SEQUENCES);

      dbPush();

      expect(await publicIdSequences()).toEqual(EXPECTED_PUBLIC_ID_SEQUENCES);
    },
    DB_PUSH_TIMEOUT_MS
  );

  afterAll(async () => {
    await db.$disconnect();
  });
});
