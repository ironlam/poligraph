import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
const mockGetDetail = vi.fn();
vi.mock("@/lib/data/politician-candidacy", () => ({
  getPoliticianPresidentialCandidacy: (id: string) => mockGetCandidacy(id),
  getCandidateFicheDetail: (candidacyId: string, politicianId: string) =>
    mockGetDetail(candidacyId, politicianId),
}));
const mockGetPolitician = vi.fn();
vi.mock("@/lib/data/politicians", () => ({
  getPolitician: (slug: string) => mockGetPolitician(slug),
}));

const candidacy = (overrides: Record<string, unknown> = {}) => ({
  candidacyId: "cand-1",
  electionSlug: "presidentielle-2027",
  electionShortTitle: "Présidentielle 2027",
  status: "DECLARE",
  sourceUrl: "https://example.org/source",
  sourceLabel: "Le Monde, 14 janvier 2026",
  partyLabel: "Parti Test",
  partyLogoUrl: null,
  partyColor: "#123456",
  programmeIdentified: false,
  declaredAt: null,
  withdrewAt: null,
  synthesis: null,
  synthesisGeneratedAt: null,
  publishedMeasureCount: 0,
  themesCoveredCount: 0,
  primarySourceMeasureCount: 0,
  lastReviewedAt: null,
  round1Pct: null,
  round2Pct: null,
  isElected: false,
  ...overrides,
});

describe("page présidentielle d'une personne", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPolitician.mockResolvedValue({
      id: "p1",
      slug: "camille-riviere",
      fullName: "Camille Rivière",
      firstName: "Camille",
      lastName: "Rivière",
      civility: "Mme",
      photoUrl: null,
      blobPhotoUrl: null,
      declarations: [],
      affairs: [],
    });
    mockGetDetail.mockResolvedValue({
      themes: [],
      recentVotes: [],
      mandateCount: 0,
      probityConvictionCount: 0,
      probityNonDefinitiveConvictionCount: 0,
    });
  });

  it("rend en 200 une page minimale avec zéro proposition publiée", async () => {
    mockGetCandidacy.mockResolvedValue(candidacy());
    const { default: Page } = await import("../page");
    render(await Page({ params: Promise.resolve({ slug: "camille-riviere" }) }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Camille Rivière");
    expect(
      screen.getByText(
        "Poligraph n’a pas encore trouvé ou traité de programme pour cette candidature."
      )
    ).toBeInTheDocument();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockGetDetail).not.toHaveBeenCalled();
  });

  it("rend l'état programme identifié sans publier de proposition", async () => {
    mockGetCandidacy.mockResolvedValue(candidacy({ programmeIdentified: true }));
    const { default: Page } = await import("../page");
    render(await Page({ params: Promise.resolve({ slug: "camille-riviere" }) }));
    expect(
      screen.getByText("Poligraph a repéré un programme. Son traitement éditorial est en cours.")
    ).toBeInTheDocument();
  });

  it("garde les blocs enrichis derrière la porte de publication", async () => {
    mockGetCandidacy.mockResolvedValue(
      candidacy({ publishedMeasureCount: 27, themesCoveredCount: 9, primarySourceMeasureCount: 20 })
    );
    const { default: Page } = await import("../page");
    render(await Page({ params: Promise.resolve({ slug: "camille-riviere" }) }));
    expect(mockGetDetail).toHaveBeenCalledWith("cand-1", "p1");
    expect(screen.queryByText(/aucun programme publié/i)).not.toBeInTheDocument();
  });

  it("propose le partage de la fiche une fois la porte franchie", async () => {
    mockGetCandidacy.mockResolvedValue(candidacy({ primarySourceMeasureCount: 20 }));
    const { default: Page } = await import("../page");
    render(await Page({ params: Promise.resolve({ slug: "camille-riviere" }) }));
    // Deux barres, la verticale du desktop et celle du bas sur mobile, comme sur les autres fiches.
    expect(screen.getAllByRole("group", { name: "Partager cette page" })).toHaveLength(2);
    const shareLink = screen.getAllByRole("link", { name: "Partager sur X" })[0]!;
    expect(shareLink).toHaveAttribute(
      "href",
      expect.stringContaining(
        encodeURIComponent(
          "https://poligraph.fr/elections/presidentielle-2027/candidats/camille-riviere"
        )
      )
    );
    // Ni le statut de candidature ni le nombre de mesures : un post daté leur survit.
    expect(shareLink.getAttribute("href")).toContain(
      encodeURIComponent(
        "Camille Rivière, Présidentielle 2027 (Parti Test) : ses mesures et leurs sources sur Poligraph"
      )
    );
  });

  it("ne propose pas le partage sous la porte de publication", async () => {
    mockGetCandidacy.mockResolvedValue(candidacy());
    const { default: Page } = await import("../page");
    render(await Page({ params: Promise.resolve({ slug: "camille-riviere" }) }));
    expect(screen.queryByRole("group", { name: "Partager cette page" })).not.toBeInTheDocument();
  });

  it("présente la source comme lien externe secondaire", async () => {
    mockGetCandidacy.mockResolvedValue(candidacy());
    const { default: Page } = await import("../page");
    render(await Page({ params: Promise.resolve({ slug: "camille-riviere" }) }));
    expect(screen.getByText("Vérifier le statut de candidature")).toBeInTheDocument();
    const source = screen.getByRole("link", { name: /source originale, lien externe/ });
    expect(source).toHaveAttribute("href", "https://example.org/source");
    expect(source).toHaveAttribute("rel", "nofollow noopener noreferrer");
  });

  it("redirige seulement quand aucune candidature publique n'existe", async () => {
    mockGetCandidacy.mockResolvedValue(null);
    const { default: Page } = await import("../page");
    await expect(Page({ params: Promise.resolve({ slug: "camille-riviere" }) })).rejects.toThrow(
      "REDIRECT:/politiques/camille-riviere"
    );
  });

  it("reste noindex tant que la porte éditoriale n'est pas franchie", async () => {
    mockGetCandidacy.mockResolvedValue(candidacy());
    const { generateMetadata } = await import("../page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "camille-riviere" }),
    });
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("devient indexable uniquement après franchissement de la porte", async () => {
    mockGetCandidacy.mockResolvedValue(candidacy({ primarySourceMeasureCount: 20 }));
    const { generateMetadata } = await import("../page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "camille-riviere" }),
    });
    expect(metadata.robots).toBeUndefined();
  });

  it("rend des données structurées Person et Breadcrumb seulement sur une fiche publiable", async () => {
    mockGetCandidacy.mockResolvedValue(candidacy({ primarySourceMeasureCount: 20 }));
    const { default: Page } = await import("../page");
    const { container } = render(
      await Page({ params: Promise.resolve({ slug: "camille-riviere" }) })
    );
    const jsonLd = [...container.querySelectorAll('script[type="application/ld+json"]')].map(
      (node) => JSON.parse(node.textContent ?? "{}") as { "@type"?: string }
    );

    expect(jsonLd.map((entry) => entry["@type"])).toEqual(
      expect.arrayContaining(["Person", "BreadcrumbList"])
    );
  });

  it("décrit la fiche pour les aperçus de partage", async () => {
    mockGetCandidacy.mockResolvedValue(candidacy({ primarySourceMeasureCount: 20 }));
    const { generateMetadata } = await import("../page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "camille-riviere" }),
    });
    expect(metadata.openGraph?.title).toContain("Camille Rivière");
    expect(metadata.openGraph?.url).toBe(
      "/elections/presidentielle-2027/candidats/camille-riviere"
    );
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
    // La carte vient de la route opengraph-image voisine, jamais d'une seconde image nommée ici.
    expect(metadata.openGraph?.images).toBeUndefined();
    expect(metadata.twitter?.images).toBeUndefined();
  });
});
