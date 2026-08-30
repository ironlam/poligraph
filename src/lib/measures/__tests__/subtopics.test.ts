import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findRevision: vi.fn(),
  callMistral: vi.fn(),
  extractMistralText: vi.fn(),
  parseMistralJSON: vi.fn(),
  transaction: vi.fn(),
  upsertSubtopic: vi.fn(),
  findSubtopics: vi.fn(),
  findSubtopicInTransaction: vi.fn(),
  findAuditLogs: vi.fn(),
  findAssignment: vi.fn(),
  updateAssignments: vi.fn(),
  deleteAssignments: vi.fn(),
  createAssignments: vi.fn(),
  countAssignments: vi.fn(),
  queryRaw: vi.fn(),
  findEligibleMeasures: vi.fn(),
  createAudit: vi.fn(),
  invalidateMeasureTags: vi.fn(),
  syncSearchDocument: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    measureRevision: { findUnique: mocks.findRevision },
    measureSubtopic: {
      upsert: mocks.upsertSubtopic,
      findMany: mocks.findSubtopics,
    },
    auditLog: { findMany: mocks.findAuditLogs },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/api/mistral", () => ({
  callMistral: mocks.callMistral,
  extractMistralText: mocks.extractMistralText,
  parseMistralJSON: mocks.parseMistralJSON,
}));
vi.mock("@/lib/measures/cache", () => ({
  invalidateMeasureTags: mocks.invalidateMeasureTags,
}));
vi.mock("@/lib/measures/search-sync", () => ({
  syncSearchDocument: mocks.syncSearchDocument,
}));

const transactionClient = {
  measureSubtopic: { findUnique: mocks.findSubtopicInTransaction },
  measureRevisionSubtopic: {
    findUnique: mocks.findAssignment,
    count: mocks.countAssignments,
    updateMany: mocks.updateAssignments,
    deleteMany: mocks.deleteAssignments,
    createMany: mocks.createAssignments,
  },
  $queryRaw: mocks.queryRaw,
  measure: { findMany: mocks.findEligibleMeasures },
  auditLog: { create: mocks.createAudit },
};

describe("classification des sous-sujets de mesure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findRevision.mockResolvedValue({
      id: "revision-1",
      text: 'Encadrer les "loyers"\ndans les zones tendues.',
      measure: { theme: "LOGEMENT_URBANISME" },
      subtopics: [],
    });
    mocks.callMistral.mockResolvedValue({ model: "mistral-small-2506", choices: [] });
    mocks.extractMistralText.mockReturnValue("{}");
    mocks.parseMistralJSON.mockReturnValue({
      subtopics: [
        { slug: "loyers", confidence: 0.94 },
        { slug: "hors-taxonomie", confidence: 1 },
      ],
    });
    mocks.findAuditLogs.mockResolvedValue([]);
    mocks.transaction.mockImplementation(async (callback) => callback(transactionClient));
    mocks.findSubtopics.mockResolvedValue([]);
    mocks.findSubtopicInTransaction.mockResolvedValue({
      id: "subtopic-1",
      active: true,
      theme: "SOCIETE_DROITS_LIBERTES",
    });
    mocks.queryRaw.mockResolvedValue([
      {
        measureId: "measure-1",
        revisionId: "revision-1",
        candidacyId: "candidacy-1",
        theme: "SOCIETE_DROITS_LIBERTES",
        text: "Lutter contre le racisme.",
        details: null,
        updatedAt: new Date("2026-08-30T00:00:00.000Z"),
      },
    ]);
    mocks.findEligibleMeasures.mockResolvedValue([{ id: "measure-1" }]);
    mocks.countAssignments.mockResolvedValue(0);
    mocks.deleteAssignments.mockResolvedValue({ count: 0 });
    mocks.createAssignments.mockResolvedValue({ count: 0 });
    mocks.createAudit.mockResolvedValue({ id: "audit-1" });
  });

  it("reste dans la taxonomie fermée et ne fait aucune écriture en simulation", async () => {
    const { proposeMeasureRevisionSubtopics } = await import("../subtopics");
    const result = await proposeMeasureRevisionSubtopics("revision-1", { dryRun: true });

    expect(result.suggestions).toEqual([{ slug: "loyers", confidence: 0.94 }]);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.upsertSubtopic).not.toHaveBeenCalled();
  });

  it("nettoie le texte avant de l'insérer dans le prompt", async () => {
    const { proposeMeasureRevisionSubtopics } = await import("../subtopics");
    await proposeMeasureRevisionSubtopics("revision-1", { dryRun: true });

    const messages = mocks.callMistral.mock.calls[0]?.[0] as Array<{ content: string }>;
    expect(messages[0]?.content).toContain("Encadrer les loyers dans les zones tendues.");
    expect(messages[0]?.content).not.toContain('"loyers"');
  });

  it("préserve une validation humaine sans rappeler le modèle", async () => {
    mocks.findRevision.mockResolvedValue({
      id: "revision-1",
      text: "Encadrer les loyers.",
      measure: { theme: "LOGEMENT_URBANISME" },
      subtopics: [{ subtopic: { slug: "loyers" }, status: "APPROVED" }],
    });
    const { proposeMeasureRevisionSubtopics } = await import("../subtopics");
    const result = await proposeMeasureRevisionSubtopics("revision-1");

    expect(result.skipped).toBe(true);
    expect(mocks.callMistral).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("mémorise aussi une classification sans suggestion", async () => {
    mocks.parseMistralJSON.mockReturnValue({ subtopics: [] });
    const { proposeMeasureRevisionSubtopics } = await import("../subtopics");
    const result = await proposeMeasureRevisionSubtopics("revision-1", {
      skipTaxonomySync: true,
    });

    expect(result.suggestions).toEqual([]);
    expect(mocks.createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "PROPOSE_SUBTOPICS",
        entityId: "revision-1",
        changes: expect.objectContaining({ slugs: [] }),
      }),
    });
  });

  it("mémorise le modèle résolu renvoyé par Mistral", async () => {
    mocks.findSubtopics.mockResolvedValue([{ id: "subtopic-1", slug: "loyers" }]);
    const { proposeMeasureRevisionSubtopics } = await import("../subtopics");

    await proposeMeasureRevisionSubtopics("revision-1", { skipTaxonomySync: true });

    expect(mocks.createAssignments).toHaveBeenCalledWith({
      data: [expect.objectContaining({ classifierVersion: "mistral-small-2506:v1" })],
      skipDuplicates: true,
    });
    expect(mocks.createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changes: expect.objectContaining({ classifierVersion: "mistral-small-2506:v1" }),
      }),
    });
  });

  it("ajoute une suggestion différentielle sans toucher aux autres sous-thèmes", async () => {
    mocks.findAssignment.mockResolvedValue(null);
    mocks.createAssignments.mockResolvedValue({ count: 1 });
    const { proposeMeasureRevisionSubtopicDelta } = await import("../subtopics");

    await expect(
      proposeMeasureRevisionSubtopicDelta({
        measureId: "measure-1",
        revisionId: "revision-1",
        subtopicSlug: "racisme-antisemitisme",
        confidence: 0.97,
        classifierVersion: "mistral:subtopic-delta-v1",
        taxonomyVersion: "2026-08-30-v4",
        runId: "run-1",
        decision: "APPLIES",
        justification: "Le texte vise explicitement le racisme.",
        evidenceExcerpt: "Lutter contre le racisme",
        selectionReasons: [{ signal: "LEXICAL", values: ["racisme"] }],
        sourceFingerprint: "e63c756297de972f6128871c12d4f0b7635dd3c2661eb1785b0ce8ef95f7f618",
        proposedBy: "cli",
      })
    ).resolves.toEqual({ created: true, status: "SUGGESTED" });

    expect(mocks.deleteAssignments).not.toHaveBeenCalled();
    expect(mocks.createAssignments).toHaveBeenCalledWith({
      data: [expect.objectContaining({ status: "SUGGESTED", subtopicId: "subtopic-1" })],
      skipDuplicates: true,
    });
    expect(mocks.createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "PROPOSE_SUBTOPIC_DELTA",
        changes: expect.objectContaining({ runId: "run-1" }),
      }),
    });
  });

  it("préserve une attribution approuvée pendant une application différentielle", async () => {
    mocks.findAssignment.mockResolvedValue({ status: "APPROVED" });
    const { proposeMeasureRevisionSubtopicDelta } = await import("../subtopics");

    await expect(
      proposeMeasureRevisionSubtopicDelta({
        measureId: "measure-1",
        revisionId: "revision-1",
        subtopicSlug: "racisme-antisemitisme",
        confidence: 0.97,
        classifierVersion: "mistral:subtopic-delta-v1",
        taxonomyVersion: "2026-08-30-v4",
        runId: "run-1",
        decision: "APPLIES",
        justification: "Le texte vise explicitement le racisme.",
        evidenceExcerpt: "Lutter contre le racisme",
        selectionReasons: [{ signal: "LEXICAL", values: ["racisme"] }],
        sourceFingerprint: "e63c756297de972f6128871c12d4f0b7635dd3c2661eb1785b0ce8ef95f7f618",
      })
    ).resolves.toEqual({ created: false, status: "APPROVED" });

    expect(mocks.createAssignments).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });

  it("refuse une suggestion si la mesure publiée a changé dans la transaction", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    const { proposeMeasureRevisionSubtopicDelta } = await import("../subtopics");

    await expect(
      proposeMeasureRevisionSubtopicDelta({
        measureId: "measure-1",
        revisionId: "revision-1",
        subtopicSlug: "racisme-antisemitisme",
        confidence: 0.97,
        classifierVersion: "mistral:subtopic-delta-v1",
        taxonomyVersion: "2026-08-30-v4",
        runId: "run-1",
        decision: "APPLIES",
        justification: "Le texte vise explicitement le racisme.",
        evidenceExcerpt: "Lutter contre le racisme",
        selectionReasons: [{ signal: "LEXICAL", values: ["racisme"] }],
        sourceFingerprint: "fingerprint",
      })
    ).rejects.toThrow("a changé depuis le dry-run");
    expect(mocks.createAssignments).not.toHaveBeenCalled();
  });

  it("refuse une mesure retirée ou dépubliée après le dry-run", async () => {
    mocks.findEligibleMeasures.mockResolvedValue([]);
    const { proposeMeasureRevisionSubtopicDelta } = await import("../subtopics");

    await expect(
      proposeMeasureRevisionSubtopicDelta({
        measureId: "measure-1",
        revisionId: "revision-1",
        subtopicSlug: "racisme-antisemitisme",
        confidence: 0.97,
        classifierVersion: "mistral:subtopic-delta-v1",
        taxonomyVersion: "2026-08-30-v4",
        runId: "run-1",
        decision: "APPLIES",
        justification: "Le texte vise explicitement le racisme.",
        evidenceExcerpt: "Lutter contre le racisme",
        selectionReasons: [{ signal: "LEXICAL", values: ["racisme"] }],
        sourceFingerprint: "e63c756297de972f6128871c12d4f0b7635dd3c2661eb1785b0ce8ef95f7f618",
      })
    ).rejects.toThrow("ne fait plus partie du corpus public");
    expect(mocks.createAssignments).not.toHaveBeenCalled();
  });

  it("ne crée pas une quatrième attribution active", async () => {
    mocks.findAssignment.mockResolvedValue(null);
    mocks.countAssignments.mockResolvedValue(3);
    const { proposeMeasureRevisionSubtopicDelta } = await import("../subtopics");

    await expect(
      proposeMeasureRevisionSubtopicDelta({
        measureId: "measure-1",
        revisionId: "revision-1",
        subtopicSlug: "racisme-antisemitisme",
        confidence: 0.97,
        classifierVersion: "mistral:subtopic-delta-v1",
        taxonomyVersion: "2026-08-30-v4",
        runId: "run-1",
        decision: "APPLIES",
        justification: "Le texte vise explicitement le racisme.",
        evidenceExcerpt: "Lutter contre le racisme",
        selectionReasons: [{ signal: "LEXICAL", values: ["racisme"] }],
        sourceFingerprint: "e63c756297de972f6128871c12d4f0b7635dd3c2661eb1785b0ce8ef95f7f618",
      })
    ).resolves.toEqual({ created: false, status: "SUBTOPIC_LIMIT_REACHED" });
    expect(mocks.createAssignments).not.toHaveBeenCalled();
  });

  it("refuse une suggestion après un changement concurrent de thème", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        measureId: "measure-1",
        revisionId: "revision-1",
        candidacyId: "candidacy-1",
        theme: "ECONOMIE_BUDGET",
        text: "Lutter contre le racisme.",
        details: null,
        updatedAt: new Date("2026-08-30T00:00:00.000Z"),
      },
    ]);
    const { proposeMeasureRevisionSubtopicDelta } = await import("../subtopics");

    await expect(
      proposeMeasureRevisionSubtopicDelta({
        measureId: "measure-1",
        revisionId: "revision-1",
        subtopicSlug: "racisme-antisemitisme",
        confidence: 0.97,
        classifierVersion: "mistral:subtopic-delta-v1",
        taxonomyVersion: "2026-08-30-v4",
        runId: "run-1",
        decision: "APPLIES",
        justification: "Le texte vise explicitement le racisme.",
        evidenceExcerpt: "Lutter contre le racisme",
        selectionReasons: [{ signal: "LEXICAL", values: ["racisme"] }],
        sourceFingerprint: "e63c756297de972f6128871c12d4f0b7635dd3c2661eb1785b0ce8ef95f7f618",
      })
    ).rejects.toThrow("ne correspond plus au sous-thème");
    expect(mocks.createAssignments).not.toHaveBeenCalled();
  });

  it("valide tout le lot avant de créer la première suggestion", async () => {
    mocks.findEligibleMeasures.mockResolvedValue([{ id: "measure-1" }, { id: "measure-2" }]);
    const { proposeMeasureRevisionSubtopicDeltaBatch } = await import("../subtopics");
    const common = {
      subtopicSlug: "racisme-antisemitisme",
      confidence: 0.97,
      classifierVersion: "mistral:subtopic-delta-v1",
      taxonomyVersion: "2026-08-30-v4",
      runId: "run-1",
      decision: "APPLIES" as const,
      justification: "Le texte vise explicitement le racisme.",
      evidenceExcerpt: "Lutter contre le racisme",
      selectionReasons: [{ signal: "LEXICAL", values: ["racisme"] }],
    };

    await expect(
      proposeMeasureRevisionSubtopicDeltaBatch([
        {
          ...common,
          measureId: "measure-1",
          revisionId: "revision-1",
          sourceFingerprint: "e63c756297de972f6128871c12d4f0b7635dd3c2661eb1785b0ce8ef95f7f618",
        },
        {
          ...common,
          measureId: "measure-2",
          revisionId: "revision-2",
          sourceFingerprint: "fingerprint-2",
        },
      ])
    ).rejects.toThrow("measure-2 a changé depuis le dry-run");
    expect(mocks.findAssignment).not.toHaveBeenCalled();
    expect(mocks.createAssignments).not.toHaveBeenCalled();
  });

  it("retrouve les révisions déjà classées à partir du journal d'audit", async () => {
    mocks.findAuditLogs.mockResolvedValue([{ entityId: "revision-1" }, { entityId: "revision-2" }]);
    const { getPreviouslyClassifiedMeasureRevisionIds } = await import("../subtopics");

    await expect(getPreviouslyClassifiedMeasureRevisionIds()).resolves.toEqual([
      "revision-1",
      "revision-2",
    ]);
    expect(mocks.findAuditLogs).toHaveBeenCalledWith({
      where: { action: "PROPOSE_SUBTOPICS", entityType: "MeasureRevision" },
      select: { entityId: true },
      distinct: ["entityId"],
    });
  });

  it("refuse qu'une décision concurrente écrase la première", async () => {
    mocks.findAssignment.mockResolvedValue({
      status: "SUGGESTED",
      revision: { measure: { id: "measure-1", electionId: "election-1" } },
    });
    mocks.updateAssignments.mockResolvedValue({ count: 0 });
    const { reviewMeasureRevisionSubtopic } = await import("../subtopics");

    await expect(
      reviewMeasureRevisionSubtopic({
        revisionId: "revision-1",
        subtopicId: "subtopic-1",
        status: "APPROVED",
        reviewedBy: "admin",
      })
    ).rejects.toThrow("déjà été traitée");
    expect(mocks.createAudit).not.toHaveBeenCalled();
    expect(mocks.invalidateMeasureTags).not.toHaveBeenCalled();
  });

  it("refuse d’approuver un quatrième sous-thème", async () => {
    mocks.findAssignment.mockResolvedValue({
      status: "SUGGESTED",
      revision: { measure: { id: "measure-1", electionId: "election-1" } },
    });
    mocks.countAssignments.mockResolvedValue(3);
    const { reviewMeasureRevisionSubtopic } = await import("../subtopics");

    await expect(
      reviewMeasureRevisionSubtopic({
        revisionId: "revision-1",
        subtopicId: "subtopic-1",
        status: "APPROVED",
        reviewedBy: "admin",
      })
    ).rejects.toThrow("déjà trois sous-thèmes approuvés");
    expect(mocks.updateAssignments).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });

  it("invalide les caches publics après une décision humaine", async () => {
    mocks.findAssignment.mockResolvedValue({
      status: "SUGGESTED",
      revision: { measure: { id: "measure-1", electionId: "election-1" } },
    });
    mocks.updateAssignments.mockResolvedValue({ count: 1 });
    const { reviewMeasureRevisionSubtopic } = await import("../subtopics");

    await reviewMeasureRevisionSubtopic({
      revisionId: "revision-1",
      subtopicId: "subtopic-1",
      status: "APPROVED",
      reviewedBy: "admin",
    });

    expect(mocks.invalidateMeasureTags).toHaveBeenCalledWith("measure-1", "election-1");
    expect(mocks.syncSearchDocument).toHaveBeenCalledWith(transactionClient, "measure-1");
  });

  it("ne réindexe pas une proposition refusée qui n’était pas publique", async () => {
    mocks.findAssignment.mockResolvedValue({
      status: "SUGGESTED",
      revision: { measure: { id: "measure-1", electionId: "election-1" } },
    });
    mocks.updateAssignments.mockResolvedValue({ count: 1 });
    const { reviewMeasureRevisionSubtopic } = await import("../subtopics");

    await reviewMeasureRevisionSubtopic({
      revisionId: "revision-1",
      subtopicId: "subtopic-1",
      status: "REJECTED",
      reviewedBy: "admin",
    });

    expect(mocks.syncSearchDocument).not.toHaveBeenCalled();
  });
});
