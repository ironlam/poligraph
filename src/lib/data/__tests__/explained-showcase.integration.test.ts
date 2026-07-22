import { vi } from "vitest";

// getExplainedShowcase is a "use cache" function: cacheTag()/cacheLife() throw
// outside a real Next.js cache-components runtime, so mock them here as the
// other data-function tests in this directory do (e.g. condamnations.test.ts).
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));

import { describe, it, expect, beforeAll } from "vitest";

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

// Dynamic imports (deferred to beforeAll, inside describeIfDb): both @/lib/db
// and @/lib/data/scrutins transitively construct the Prisma client at import
// time, which throws when DATABASE_URL is unset. Static imports would make
// this suite fail instead of skip when run without a database.
let db: typeof import("@/lib/db").db;
let getExplainedShowcase: typeof import("@/lib/data/scrutins").getExplainedShowcase;
let seedExplainedFixtures: typeof import("./_seed-explained").seedExplainedFixtures;

describeIfDb("getExplainedShowcase", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ getExplainedShowcase } = await import("@/lib/data/scrutins"));
    ({ seedExplainedFixtures } = await import("./_seed-explained"));
    await seedExplainedFixtures(db);
  });

  it("excludes LOW, caps per dossier, honors count", async () => {
    const out = await getExplainedShowcase({ count: 8, maxPerDossier: 2 });
    const ids = out.map((s) => s.id);
    expect(ids).not.toContain("low1"); // LOW excluded from showcase
    expect(out.length).toBeLessThanOrEqual(8);
    const fromA = out.filter((s) => s.dossierLegislatifId === "A").length;
    expect(fromA).toBeLessThanOrEqual(2); // per-dossier cap
  });

  it("respects maxPerDossier: 1", async () => {
    const out = await getExplainedShowcase({ count: 8, maxPerDossier: 1 });
    expect(out.filter((s) => s.dossierLegislatifId === "A").length).toBe(1);
  });
});
