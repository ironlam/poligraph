import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    measureRevisionReaderGuide: {
      createMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    measureReaderGuide: { findUnique: vi.fn() },
    measureReaderGuideDetectionRun: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    tx,
    measureRevision: { findUnique: vi.fn() },
    measureReaderGuide: { findMany: vi.fn() },
    detect: vi.fn(),
    syncSearch: vi.fn(),
    invalidate: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    measureRevision: mocks.measureRevision,
    measureReaderGuide: mocks.measureReaderGuide,
    $transaction: (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx),
  },
}));
vi.mock("@/lib/measures/reader-guide-detection", async (importActual) => {
  const actual = await importActual<typeof import("./reader-guide-detection")>();
  return { ...actual, detectReaderGuideTerms: mocks.detect };
});
vi.mock("@/lib/measures/search-sync", () => ({ syncSearchDocument: mocks.syncSearch }));
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

  it("refuse d'approuver un rattachement vers un repère non publié", async () => {
    mocks.tx.measureRevisionReaderGuide.findUnique.mockResolvedValue({
      status: "SUGGESTED",
      guideId: "guide-1",
      revisionId: "revision-1",
      revision: { measure: { id: "measure-1", electionId: "election-1" } },
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
});
