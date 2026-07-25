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
// Mocked only to prove the cron never opens a run: the service no longer imports it.
vi.mock("@/services/affairs/import-run", () => ({ withImportRun: h.withImportRun }));
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

  it("n'appelle jamais l'absorption sur une paire traversant le publié", async () => {
    // Le chemin automatique s'arrête à la frontière du publié, quelle que soit la
    // force du signal : un identifiant judiciaire commun désigne une décision
    // partagée, pas une même affaire éditoriale (#525).
    h.findPotentialDuplicates.mockResolvedValue([
      pair(
        { id: "pub", publicationStatus: "PUBLISHED" },
        { id: "draft" },
        {
          confidence: "CERTAIN",
          matchedBy: "ecli",
          score: 1,
        }
      ),
    ]);

    const stats = await reconcileAffairs({ autoMerge: true });

    expect(h.absorbDraftIntoPublished).not.toHaveBeenCalled();
    expect(h.mergeAffairs).not.toHaveBeenCalled();
    expect(stats.reviewRequired).toBe(1);
    expect(h.invalidateEntity).not.toHaveBeenCalled();
  });

  it("n'ouvre aucun run d'import quand rien n'est à absorber", async () => {
    h.findPotentialDuplicates.mockResolvedValue([
      pair(
        { id: "pub", publicationStatus: "PUBLISHED" },
        { id: "draft" },
        {
          matchedBy: "pourvoiNumber",
        }
      ),
    ]);

    await reconcileAffairs({ autoMerge: true });

    expect(h.withImportRun).not.toHaveBeenCalled();
  });

  it("ne rapporte aucune absorption : la statistique n'existe plus", async () => {
    h.findPotentialDuplicates.mockResolvedValue([
      pair({ id: "pub", publicationStatus: "PUBLISHED" }, { id: "draft" }),
    ]);

    const stats = await reconcileAffairs({ autoMerge: true });

    expect(stats).not.toHaveProperty("absorbed");
  });

  it("ne compte aucune absorption en essai à blanc", async () => {
    h.findPotentialDuplicates.mockResolvedValue([
      pair(
        { id: "pub", publicationStatus: "PUBLISHED" },
        { id: "draft" },
        {
          confidence: "CERTAIN",
          matchedBy: "ecli",
        }
      ),
      pair({ id: "d1" }, { id: "d2" }),
    ]);

    const stats = await reconcileAffairs({ autoMerge: true, dryRun: true });

    expect(stats).not.toHaveProperty("absorbed");
    // Seule la paire de brouillons est planifiée comme fusionnable.
    expect(stats.merged).toBe(1);
    expect(stats.reviewRequired).toBe(1);
    expect(h.absorbDraftIntoPublished).not.toHaveBeenCalled();
    expect(h.mergeAffairs).not.toHaveBeenCalled();
    expect(h.invalidateEntity).not.toHaveBeenCalled();
  });

  it("laisse une paire publiée + publiée en revue", async () => {
    h.findPotentialDuplicates.mockResolvedValue([
      pair(
        { id: "a", publicationStatus: "PUBLISHED" },
        { id: "b", publicationStatus: "PUBLISHED" },
        { confidence: "CERTAIN", matchedBy: "ecli" }
      ),
    ]);

    const stats = await reconcileAffairs({ autoMerge: true });

    expect(stats.reviewRequired).toBe(1);
    expect(h.mergeAffairs).not.toHaveBeenCalled();
  });

  it("ne supprime jamais automatiquement un brouillon vérifié", async () => {
    h.findPotentialDuplicates.mockResolvedValue([
      pair(
        { id: "a" },
        { id: "b", verifiedAt: new Date("2026-01-01") },
        {
          confidence: "CERTAIN",
          matchedBy: "ecli",
        }
      ),
    ]);

    const stats = await reconcileAffairs({ autoMerge: true });

    expect(stats.reviewRequired).toBe(1);
    expect(h.mergeAffairs).not.toHaveBeenCalled();
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
