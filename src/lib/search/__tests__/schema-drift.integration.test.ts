import { afterAll, beforeAll, expect, it } from "vitest";
import { describeIfLocalDb } from "@/test/db-guard";

// Deferred import, and not a convenience: `@/lib/db` throws at module load when
// DATABASE_URL is unset, so a top-level import would fail the whole suite instead of
// skipping this block. describeIfLocalDb only skips the block, it cannot undo an import.
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

describeIfLocalDb("SearchDocument schema", () => {
  beforeAll(async () => {
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

  it("indexes searchText with the trigram operator class", async () => {
    const indexes = await searchDocumentIndexes();
    const trigram = indexes.filter((i) => i.indexdef.includes("gin_trgm_ops"));

    // Without the explicit opclass the index exists but never serves a LIKE '%...%',
    // so the morphological fallback of spec 7.2 silently degrades to a sequential scan.
    expect(trigram).toHaveLength(1);
    expect(trigram[0]?.indexdef).toContain("searchText");
  });

  it("indexes visibility", async () => {
    const indexes = await searchDocumentIndexes();

    expect(indexes.some((i) => i.indexdef.includes("visibility"))).toBe(true);
  });
});
