import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    measureRevisionReaderGuide: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    measureReaderGuide: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    measure: { findFirst: vi.fn() },
    measureReaderGuideDetectionRun: { upsert: vi.fn() },
    measureSource: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    tx,
    measureRevision: { findUnique: vi.fn() },
    measureReaderGuide: { findMany: vi.fn() },
    measureSource: { findFirst: vi.fn() },
    detect: vi.fn(),
    syncSearch: vi.fn(),
    syncSearchMany: vi.fn(),
    invalidate: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    measureRevision: mocks.measureRevision,
    measureReaderGuide: mocks.measureReaderGuide,
    measureSource: mocks.measureSource,
    $transaction: (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx),
  },
}));
vi.mock("@/services/measures/reader-guide-detection", () => ({
  detectReaderGuideTerms: mocks.detect,
}));
vi.mock("@/lib/measures/search-sync", () => ({
  syncSearchDocument: mocks.syncSearch,
  syncSearchDocuments: mocks.syncSearchMany,
}));
vi.mock("@/lib/measures/cache", () => ({ invalidateMeasureTags: mocks.invalidate }));

describe("workflow des repères citoyens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.measureRevision.findUnique.mockResolvedValue({
      text: "Supprimer les zones à faibles émissions.",
      details: null,
      measure: { id: "measure-1", electionId: "election-1" },
    });
    mocks.measureReaderGuide.findMany.mockResolvedValue([
      {
        id: "guide-1",
        slug: "zones-faibles-emissions",
        label: "Zone à faibles émissions (ZFE)",
        aliases: ["zones à faibles émissions"],
        publicationStatus: "PUBLISHED",
      },
    ]);
    mocks.detect.mockResolvedValue([
      {
        term: "zones à faibles émissions",
        canonicalLabel: "Zone à faibles émissions",
        evidenceSpan: "Supprimer les zones à faibles émissions",
        needsExplanation: true,
        reason: "Dispositif réglementaire non expliqué",
        confidence: 0.96,
      },
    ]);
    mocks.tx.measureRevisionReaderGuide.createMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 0 });
    mocks.tx.measureRevisionReaderGuide.updateMany.mockResolvedValue({ count: 0 });
    mocks.tx.measureRevisionReaderGuide.deleteMany.mockResolvedValue({ count: 0 });
    mocks.tx.measureReaderGuide.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.$queryRaw.mockResolvedValue([{ id: "measure-1" }]);
    mocks.tx.measure.findFirst.mockResolvedValue({ id: "measure-1" });
  });

  it("crée uniquement une suggestion et reste idempotent", async () => {
    const { proposeReaderGuidesForRevision } = await import("./reader-guides");

    const first = await proposeReaderGuidesForRevision("revision-1", "admin");
    const second = await proposeReaderGuidesForRevision("revision-1", "admin");

    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(mocks.tx.measureRevisionReaderGuide.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          revisionId: "revision-1",
          guideId: "guide-1",
          status: "SUGGESTED",
          method: "AI_ASSISTED",
        }),
      ],
      skipDuplicates: true,
    });
    expect(mocks.syncSearch).not.toHaveBeenCalled();
    expect(mocks.tx.measureReaderGuideDetectionRun.upsert).toHaveBeenCalledTimes(2);
  });

  it("mémorise aussi une analyse sans suggestion", async () => {
    mocks.detect.mockResolvedValue([]);
    const { proposeReaderGuidesForRevision } = await import("./reader-guides");

    const result = await proposeReaderGuidesForRevision("revision-1", "admin", {
      ipAddress: "203.0.113.8",
      userAgent: "vitest-agent",
    });

    expect(result).toEqual({ created: 0, proposals: [] });
    expect(mocks.tx.measureReaderGuideDetectionRun.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ resultCount: 0 }),
        update: expect.objectContaining({ resultCount: 0 }),
      })
    );
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ipAddress: "203.0.113.8",
        userAgent: "vitest-agent",
      }),
    });
  });

  it("retire uniquement les suggestions IA obsolètes lors d'une nouvelle version", async () => {
    mocks.detect.mockResolvedValue([]);
    mocks.tx.measureRevisionReaderGuide.deleteMany.mockResolvedValue({ count: 2 });
    const { proposeReaderGuidesForRevision } = await import("./reader-guides");

    await proposeReaderGuidesForRevision("revision-1", "admin");

    expect(mocks.tx.measureRevisionReaderGuide.deleteMany).toHaveBeenCalledWith({
      where: {
        revisionId: "revision-1",
        status: "SUGGESTED",
        method: "AI_ASSISTED",
        detectorVersion: { not: "mistral-small-latest:reader-guides-v2" },
      },
    });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changes: expect.objectContaining({ supersededSuggestionsRemoved: 2 }),
      }),
    });
  });

  it("actualise une suggestion IA d'une ancienne version sans créer de doublon", async () => {
    mocks.tx.measureRevisionReaderGuide.updateMany.mockResolvedValueOnce({ count: 1 });
    const { proposeReaderGuidesForRevision } = await import("./reader-guides");

    const result = await proposeReaderGuidesForRevision("revision-1", "admin");

    expect(result.created).toBe(0);
    expect(mocks.tx.measureRevisionReaderGuide.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          revisionId: "revision-1",
          normalizedTerm: "zones a faibles emissions",
          status: "SUGGESTED",
          method: "AI_ASSISTED",
          detectorVersion: { not: "mistral-small-latest:reader-guides-v2" },
        }),
        data: expect.objectContaining({
          guideId: "guide-1",
          detectorVersion: "mistral-small-latest:reader-guides-v2",
        }),
      })
    );
    expect(mocks.tx.measureRevisionReaderGuide.createMany).not.toHaveBeenCalled();
  });

  it("refuse d'approuver un rattachement vers un repère non publié", async () => {
    mocks.tx.measureRevisionReaderGuide.findUnique.mockResolvedValue({
      status: "SUGGESTED",
      guideId: "guide-1",
      revisionId: "revision-1",
      revision: {
        measure: { id: "measure-1", electionId: "election-1", candidacyId: "candidacy-1" },
      },
    });
    mocks.tx.measureReaderGuide.findUnique.mockResolvedValue({
      publicationStatus: "DRAFT",
      active: true,
    });
    const { reviewReaderGuideMention } = await import("./reader-guides");

    await expect(
      reviewReaderGuideMention({
        mentionId: "mention-1",
        status: "APPROVED",
        reviewedBy: "admin",
      })
    ).rejects.toThrow(/doit être publié/);
    expect(mocks.tx.measureRevisionReaderGuide.updateMany).not.toHaveBeenCalled();
  });

  it("verrouille la mesure avant une validation et sa synchronisation de recherche", async () => {
    mocks.tx.measureRevisionReaderGuide.findUnique.mockResolvedValue({
      status: "SUGGESTED",
      guideId: "guide-1",
      revisionId: "revision-1",
      revision: {
        measure: { id: "measure-1", electionId: "election-1", candidacyId: "candidacy-1" },
      },
    });
    mocks.tx.measureReaderGuide.findUnique.mockResolvedValue({
      publicationStatus: "PUBLISHED",
      active: true,
    });
    mocks.tx.measureRevisionReaderGuide.findFirst.mockResolvedValue(null);
    mocks.tx.measureRevisionReaderGuide.updateMany.mockResolvedValue({ count: 1 });
    const { reviewReaderGuideMention } = await import("./reader-guides");

    await reviewReaderGuideMention({
      mentionId: "mention-1",
      status: "APPROVED",
      reviewedBy: "admin",
    });

    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.syncSearch.mock.invocationCallOrder[0]!
    );
    expect(mocks.invalidate).toHaveBeenCalledWith("measure-1", "election-1");
  });

  it("n'invalide pas le cache Next quand la validation vient d'un processus CLI", async () => {
    mocks.tx.measureRevisionReaderGuide.findUnique.mockResolvedValue({
      status: "SUGGESTED",
      guideId: "guide-1",
      revisionId: "revision-1",
      revision: {
        measure: { id: "measure-1", electionId: "election-1", candidacyId: "candidacy-1" },
      },
    });
    mocks.tx.measureReaderGuide.findUnique.mockResolvedValue({
      publicationStatus: "PUBLISHED",
      active: true,
    });
    mocks.tx.measureRevisionReaderGuide.findFirst.mockResolvedValue(null);
    mocks.tx.measureRevisionReaderGuide.updateMany.mockResolvedValue({ count: 1 });
    const { reviewReaderGuideMention } = await import("./reader-guides");
    const input = {
      mentionId: "mention-1",
      status: "APPROVED" as const,
      reviewedBy: "cli:reader-guides:test",
      invalidateCache: false,
    };

    await reviewReaderGuideMention(input);

    expect(mocks.syncSearch).toHaveBeenCalledWith(mocks.tx, "measure-1");
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("refuse un lot si la révision relue n'est plus la révision publique", async () => {
    mocks.tx.measureRevisionReaderGuide.findUnique.mockResolvedValue({
      status: "SUGGESTED",
      guideId: "guide-1",
      revisionId: "revision-1",
      revision: {
        measure: { id: "measure-1", electionId: "election-1", candidacyId: "candidacy-1" },
      },
    });
    mocks.tx.measure.findFirst.mockResolvedValue(null);
    const { reviewReaderGuideMention } = await import("./reader-guides");

    await expect(
      reviewReaderGuideMention({
        mentionId: "mention-1",
        expectedPublicRevisionId: "revision-1",
        status: "APPROVED",
        reviewedBy: "admin",
      })
    ).rejects.toThrow(/révision publique a changé/);

    expect(mocks.tx.measure.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "measure-1",
        publishedRevisionId: "revision-1",
      }),
      select: { id: true },
    });
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(mocks.tx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.tx.measure.findFirst.mock.invocationCallOrder[0]!
    );
    expect(mocks.tx.measureRevisionReaderGuide.updateMany).not.toHaveBeenCalled();
    expect(mocks.syncSearch).not.toHaveBeenCalled();
  });

  it("limite une source de programme aux documents programmatiques primaires", async () => {
    mocks.measureSource.findFirst.mockResolvedValue({ id: "source-1" });
    mocks.tx.measureReaderGuide.create.mockResolvedValue({ id: "guide-2" });
    const { saveReaderGuideDraft } = await import("./reader-guides");

    await saveReaderGuideDraft(
      {
        slug: "kafala-judiciaire",
        label: "Kafala judiciaire",
        definition:
          "Mesure de recueil légal d'un enfant prévue par certains droits étrangers, sans adoption.",
        aliases: ["kafala"],
        sourceKind: "PROGRAM_SOURCE",
        sourceUrl: "https://example.org/programme.pdf",
        sourceLabel: "Programme présidentiel",
        sourcePublisher: "Candidature",
        sourceRevisionId: "revision-1",
      },
      "admin"
    );

    expect(mocks.measureSource.findFirst).toHaveBeenCalledWith({
      where: {
        measureRevisionId: "revision-1",
        url: "https://example.org/programme.pdf",
        tier: "PRIMARY",
        sourceKind: {
          in: ["PROGRAMME_PARTI", "PROGRAMME_CANDIDAT", "PROPOSITIONS_CANDIDAT"],
        },
      },
      select: { id: true },
    });
  });

  it("publie seulement le brouillon dont le contenu a été relu", async () => {
    const guide = {
      id: "guide-1",
      slug: "zones-faibles-emissions",
      label: "Zone à faibles émissions (ZFE)",
      definition: "Une définition institutionnelle suffisamment complète pour être publiée.",
      aliases: ["ZFE"],
      publicationStatus: "DRAFT",
      sourceKind: "OFFICIAL_INSTITUTION" as const,
      sourceUrl: "https://www.ecologie.gouv.fr/politiques-publiques/zones-faibles-emissions-zfe",
      sourceLabel: "Zones à faibles émissions",
      sourcePublisher: "Ministère de la Transition écologique",
      sourceRevisionId: null,
    };
    mocks.tx.measureReaderGuide.findUnique.mockResolvedValue(guide);
    const { publishReaderGuide } = await import("./reader-guides");

    await publishReaderGuide("guide-1", "admin", {}, guide);

    expect(mocks.tx.measureReaderGuide.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "guide-1",
        definition: guide.definition,
        aliases: { equals: ["ZFE"] },
        sourceUrl: guide.sourceUrl,
      }),
      data: expect.objectContaining({ publicationStatus: "PUBLISHED", reviewedBy: "admin" }),
    });
  });

  it("refuse la publication si le brouillon change après la relecture", async () => {
    const guide = {
      id: "guide-1",
      slug: "zones-faibles-emissions",
      label: "Zone à faibles émissions (ZFE)",
      definition: "Une définition institutionnelle suffisamment complète pour être publiée.",
      aliases: ["ZFE"],
      publicationStatus: "DRAFT",
      sourceKind: "OFFICIAL_INSTITUTION" as const,
      sourceUrl: "https://www.ecologie.gouv.fr/politiques-publiques/zones-faibles-emissions-zfe",
      sourceLabel: "Zones à faibles émissions",
      sourcePublisher: "Ministère de la Transition écologique",
      sourceRevisionId: null,
    };
    mocks.tx.measureReaderGuide.findUnique.mockResolvedValue(guide);
    mocks.tx.measureReaderGuide.updateMany.mockResolvedValueOnce({ count: 0 });
    const { publishReaderGuide } = await import("./reader-guides");

    await expect(publishReaderGuide("guide-1", "admin", {}, guide)).rejects.toThrow(
      /changé depuis la relecture/
    );
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("désactive un repère publié et resynchronise chaque mesure concernée une fois", async () => {
    mocks.tx.measureReaderGuide.findUnique.mockResolvedValue({
      active: true,
      publicationStatus: "PUBLISHED",
    });
    mocks.tx.measureRevisionReaderGuide.findMany.mockResolvedValue([
      { revision: { measure: { id: "measure-1", electionId: "election-1" } } },
      { revision: { measure: { id: "measure-1", electionId: "election-1" } } },
      { revision: { measure: { id: "measure-2", electionId: "election-1" } } },
    ]);
    const { deactivateReaderGuide } = await import("./reader-guides");

    await expect(
      deactivateReaderGuide("guide-1", "admin", {
        ipAddress: "203.0.113.8",
        userAgent: "vitest-agent",
      })
    ).resolves.toBe(2);

    expect(mocks.tx.measureReaderGuide.update).toHaveBeenCalledWith({
      where: { id: "guide-1" },
      data: { active: false },
    });
    expect(mocks.syncSearchMany).toHaveBeenCalledWith(expect.anything(), [
      "measure-1",
      "measure-2",
    ]);
    expect(mocks.invalidate).toHaveBeenCalledTimes(2);
  });

  it("annule la désactivation si la resynchronisation de recherche échoue", async () => {
    mocks.tx.measureReaderGuide.findUnique.mockResolvedValue({
      active: true,
      publicationStatus: "PUBLISHED",
    });
    mocks.tx.measureRevisionReaderGuide.findMany.mockResolvedValue([
      { revision: { measure: { id: "measure-1", electionId: "election-1" } } },
    ]);
    mocks.syncSearchMany.mockRejectedValueOnce(new Error("search unavailable"));
    const { deactivateReaderGuide } = await import("./reader-guides");

    await expect(deactivateReaderGuide("guide-1", "admin")).rejects.toThrow("search unavailable");
    expect(mocks.syncSearchMany).toHaveBeenCalledWith(expect.anything(), ["measure-1"]);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
