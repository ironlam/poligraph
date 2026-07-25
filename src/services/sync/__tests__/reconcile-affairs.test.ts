import { describe, it, expect, vi, beforeEach } from "vitest";

// Review of #526 — the admin routes invalidated caches after a merge, the cron
// path did not, so an automatic merge left the deleted affair's page and the
// person's profile served from cache.

const order: string[] = [];

const h = vi.hoisted(() => ({
  findPotentialDuplicates: vi.fn(),
  mergeAffairs: vi.fn(),
  absorbDraftIntoPublished: vi.fn(),
  withImportRun: vi.fn(),
  affairFindMany: vi.fn(),
  invalidateEntity: vi.fn(),
  invalidateAffectedPoliticians: vi.fn(),
}));

vi.mock("@/services/affairs/reconciliation", () => ({
  findPotentialDuplicates: h.findPotentialDuplicates,
  mergeAffairs: h.mergeAffairs,
  ABSORPTION_ADDITIVE_FIELDS: ["ecli", "pourvoiNumber", "caseNumber"],
}));
vi.mock("@/services/affairs/absorb-draft", () => ({
  absorbDraftIntoPublished: h.absorbDraftIntoPublished,
}));
vi.mock("@/services/affairs/import-run", () => ({
  withImportRun: h.withImportRun,
  IMPORTER_RECONCILE: "reconcile-affairs",
}));
vi.mock("@/lib/db", () => ({ db: { affair: { findMany: h.affairFindMany } } }));
vi.mock("@/lib/cache", () => ({
  invalidateEntity: h.invalidateEntity,
  invalidateAffectedPoliticians: h.invalidateAffectedPoliticians,
}));

import { reconcileAffairs } from "../reconcile-affairs";

function pair(
  a: Partial<{ id: string; publicationStatus: string; verifiedAt: Date | null }>,
  b: Partial<{ id: string; publicationStatus: string; verifiedAt: Date | null }>,
  overrides: Partial<{ confidence: string; matchedBy: string; score: number }> = {}
) {
  const side = (s: typeof a, fallbackId: string) => ({
    id: s.id ?? fallbackId,
    title: `Affaire ${s.id ?? fallbackId}`,
    politicianId: "p1",
    sources: [],
    updatedAt: new Date("2026-07-01"),
    publicationStatus: s.publicationStatus ?? "DRAFT",
    verifiedAt: s.verifiedAt ?? null,
  });
  return {
    affairA: side(a, "a"),
    affairB: side(b, "b"),
    confidence: overrides.confidence ?? "HIGH",
    matchedBy: overrides.matchedBy ?? "pourvoiNumber",
    score: overrides.score ?? 0.95,
    contradictions: [],
    unpropagatableDifferences: [],
    previousClassification: null,
    rulingStale: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  h.mergeAffairs.mockImplementation(async () => {
    order.push("merge");
    return {
      sourcesMoved: 0,
      sourcesEnriched: 0,
      eventsMoved: 0,
      articlesMoved: 0,
      identifiersMerged: [],
      slugsPreserved: [],
    };
  });
  h.affairFindMany.mockResolvedValue([{ politician: { slug: "jean-dupont" } }]);
  h.invalidateEntity.mockImplementation(() => {
    order.push("invalidate");
  });
  h.invalidateAffectedPoliticians.mockImplementation(() => {
    order.push("invalidate-politicians");
  });
  h.withImportRun.mockImplementation(
    async (
      _importer: string,
      fn: (ctx: { importRunId: string; setStats: () => void }) => unknown
    ) => fn({ importRunId: "run_1", setStats: () => {} })
  );
});

describe("reconcileAffairs — invalidation du chemin cron (#525)", () => {
  it("invalide les caches après une auto-fusion de brouillons", async () => {
    h.findPotentialDuplicates.mockResolvedValue([pair({ id: "a" }, { id: "b" })]);

    const stats = await reconcileAffairs({ autoMerge: true });

    expect(stats.merged).toBe(1);
    expect(order).toEqual(["merge", "invalidate", "invalidate-politicians"]);
    expect(h.invalidateEntity).toHaveBeenCalledWith("affair");
    expect(h.invalidateAffectedPoliticians).toHaveBeenCalledWith(["jean-dupont"]);
  });

  it("invalide aussi après une absorption dans une affaire publiée", async () => {
    h.findPotentialDuplicates.mockResolvedValue([
      pair({ id: "pub", publicationStatus: "PUBLISHED" }, { id: "draft" }),
    ]);
    h.absorbDraftIntoPublished.mockImplementation(async () => {
      order.push("absorb");
      return { proposalsCreated: 1, proposedFields: ["court"], recordedDifferences: [] };
    });

    const stats = await reconcileAffairs({ autoMerge: true });

    expect(stats.absorbed).toBe(1);
    expect(order).toEqual(["absorb", "invalidate", "invalidate-politicians"]);
  });

  it("n'invalide rien quand aucune fusion n'a eu lieu", async () => {
    // Deux affaires publiées : revue obligatoire, donc aucune écriture.
    h.findPotentialDuplicates.mockResolvedValue([
      pair(
        { id: "a", publicationStatus: "PUBLISHED" },
        { id: "b", publicationStatus: "PUBLISHED" }
      ),
    ]);

    const stats = await reconcileAffairs({ autoMerge: true });

    expect(stats.merged).toBe(0);
    expect(stats.reviewRequired).toBe(1);
    expect(h.invalidateEntity).not.toHaveBeenCalled();
  });

  it("n'invalide rien en essai à blanc", async () => {
    h.findPotentialDuplicates.mockResolvedValue([pair({ id: "a" }, { id: "b" })]);

    await reconcileAffairs({ autoMerge: true, dryRun: true });

    expect(h.mergeAffairs).not.toHaveBeenCalled();
    expect(h.invalidateEntity).not.toHaveBeenCalled();
  });

  it("n'invalide pas quand la fusion a échoué", async () => {
    h.findPotentialDuplicates.mockResolvedValue([pair({ id: "a" }, { id: "b" })]);
    h.mergeAffairs.mockRejectedValue(new Error("rollback"));

    const stats = await reconcileAffairs({ autoMerge: true });

    expect(stats.errors).toBe(1);
    expect(h.invalidateEntity).not.toHaveBeenCalled();
  });

  it("ne touche à rien sans autoMerge", async () => {
    h.findPotentialDuplicates.mockResolvedValue([pair({ id: "a" }, { id: "b" })]);

    const stats = await reconcileAffairs({});

    expect(stats.duplicatesFound).toBe(1);
    expect(h.mergeAffairs).not.toHaveBeenCalled();
    expect(h.invalidateEntity).not.toHaveBeenCalled();
  });
});
