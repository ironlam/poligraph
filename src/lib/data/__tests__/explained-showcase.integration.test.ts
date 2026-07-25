import { vi } from "vitest";

// getExplainedShowcase is a "use cache" function: cacheTag()/cacheLife() throw
// outside a real Next.js cache-components runtime, so mock them here as the
// other data-function tests in this directory do (e.g. condamnations.test.ts).
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));

import { it, expect, beforeAll, afterAll } from "vitest";

import { assertLocalTestDb, describeIfLocalDb } from "@/test/db-guard";

// Dynamic imports (deferred to beforeAll, inside describeIfLocalDb): both @/lib/db
// and @/lib/data/scrutins transitively construct the Prisma client at import
// time, which throws when DATABASE_URL is unset. Static imports would make
// this suite fail instead of skip when run without a database.
let db: typeof import("@/lib/db").db;
let getExplainedShowcase: typeof import("@/lib/data/scrutins").getExplainedShowcase;
let seedExplainedFixtures: typeof import("./_seed-explained").seedExplainedFixtures;
let cleanupExplainedFixtures: typeof import("./_seed-explained").cleanupExplainedFixtures;

describeIfLocalDb("getExplainedShowcase", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ getExplainedShowcase } = await import("@/lib/data/scrutins"));
    ({ seedExplainedFixtures, cleanupExplainedFixtures } = await import("./_seed-explained"));
    await seedExplainedFixtures(db);
  });

  // This block seeds the shared fixtures, so this block removes them. They used to
  // be cleaned up by the *next* block's afterAll, which coupled two independent
  // fixture sets: anything that stopped that hook early left this set behind.
  afterAll(async () => {
    await cleanupExplainedFixtures(db);
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

// Own fixtures (FB_* ids/dossiers, isolated via excludeScrutinIds) proving the
// all-time fallback fires when the widest (365-day) window's DIVERSIFIED
// output is short of `count` — even though the raw fetched row count is not.
describeIfLocalDb("getExplainedShowcase — all-time fallback", () => {
  const FB_DOSSIER_IDS = ["FB_X", "FB_Y", "FB_Z"] as const;
  const FB_SCRUTIN_IDS = ["FB_x1", "FB_x2", "FB_x3", "FB_y1", "FB_z1"];

  beforeAll(async () => {
    // These fixtures are written inline rather than through seedExplainedFixtures(),
    // so they need the guard the shared helper applies for its own callers.
    assertLocalTestDb();

    ({ db } = await import("@/lib/db"));
    ({ getExplainedShowcase } = await import("@/lib/data/scrutins"));

    // Idempotent: delete-first by these explicit ids, children before parents.
    await db.scrutinImportance.deleteMany({ where: { scrutinId: { in: FB_SCRUTIN_IDS } } });
    await db.scrutinPolicyTitle.deleteMany({ where: { scrutinId: { in: FB_SCRUTIN_IDS } } });
    await db.scrutin.deleteMany({ where: { id: { in: FB_SCRUTIN_IDS } } });
    await db.legislativeDossier.deleteMany({ where: { id: { in: [...FB_DOSSIER_IDS] } } });

    await db.legislativeDossier.createMany({
      data: FB_DOSSIER_IDS.map((id) => ({
        id,
        externalId: `TEST_EXPL_DLR_${id}`,
        title: `Dossier test ${id}`,
        status: "EN_COURS",
      })),
    });

    const today = new Date();
    const old = new Date();
    old.setDate(old.getDate() - 400);

    const fixtures: Array<{
      id: string;
      dossierId: (typeof FB_DOSSIER_IDS)[number];
      votingDate: Date;
    }> = [
      { id: "FB_x1", dossierId: "FB_X", votingDate: today },
      { id: "FB_x2", dossierId: "FB_X", votingDate: today },
      { id: "FB_x3", dossierId: "FB_X", votingDate: today },
      { id: "FB_y1", dossierId: "FB_Y", votingDate: old },
      { id: "FB_z1", dossierId: "FB_Z", votingDate: old },
    ];

    for (const f of fixtures) {
      await db.scrutin.create({
        data: {
          id: f.id,
          externalId: `TEST_EXPL_${f.id}`,
          title: `Scrutin test ${f.id}`,
          votingDate: f.votingDate,
          legislature: 17,
          chamber: "AN",
          votesFor: 100,
          votesAgainst: 50,
          votesAbstain: 5,
          result: "ADOPTED",
          dossierLegislatifId: f.dossierId,
          policyTitle: {
            create: {
              officialTitleSnapshot: `Snapshot ${f.id}`,
              inputHash: "0".repeat(64),
              policyTitle: `Titre politique ${f.id}`,
              proceduralLabel: "Scrutin solennel",
              confidence: "HIGH",
              qualitySignals: {},
              generationSource: "LLM",
              status: "APPROVED",
            },
          },
          importance: {
            create: {
              score: 10,
              isKeyVote: false,
              signals: {},
            },
          },
        },
      });
    }
  });

  afterAll(async () => {
    await db.scrutinImportance.deleteMany({ where: { scrutinId: { in: FB_SCRUTIN_IDS } } });
    await db.scrutinPolicyTitle.deleteMany({ where: { scrutinId: { in: FB_SCRUTIN_IDS } } });
    await db.scrutin.deleteMany({ where: { id: { in: FB_SCRUTIN_IDS } } });
    await db.legislativeDossier.deleteMany({ where: { id: { in: [...FB_DOSSIER_IDS] } } });
  });

  it("widens to all-time when the 365-day window's diversified output is short", async () => {
    // Only 3 FB_X rows fall inside the 365-day window; maxPerDossier:1
    // diversifies them down to 1 — short of count:3. FB_Y/FB_Z sit ~400 days
    // back, outside every adaptive window, so they can only appear via the
    // bounded all-time fallback. Exclude the shared standard fixtures so only
    // FB_* rows compete.
    const out = await getExplainedShowcase({
      count: 3,
      maxPerDossier: 1,
      excludeScrutinIds: ["dA1", "dA2", "dB1", "low1"],
    });
    expect(out.length).toBe(3);
    const ids = out.map((s) => s.id);
    expect(ids.some((id) => id === "FB_y1" || id === "FB_z1")).toBe(true);
  });
});
