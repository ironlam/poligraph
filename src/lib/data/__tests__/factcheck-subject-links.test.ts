import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mentionCount: vi.fn(),
  declarationFindFirst: vi.fn(),
  queryCandidacy: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    factCheckMention: { count: mocks.mentionCount },
    declaration: { findFirst: mocks.declarationFindFirst },
  },
}));
vi.mock("../factcheck-context", () => ({ queryCandidacy: mocks.queryCandidacy }));

import { CONFIRMED_MENTION_WHERE } from "@/lib/factchecks/mention-review";
import { queryFactCheckSubjectLinks } from "../factcheck-subject-links";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mentionCount.mockResolvedValue(7);
  mocks.declarationFindFirst.mockResolvedValue(null);
  mocks.queryCandidacy.mockResolvedValue(null);
});

describe("queryFactCheckSubjectLinks", () => {
  it("compte comme la page personne : ses déclarations, plus les mentions confirmées", async () => {
    const links = await queryFactCheckSubjectLinks("p1");
    expect(links.factCheckCount).toBe(7);
    const where = mocks.mentionCount.mock.calls[0]![0].where;
    expect(where.politicianId).toBe("p1");
    expect(where.factCheck.slug).toEqual({ not: null });
    expect(where.OR).toEqual([
      { isClaimant: true },
      { AND: [{ isClaimant: false }, CONFIRMED_MENTION_WHERE] },
    ]);
  });

  it("ne retient qu'une déclaration de patrimoine dont le document est en ligne", async () => {
    mocks.declarationFindFirst.mockResolvedValue({ id: "d1" });
    const links = await queryFactCheckSubjectLinks("p1");
    expect(links.hasPublishedAssetDeclaration).toBe(true);
    expect(mocks.declarationFindFirst.mock.calls[0]![0].where).toEqual({
      politicianId: "p1",
      type: { not: "INTERETS" },
      pdfUrl: { not: null },
    });
  });

  it("sans déclaration publiée ni candidature, les deux liens restent absents", async () => {
    const links = await queryFactCheckSubjectLinks("p1");
    expect(links).toEqual({
      factCheckCount: 7,
      hasPublishedAssetDeclaration: false,
      hasCandidacy: false,
    });
  });

  it("reprend la règle de candidature sourcée du bloc candidature", async () => {
    mocks.queryCandidacy.mockResolvedValue({ status: "DECLARED" });
    const links = await queryFactCheckSubjectLinks("p1");
    expect(mocks.queryCandidacy).toHaveBeenCalledWith("p1");
    expect(links.hasCandidacy).toBe(true);
  });
});
