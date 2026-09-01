import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSynthesis: vi.fn(),
  findCandidacy: vi.fn(),
  findMeasures: vi.fn(),
  updateSynthesis: vi.fn(),
  createAudit: vi.fn(),
  lockCandidacy: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: (callback: (tx: unknown) => unknown) =>
      callback({
        candidacyThemeSynthesis: {
          findUnique: mocks.findSynthesis,
          update: mocks.updateSynthesis,
        },
        candidacy: { findUnique: mocks.findCandidacy },
        measure: { findMany: mocks.findMeasures },
        auditLog: { create: mocks.createAudit },
      }),
  },
}));
vi.mock("@/lib/measures/lock", () => ({
  lockMeasureCandidacy: mocks.lockCandidacy,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findSynthesis.mockResolvedValue({
    id: "synthesis-1",
    theme: "SANTE",
    status: "PENDING_REVIEW",
    corpusFingerprint: "ignored-in-fixture",
    candidacyPresidential: { candidacyId: "cand-1" },
  });
  mocks.findCandidacy.mockResolvedValue({
    id: "cand-1",
    candidateName: "Camille Démonstration",
    electionId: "election-1",
    status: "DECLARE",
    presidentialData: { id: "pres-1" },
  });
  mocks.findMeasures.mockResolvedValue([
    {
      id: "measure-1",
      publishedRevisionId: "revision-1",
      publishedRevision: { text: "Rouvrir des maternités.", details: null },
    },
  ]);
  mocks.updateSynthesis.mockResolvedValue({ id: "synthesis-1" });
  mocks.createAudit.mockResolvedValue({ id: "audit-1" });
});

describe("publishCandidacyThemeSynthesis", () => {
  it("publie une synthèse relue seulement si son corpus est encore identique", async () => {
    const { computeThemeCorpusFingerprint } = await import("../candidacy-theme-synthesis");
    const fingerprint = computeThemeCorpusFingerprint({
      candidateName: "Camille Démonstration",
      theme: "SANTE",
      measures: [
        {
          id: "measure-1",
          revisionId: "revision-1",
          text: "Rouvrir des maternités.",
          details: null,
        },
      ],
    });
    mocks.findSynthesis.mockResolvedValue({
      id: "synthesis-1",
      theme: "SANTE",
      status: "PENDING_REVIEW",
      corpusFingerprint: fingerprint,
      candidacyPresidential: { candidacyId: "cand-1" },
    });
    const { publishCandidacyThemeSynthesis } = await import("../candidacy-theme-synthesis-review");

    const result = await publishCandidacyThemeSynthesis({
      candidacyId: "cand-1",
      synthesisId: "synthesis-1",
      expectedCorpusFingerprint: fingerprint,
      actor: { id: "admin", ipAddress: "127.0.0.1", userAgent: "vitest" },
    });

    expect(result).toEqual({ ok: true, electionId: expect.any(String) });
    expect(mocks.updateSynthesis).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PUBLISHED",
          validatedAt: expect.any(Date),
          validatedBy: "admin",
          publishedAt: expect.any(Date),
        }),
      })
    );
    expect(mocks.createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "PUBLISH_THEME_SYNTHESIS" }),
      })
    );
  });

  it("refuse une validation devenue obsolète et ne publie rien", async () => {
    const { publishCandidacyThemeSynthesis } = await import("../candidacy-theme-synthesis-review");

    const result = await publishCandidacyThemeSynthesis({
      candidacyId: "cand-1",
      synthesisId: "synthesis-1",
      expectedCorpusFingerprint: "old",
      actor: { id: "admin", ipAddress: "127.0.0.1", userAgent: "vitest" },
    });

    expect(result).toMatchObject({ ok: false, reason: "OBSOLETE" });
    expect(mocks.updateSynthesis).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });
});
