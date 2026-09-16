import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCandidates: vi.fn(),
  getSubject: vi.fn(),
  getThemes: vi.fn(),
  getPage: vi.fn(),
  cacheTag: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { election: { findUnique: vi.fn().mockResolvedValue({ id: "election" }) } },
}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: mocks.cacheTag }));
vi.mock("../presidential-candidates-public", () => ({
  getPublicPresidentialCandidates: async () => {
    const subject = await mocks.getSubject();
    return (
      subject?.candidates.map((entry: { candidate: unknown }) => entry.candidate) ??
      mocks.getCandidates()
    );
  },
}));
vi.mock("../themes-index", () => ({
  getThemesIndex: mocks.getThemes,
  loadThemesIndex: async () => {
    const subject = await mocks.getSubject();
    return {
      themes: [
        {
          theme: "SANTE",
          slug: "sante",
          label: "Santé",
          publishable: subject.publishable,
          lastReviewedAt: subject.lastReviewedAt,
        },
      ],
    };
  },
}));
vi.mock("../measures", () => ({
  getPublicComparisonMeasureCounts: async () => {
    const subject = await mocks.getSubject();
    return new Map(
      subject.candidates.map((entry: { candidate: { id: string }; measures: unknown[] }) => [
        entry.candidate.id,
        entry.measures.length,
      ])
    );
  },
  getPublicComparisonMeasurePage: mocks.getPage,
}));

const alice = {
  id: "c1",
  candidateName: "Alice Martin",
  politicianSlug: "alice-martin",
  partyLabel: "Parti A",
  accentColor: "#111111",
};
const bruno = {
  id: "c2",
  candidateName: "Bruno Zola",
  politicianSlug: "bruno-zola",
  partyLabel: "Parti B",
  accentColor: "#222222",
};

describe("getPresidentialComparison", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSubject.mockResolvedValue(undefined);
    mocks.getPage.mockImplementation(async ({ candidacyId, skip, take }) => {
      const subject = await mocks.getSubject();
      const entry = subject.candidates.find(
        (entry: { candidate: { id: string } }) => entry.candidate.id === candidacyId
      );
      return entry.measures
        .slice(skip, skip + take)
        .map((entry: { measure: unknown }) => entry.measure);
    });
    mocks.getCandidates.mockResolvedValue([alice, bruno]);
    mocks.getThemes.mockResolvedValue({
      themes: [
        { theme: "SANTE", slug: "sante", label: "Santé", publishable: true },
        { theme: "TRANSPORTS", slug: "transports", label: "Transports", publishable: false },
      ],
    });
  });

  it("normalise la sélection sans changer l'ordre éditorial", async () => {
    const { getPresidentialComparison } = await import("../presidential-comparison");
    const result = await getPresidentialComparison({
      electionSlug: "presidentielle-2027",
      candidateSlugs: ["bruno-zola", "alice-martin", "bruno-zola"],
    });

    expect(result?.selectedCandidates.map((candidate) => candidate.slug)).toEqual([
      "alice-martin",
      "bruno-zola",
    ]);
    expect(result?.themes).toEqual([{ code: "SANTE", slug: "sante", label: "Santé" }]);
  });

  it("conserve une colonne vide et qualifie une mesure retirée", async () => {
    mocks.getSubject.mockResolvedValue({
      candidates: [
        {
          candidate: alice,
          measures: [
            {
              measure: {
                id: "m1",
                slug: "mesure-active",
                text: "Ouvrir un centre de santé.",
                withdrawal: null,
                precision: "CHIFFREE",
                qualifications: [{ id: "q1", label: "Financement précisé" }],
                sources: [{ url: "https://example.org/source" }],
                subtopics: [{ slug: "soins", label: "Accès aux soins" }],
              },
            },
            {
              measure: {
                id: "m2",
                slug: "mesure-retiree",
                text: "Ancienne mesure.",
                withdrawal: {
                  withdrawnAt: new Date("2026-08-20T00:00:00Z"),
                  sourceUrl: null,
                  sourceLabel: null,
                },
                precision: null,
                qualifications: [],
                sources: [],
                subtopics: [],
              },
            },
          ],
        },
        { candidate: bruno, measures: [] },
      ],
      siblingThemes: [{ theme: "SANTE", slug: "sante", label: "Santé", publishable: true }],
      publishable: true,
      lastReviewedAt: new Date("2026-08-29T00:00:00Z"),
    });

    const { getPresidentialComparison } = await import("../presidential-comparison");
    const result = await getPresidentialComparison({
      electionSlug: "presidentielle-2027",
      candidateSlugs: ["alice-martin", "bruno-zola"],
      themeSlug: "sante",
    });

    expect(result?.selectedCandidates).toHaveLength(2);
    expect(result?.selectedCandidates[0]?.measures.map((measure) => measure.slug)).toEqual([
      "mesure-active",
      "mesure-retiree",
    ]);
    expect(result?.selectedCandidates[0]?.measures[0]).toMatchObject({
      precision: "CHIFFREE",
      qualifications: [{ label: "Financement précisé" }],
    });
    expect(result?.selectedCandidates[0]?.measures[1]?.withdrawal).not.toBeNull();
    expect(result?.selectedCandidates[1]?.measures).toEqual([]);
    expect(result?.selectedCandidates[0]).toMatchObject({
      totalMeasures: 2,
      page: 1,
      totalPages: 1,
    });
  });

  it("pagine chaque personnalité indépendamment", async () => {
    const measures = Array.from({ length: 13 }, (_, index) => ({
      measure: {
        id: `m${index + 1}`,
        slug: `mesure-${index + 1}`,
        text: `Mesure ${index + 1}`,
        withdrawal: null,
        precision: null,
        qualifications: [],
        sources: [],
        subtopics: [],
      },
    }));
    mocks.getSubject.mockResolvedValue({
      candidates: [
        { candidate: alice, measures },
        { candidate: bruno, measures: [] },
      ],
      siblingThemes: [{ theme: "SANTE", slug: "sante", label: "Santé", publishable: true }],
      publishable: true,
      lastReviewedAt: null,
    });

    const { getPresidentialComparison } = await import("../presidential-comparison");
    const result = await getPresidentialComparison({
      electionSlug: "presidentielle-2027",
      candidateSlugs: ["alice-martin", "bruno-zola"],
      themeSlug: "sante",
      candidatePages: { "alice-martin": 2 },
    });

    expect(result?.selectedCandidates[0]).toMatchObject({
      totalMeasures: 13,
      page: 2,
      totalPages: 3,
    });
    expect(result?.selectedCandidates[0]?.measures.map((measure) => measure.slug)).toEqual([
      "mesure-7",
      "mesure-8",
      "mesure-9",
      "mesure-10",
      "mesure-11",
      "mesure-12",
    ]);
    expect(mocks.getPage).toHaveBeenCalledExactlyOnceWith({
      electionId: "election",
      candidacyId: "c1",
      theme: "SANTE",
      skip: 6,
      take: 6,
    });
    for (const call of mocks.cacheTag.mock.calls) {
      expect(call).toEqual(["election-measures:election", "election-candidacies:election"]);
    }
    for (const requestedPage of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const normalized = await getPresidentialComparison({
        electionSlug: "presidentielle-2027",
        candidateSlugs: ["alice-martin"],
        themeSlug: "sante",
        candidatePages: { "alice-martin": requestedPage },
      });
      expect(normalized?.selectedCandidates[0]?.page).toBe(1);
    }
    const last = await getPresidentialComparison({
      electionSlug: "presidentielle-2027",
      candidateSlugs: ["alice-martin"],
      themeSlug: "sante",
      candidatePages: { "alice-martin": 999 },
    });
    expect(last?.selectedCandidates[0]).toMatchObject({
      page: 3,
      totalMeasures: 13,
      totalPages: 3,
    });
    expect(last?.selectedCandidates[0]?.measures.map((m) => m.slug)).toEqual(["mesure-13"]);
  });

  it("ne compare pas un thème qui ne franchit pas le seuil de publication", async () => {
    mocks.getSubject.mockResolvedValue({
      candidates: [],
      siblingThemes: [],
      publishable: false,
      lastReviewedAt: null,
    });

    const { getPresidentialComparison } = await import("../presidential-comparison");
    const result = await getPresidentialComparison({
      electionSlug: "presidentielle-2027",
      candidateSlugs: ["alice-martin", "bruno-zola"],
      themeSlug: "sante",
    });

    expect(result).toBeNull();
  });
});
