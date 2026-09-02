import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCandidates: vi.fn(),
  getSubject: vi.fn(),
  getThemes: vi.fn(),
}));

vi.mock("../presidential-candidates-public", () => ({
  getPublicPresidentialCandidates: mocks.getCandidates,
}));
vi.mock("../subject-page", () => ({ getSubjectPageData: mocks.getSubject }));
vi.mock("../themes-index", () => ({ getThemesIndex: mocks.getThemes }));

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
