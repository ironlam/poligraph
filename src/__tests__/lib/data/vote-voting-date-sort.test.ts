import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Parity test for Phase 5b read migration.
 *
 * Asserts that:
 *   1. Sorting Vote rows by the new `votingDate` column produces the SAME
 *      ordering as the old `orderBy: { scrutin: { votingDate } }` JOIN.
 *   2. Filtering Vote rows by the new `chamber` + `votingDate` columns
 *      produces the SAME result as the old relation-based where filter.
 *
 * Requires a dev DB with at least one politician who has > 5 votes.
 * Skips automatically if no such politician exists or if DATABASE_URL is unset
 * (vitest doesn't auto-load .env, so CI runs this as a no-op — it's a manual
 * parity check, run it with `npx dotenv -e .env -- npx vitest run ...`).
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("Vote denormalization parity with Scrutin", () => {
  let politicianId: string | null = null;
  let db: typeof import("@/lib/db").db;

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    const candidate = await db.politician.findFirst({
      where: { votes: { some: {} } },
      select: { id: true },
    });
    politicianId = candidate?.id ?? null;
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("new sort matches old JOIN sort for the same politician", async () => {
    if (!politicianId) {
      console.warn("No politician with votes in dev DB — skipping parity test");
      return;
    }

    const oldSort = await db.vote.findMany({
      where: { politicianId },
      orderBy: [{ scrutin: { votingDate: "desc" } }, { id: "asc" }],
      select: { id: true },
      take: 100,
    });

    const newSort = await db.vote.findMany({
      where: { politicianId },
      orderBy: [{ votingDate: "desc" }, { id: "asc" }],
      select: { id: true },
      take: 100,
    });

    expect(newSort.map((v) => v.id)).toEqual(oldSort.map((v) => v.id));
  });

  it("new chamber + date filter matches old relation filter", async () => {
    if (!politicianId) return;

    const since = new Date();
    since.setMonth(since.getMonth() - 6);

    const oldFilter = await db.vote.findMany({
      where: {
        politicianId,
        scrutin: { chamber: "AN", votingDate: { gte: since } },
      },
      orderBy: [{ scrutin: { votingDate: "desc" } }, { id: "asc" }],
      select: { id: true },
      take: 200,
    });

    const newFilter = await db.vote.findMany({
      where: {
        politicianId,
        chamber: "AN",
        votingDate: { gte: since },
      },
      orderBy: [{ votingDate: "desc" }, { id: "asc" }],
      select: { id: true },
      take: 200,
    });

    expect(newFilter.map((v) => v.id)).toEqual(oldFilter.map((v) => v.id));
  });
});
