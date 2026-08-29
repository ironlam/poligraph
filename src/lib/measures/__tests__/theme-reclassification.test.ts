import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  lockMeasure: vi.fn(),
  findMeasure: vi.fn(),
  deleteAssignments: vi.fn(),
  updateMeasure: vi.fn(),
  createAudit: vi.fn(),
  syncSearchDocument: vi.fn(),
  invalidateMeasureTags: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { $transaction: mocks.transaction },
}));
vi.mock("@/lib/measures/lock", () => ({ lockMeasure: mocks.lockMeasure }));
vi.mock("@/lib/measures/search-sync", () => ({
  syncSearchDocument: mocks.syncSearchDocument,
}));
vi.mock("@/lib/measures/cache", () => ({
  invalidateMeasureTags: mocks.invalidateMeasureTags,
}));

const tx = {
  measure: { findUnique: mocks.findMeasure, update: mocks.updateMeasure },
  measureRevisionSubtopic: { deleteMany: mocks.deleteAssignments },
  auditLog: { create: mocks.createAudit },
};

const evidence = {
  classifierVersion: "theme-classifier:v1",
  taxonomyVersion: "2026-08-28-v2",
  reportHash: "a".repeat(64),
  confidence: 0.97,
  rationale: "L'instrument principal porte sur le contrat de travail.",
};

function measure(overrides: Record<string, unknown> = {}) {
  return {
    id: "measure-1",
    theme: "SOCIAL_TRAVAIL",
    publicationStatus: "PUBLISHED",
    electionId: "election-1",
    updatedAt: new Date("2026-08-28T12:00:00.000Z"),
    election: { slug: "presidentielle-2027" },
    revisions: [],
    ...overrides,
  };
}

describe("requalification thématique d'une mesure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.findMeasure.mockResolvedValue(measure());
    mocks.deleteAssignments.mockResolvedValue({ count: 0 });
    mocks.updateMeasure.mockResolvedValue({ id: "measure-1" });
    mocks.createAudit.mockResolvedValue({ id: "audit-1" });
  });

  it("change uniquement le thème, journalise la preuve et reconstruit la recherche", async () => {
    const { reclassifyMeasureTheme } = await import("../theme-reclassification");
    const result = await reclassifyMeasureTheme({
      measureId: "measure-1",
      targetTheme: "EMPLOI_TRAVAIL",
      expectedUpdatedAt: new Date("2026-08-28T12:00:00.000Z"),
      reclassifiedBy: "admin",
      evidence,
    });

    expect(result).toEqual({
      measureId: "measure-1",
      previousTheme: "SOCIAL_TRAVAIL",
      targetTheme: "EMPLOI_TRAVAIL",
      publicationStatus: "PUBLISHED",
      changed: true,
      removedSubtopicAssignments: 0,
    });
    expect(mocks.updateMeasure).toHaveBeenCalledWith({
      where: { id: "measure-1" },
      data: { theme: "EMPLOI_TRAVAIL" },
    });
    expect(mocks.createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "RECLASSIFY_MEASURE_THEME",
        entityId: "measure-1",
        changes: expect.objectContaining({
          previousTheme: "SOCIAL_TRAVAIL",
          targetTheme: "EMPLOI_TRAVAIL",
          reportHash: "a".repeat(64),
        }),
      }),
    });
    expect(mocks.syncSearchDocument).toHaveBeenCalledWith(tx, "measure-1");
    expect(mocks.invalidateMeasureTags).toHaveBeenCalledWith("measure-1", "election-1");
  });

  it("préserve les pointeurs, révisions, sources et statut de publication", async () => {
    const { reclassifyMeasureTheme } = await import("../theme-reclassification");
    await reclassifyMeasureTheme({
      measureId: "measure-1",
      targetTheme: "RETRAITES",
      reclassifiedBy: "admin",
      evidence,
    });

    const data = mocks.updateMeasure.mock.calls[0]?.[0].data;
    expect(data).toEqual({ theme: "RETRAITES" });
    expect(data).not.toHaveProperty("publicationStatus");
    expect(data).not.toHaveProperty("publishedRevisionId");
    expect(data).not.toHaveProperty("latestRevisionId");
    expect(tx).not.toHaveProperty("measureRevision.update");
    expect(tx).not.toHaveProperty("measureSource.update");
  });

  it("supprime les sous-thèmes devenus incompatibles en conservant leur état dans l'audit", async () => {
    mocks.findMeasure.mockResolvedValue(
      measure({
        revisions: [
          {
            id: "revision-1",
            subtopics: [
              {
                status: "APPROVED",
                subtopicId: "subtopic-old",
                subtopic: { slug: "retraites", theme: "RETRAITES" },
              },
            ],
          },
        ],
      })
    );
    const { reclassifyMeasureTheme } = await import("../theme-reclassification");
    const result = await reclassifyMeasureTheme({
      measureId: "measure-1",
      targetTheme: "EMPLOI_TRAVAIL",
      reclassifiedBy: "admin",
      evidence,
    });

    expect(result.removedSubtopicAssignments).toBe(1);
    expect(mocks.deleteAssignments).toHaveBeenCalledWith({
      where: { OR: [{ revisionId: "revision-1", subtopicId: "subtopic-old" }] },
    });
    expect(mocks.createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changes: expect.objectContaining({
          removedSubtopicAssignments: [
            expect.objectContaining({ slug: "retraites", status: "APPROVED" }),
          ],
        }),
      }),
    });
  });

  it("refuse le thème historique pour une mesure présidentielle", async () => {
    mocks.findMeasure.mockResolvedValue(measure({ theme: "EMPLOI_TRAVAIL" }));
    const { reclassifyMeasureTheme } = await import("../theme-reclassification");

    await expect(
      reclassifyMeasureTheme({
        measureId: "measure-1",
        targetTheme: "SOCIAL_TRAVAIL",
        reclassifiedBy: "admin",
        evidence,
      })
    ).rejects.toThrow("n'est pas autorisé");
    expect(mocks.updateMeasure).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });

  it("refuse une version périmée avant toute écriture", async () => {
    const { reclassifyMeasureTheme } = await import("../theme-reclassification");

    await expect(
      reclassifyMeasureTheme({
        measureId: "measure-1",
        targetTheme: "EMPLOI_TRAVAIL",
        expectedUpdatedAt: new Date("2026-08-27T12:00:00.000Z"),
        reclassifiedBy: "admin",
        evidence,
      })
    ).rejects.toThrow("a changé");
    expect(mocks.updateMeasure).not.toHaveBeenCalled();
  });

  it("rend un lot idempotent et refuse les doublons d'identifiant", async () => {
    mocks.findMeasure.mockResolvedValue(measure({ theme: "EMPLOI_TRAVAIL" }));
    const { reclassifyMeasureThemeBatch } = await import("../theme-reclassification");
    const item = {
      measureId: "measure-1",
      targetTheme: "EMPLOI_TRAVAIL" as const,
      reclassifiedBy: "admin",
      evidence,
    };

    await expect(reclassifyMeasureThemeBatch([item, item])).rejects.toThrow("plusieurs décisions");
    await expect(reclassifyMeasureThemeBatch([item])).resolves.toEqual({
      changedCount: 0,
      unchangedCount: 1,
      failures: [],
    });
    expect(mocks.updateMeasure).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });
});
