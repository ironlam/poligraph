import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  db: {
    affair: { findUnique: vi.fn() },
    politician: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  invalidateEntity: vi.fn(),
  invalidateAffectedPoliticians: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/cache", () => ({
  invalidateEntity: h.invalidateEntity,
  invalidateAffectedPoliticians: h.invalidateAffectedPoliticians,
}));

import {
  getAffairReassignmentContext,
  previewAffairPoliticianReassignment,
  reassignAffairPolitician,
} from "@/services/admin/affair-politician-workbench";

const current = {
  id: "aff-1",
  title: "Affaire de test",
  slug: "ancienne-personnalite-affaire-de-test",
  oldSlugs: [],
  publicationStatus: "PUBLISHED",
  status: "CONDAMNATION_DEFINITIVE",
  involvement: "DIRECT",
  involvementNote: null,
  subjectLabel: null,
  subjectKind: null,
  partyAtTimeId: null,
  partyAtTime: null,
  politicianId: "pol-old",
  updatedAt: new Date("2026-01-01"),
  sources: [{ id: "source-1", url: "https://x", title: "Source", publisher: "AFP" }],
  pressArticles: [{ id: "rel-1", articleId: "article-1", role: "MENTION" }],
  courtDecisions: [{ courtDecisionId: "decision-1" }],
  affairPoliticianDecisions: [
    {
      id: "decision-match-1",
      chosenPoliticianId: "pol-old",
      judgment: "SAME",
      reviewedAt: new Date("2026-01-01"),
    },
  ],
  politician: {
    id: "pol-old",
    fullName: "Ancienne Personnalité",
    slug: "ancienne-personnalite",
    currentParty: null,
  },
};

beforeEach(() => vi.clearAllMocks());

describe("affair-politician workbench", () => {
  it("builds a read-only preview without opening a transaction", async () => {
    h.db.affair.findUnique.mockResolvedValue(current);
    h.db.politician.findUnique.mockResolvedValue({
      id: "pol-new",
      fullName: "Nouvelle Personnalité",
      slug: "nouvelle-personnalite",
      publicationStatus: "PUBLISHED",
      currentParty: null,
    });
    h.db.affair.findUnique.mockResolvedValueOnce(current).mockResolvedValueOnce(null);
    const preview = await previewAffairPoliticianReassignment("aff-1", "pol-new");
    expect(preview.impact.publicationStatus).toBe("DRAFT");
    expect(preview.impact.oldSlugs).toContain(current.slug);
    expect(h.db.$transaction).not.toHaveBeenCalled();
  });

  it("passes the published fail-closed update and audit through one transaction", async () => {
    const updated = {
      slug: "nouvelle-personnalite-affaire-de-test",
      publicationStatus: "DRAFT",
      updatedAt: new Date("2026-01-02"),
    };
    h.db.affair.findUnique.mockResolvedValue(current);
    const context = await getAffairReassignmentContext("aff-1");
    const tx = {
      affair: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: "aff-1", ...updated }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      politician: {
        findUnique: vi.fn().mockResolvedValue({
          id: "pol-new",
          fullName: "Nouvelle Personnalité",
          slug: "nouvelle-personnalite",
        }),
      },
      auditLog: { create: vi.fn() },
    };
    h.db.$transaction.mockImplementation(async (callback: (value: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );
    const result = await reassignAffairPolitician({
      affairId: "aff-1",
      politicianId: "pol-new",
      justification:
        "La source vérifiée établit que cette affaire concerne la nouvelle personnalité.",
      confirmation: current.title,
      expected: context!.snapshot,
    });
    expect(tx.affair.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: current.id, updatedAt: current.updatedAt },
        data: expect.objectContaining({
          politicianId: "pol-new",
          publicationStatus: "DRAFT",
          verifiedAt: null,
          verifiedBy: null,
        }),
      })
    );
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
    expect(h.invalidateAffectedPoliticians).toHaveBeenCalledWith([
      "ancienne-personnalite",
      "nouvelle-personnalite",
    ]);
    expect(result.affair).toEqual({ id: "aff-1", ...updated });
  });
});
