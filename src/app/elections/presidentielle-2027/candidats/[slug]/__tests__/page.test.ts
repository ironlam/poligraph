import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRedirect = vi.fn((href: string) => {
  throw new Error(`REDIRECT:${href}`);
});
const mockNotFound = vi.fn(() => {
  throw new Error("NOT_FOUND");
});

vi.mock("next/navigation", () => ({
  redirect: (href: string) => mockRedirect(href),
  notFound: () => mockNotFound(),
}));

const mockGetCandidacy = vi.fn();
vi.mock("@/lib/data/politician-candidacy", () => ({
  getPoliticianPresidentialCandidacy: (id: string) => mockGetCandidacy(id),
}));

const mockGetPolitician = vi.fn();
vi.mock("@/lib/data/politicians", () => ({
  getPolitician: (slug: string) => mockGetPolitician(slug),
}));

const candidacy = (overrides: Record<string, unknown> = {}) => ({
  electionSlug: "presidentielle-2027",
  electionShortTitle: "Présidentielle 2027",
  round1Date: new Date("2027-04-11T00:00:00.000Z"),
  round2Date: new Date("2027-04-25T00:00:00.000Z"),
  status: "DECLARE",
  sourceUrl: "https://example.org/source",
  sourceLabel: "Le Monde, 14 janvier 2026",
  declaredAt: null,
  withdrewAt: null,
  publishedMeasureCount: 0,
  themesCoveredCount: 0,
  primarySourceMeasureCount: 0,
  lastReviewedAt: null,
  round1Pct: null,
  round2Pct: null,
  isElected: false,
  ...overrides,
});

describe("page fiche candidat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPolitician.mockResolvedValue({
      id: "p1",
      slug: "camille-riviere",
      fullName: "Camille Rivière",
      civility: "Mme",
    });
  });

  it("renvoie vers la fiche du politique quand la candidature est sous le seuil", async () => {
    mockGetCandidacy.mockResolvedValue(candidacy());
    const { default: Page } = await import("../page");

    await expect(Page({ params: Promise.resolve({ slug: "camille-riviere" }) })).rejects.toThrow(
      "REDIRECT:/politiques/camille-riviere"
    );
  });

  it("renvoie vers la fiche du politique quand il n'y a aucune candidature", async () => {
    mockGetCandidacy.mockResolvedValue(null);
    const { default: Page } = await import("../page");

    await expect(Page({ params: Promise.resolve({ slug: "camille-riviere" }) })).rejects.toThrow(
      "REDIRECT:/politiques/camille-riviere"
    );
  });

  it("rend 404 quand le politique n'existe pas", async () => {
    mockGetPolitician.mockResolvedValue(null);
    const { default: Page } = await import("../page");

    await expect(Page({ params: Promise.resolve({ slug: "inconnu" }) })).rejects.toThrow(
      "NOT_FOUND"
    );
  });

  it("rend la fiche quand le seuil est franchi", async () => {
    mockGetCandidacy.mockResolvedValue(
      candidacy({ publishedMeasureCount: 27, themesCoveredCount: 9, primarySourceMeasureCount: 20 })
    );
    const { default: Page } = await import("../page");

    const result = await Page({ params: Promise.resolve({ slug: "camille-riviere" }) });
    expect(result).toBeDefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("reste hors des moteurs tant que la fiche n'est pas publiable", async () => {
    mockGetCandidacy.mockResolvedValue(candidacy());
    const { generateMetadata } = await import("../page");

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "camille-riviere" }),
    });
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("laisse la fiche publiable entrer dans les moteurs", async () => {
    mockGetCandidacy.mockResolvedValue(
      candidacy({ publishedMeasureCount: 27, themesCoveredCount: 9, primarySourceMeasureCount: 20 })
    );
    const { generateMetadata } = await import("../page");

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "camille-riviere" }),
    });
    expect(metadata.robots).toBeUndefined();
  });

  it("génère zéro paramètre statique : les fiches sortent à l'écriture éditoriale", async () => {
    const { generateStaticParams } = await import("../page");
    expect(await generateStaticParams()).toEqual([]);
  });
});
