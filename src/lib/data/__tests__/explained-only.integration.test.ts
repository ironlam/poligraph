import { vi } from "vitest";

// getScrutins routes through the "use cache" getScrutinsFiltered path when
// there is no search term: cacheTag()/cacheLife() throw outside a real
// Next.js cache-components runtime, so mock them here as the other
// data-function tests in this directory do (e.g. explained-showcase).
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

// Dynamic imports (deferred to beforeAll, inside describeIfDb): both @/lib/db
// and @/lib/data/scrutins transitively construct the Prisma client at import
// time, which throws when DATABASE_URL is unset. Static imports would make
// this suite fail instead of skip when run without a database.
let db: typeof import("@/lib/db").db;
let getScrutins: typeof import("@/lib/data/scrutins").getScrutins;
let seedExplainedFixtures: typeof import("./_seed-explained").seedExplainedFixtures;
let cleanupExplainedFixtures: typeof import("./_seed-explained").cleanupExplainedFixtures;

describeIfDb("getScrutins explainedOnly", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ getScrutins } = await import("@/lib/data/scrutins"));
    ({ seedExplainedFixtures, cleanupExplainedFixtures } = await import("./_seed-explained"));
    await seedExplainedFixtures(db);
  });

  afterAll(async () => {
    await cleanupExplainedFixtures(db);
  });

  it("returns only APPROVED titles, overrides excludeType for amendments, includes LOW", async () => {
    // excludeType: "AMENDEMENT" is passed on purpose: if explainedOnly
    // amendments still come back, that proves explainedOnly overrode the
    // exclusion rather than the test merely never exercising it.
    const { scrutins } = await getScrutins({
      page: 1,
      limit: 50,
      explainedOnly: true,
      excludeType: "AMENDEMENT",
    });
    expect(scrutins.every((s) => s.policyTitle?.status === "APPROVED")).toBe(true);
    expect(scrutins.some((s) => s.type === "AMENDEMENT")).toBe(true); // override proven
    expect(scrutins.map((s) => s.id)).toContain("low1"); // LOW present in full corpus
  });
});
