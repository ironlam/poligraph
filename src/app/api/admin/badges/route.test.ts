import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  db: {
    affair: { count: vi.fn() },
    politician: { count: vi.fn() },
    affairUpdateProposal: { count: vi.fn() },
    moderationReview: { count: vi.fn() },
    affairPoliticianDecision: { count: vi.fn() },
    pressArticle: { count: vi.fn() },
    pressAnalysisRejection: { count: vi.fn() },
    syncJob: { count: vi.fn() },
  },
  duplicates: vi.fn(),
  pipelines: vi.fn(),
  candidaciesHoldingBack: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/services/affairs/reconciliation", () => ({ findPotentialDuplicates: h.duplicates }));
vi.mock("@/lib/data/pipelines", () => ({ getPipelineHealthAll: h.pipelines }));
// Le compteur des candidatures vit dans la couche mesures : c'est elle qui porte le prédicat de
// visibilité publique, la route ne fait que l'appeler.
vi.mock("@/lib/data/measures", () => ({
  countCandidaciesHoldingBackMeasures: h.candidaciesHoldingBack,
}));
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (handler: () => Promise<Response>) => handler,
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  h.db.affair.count.mockResolvedValue(3);
  h.db.politician.count.mockResolvedValue(4);
  h.db.affairUpdateProposal.count.mockImplementation(
    async ({ where }: { where: { status: string } }) => (where.status === "PENDING" ? 5 : 2)
  );
  h.db.moderationReview.count.mockResolvedValue(7);
  h.db.affairPoliticianDecision.count.mockResolvedValue(8);
  h.db.pressArticle.count.mockResolvedValue(11);
  h.db.pressAnalysisRejection.count.mockResolvedValue(9);
  h.db.syncJob.count.mockResolvedValue(10);
  h.duplicates.mockResolvedValue([{ id: "duplicate-1" }, { id: "duplicate-2" }]);
  h.candidaciesHoldingBack.mockResolvedValue(6);
  h.pipelines.mockResolvedValue([
    { status: "critical" },
    { status: "healthy" },
    { status: "critical" },
  ]);
});

describe("GET /api/admin/badges", () => {
  it("returns distinct counts for each actionable queue", async () => {
    const response = await GET(new NextRequest("https://poligraph.fr/api/admin/badges"), {
      params: Promise.resolve({}),
    });
    expect(await response.json()).toEqual({
      drafts: { affairs: 3, politicians: 4 },
      moderation: { proposalsPending: 5, proposalsConflict: 2, reviewsPending: 7 },
      matching: { decisionsPending: 8, articlesPending: 11, duplicatesPending: 2 },
      candidacies: { publicationPending: 6 },
      press: { rejectionsPending: 9 },
      operations: { failedPipelines: 2, failedSyncs: 10 },
    });
    expect(h.db.pressArticle.count).toHaveBeenCalledWith({
      where: { aiAnalyzedAt: { not: null }, isAffairRelated: true, affairLinks: { none: {} } },
    });
  });
});
