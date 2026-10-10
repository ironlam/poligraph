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
const mockGetPoliticianProfile = vi.fn();
vi.mock("@/lib/data/politician-profile", () => ({
  getPoliticianProfile: (slug: string) => mockGetPoliticianProfile(slug),
}));

const mockGetThemesIndex = vi.fn();
vi.mock("@/lib/data/themes-index", () => ({
  getThemesIndex: (electionSlug: string) => mockGetThemesIndex(electionSlug),
}));
const mockGetReaderGuideIndex = vi.fn();
vi.mock("@/lib/data/presidential-reader-guides", () => ({
  getPresidentialReaderGuideIndex: (electionSlug: string) => mockGetReaderGuideIndex(electionSlug),
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

const identity = {
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
};

describe("page présidentielle d'une personne", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPoliticianProfile.mockImplementation(async () => ({ identity }));
    mockGetDetail.mockResolvedValue({
      themes: [],
      recentVotes: [],
      mandateCount: 0,
      probityConvictionCount: 0,
      probityNonDefinitiveConvictionCount: 0,
    });
    mockGetThemesIndex.mockResolvedValue(null);
    mockGetReaderGuideIndex.mockResolvedValue([]);
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

  it("relie les pages thème et les repères indexables, et eux seuls", async () => {
    mockGetCandidacy.mockResolvedValue(candidacy({ primarySourceMeasureCount: 20 }));
    mockGetDetail.mockResolvedValue({
      themes: [
        {
          theme: "SANTE",
          slug: "sante",
          measureCount: 1,
          synthesis: null,
          measures: [{ id: "m1", slug: "m1", text: "Mesure de santé.", sourceUrl: null }],
          subtopics: [],
        },
        {
          theme: "SOCIAL_TRAVAIL",
          slug: "social-travail",
          measureCount: 1,
          synthesis: null,
          measures: [{ id: "m2", slug: "m2", text: "Mesure sociale.", sourceUrl: null }],
          subtopics: [],
        },
      ],
      recentVotes: [],
      mandateCount: 0,
      probityConvictionCount: 0,
      probityNonDefinitiveConvictionCount: 0,
    });
    mockGetThemesIndex.mockResolvedValue({
      themes: [
        { theme: "SANTE", publishable: true },
        { theme: "SOCIAL_TRAVAIL", publishable: false },
      ],
    });
    mockGetReaderGuideIndex.mockResolvedValue([
      {
        slug: "parquet",
        label: "Parquet",
        indexable: true,
        measures: [{ candidateSlug: "camille-riviere" }],
      },
      {
        slug: "kafala-judiciaire",
        label: "Kafala",
        indexable: false,
        measures: [{ candidateSlug: "camille-riviere" }],
      },
    ]);
    const { default: Page } = await import("../page");
    render(await Page({ params: Promise.resolve({ slug: "camille-riviere" }) }));

    const themeLinks = screen.getAllByRole("link", { name: /Comparer les candidats sur ce thème/ });
    expect(themeLinks.map((link) => link.getAttribute("href"))).toEqual([
      "/elections/presidentielle-2027/themes/sante",
    ]);
    expect(screen.getByRole("link", { name: "Parquet" })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/reperes/parquet"
    );
    expect(screen.queryByRole("link", { name: "Kafala" })).not.toBeInTheDocument();
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

  it("propose aussi le partage d'une fiche sans programme publié", async () => {
    mockGetCandidacy.mockResolvedValue(candidacy());
    const { default: Page } = await import("../page");
    render(await Page({ params: Promise.resolve({ slug: "camille-riviere" }) }));
    expect(screen.getAllByRole("group", { name: "Partager cette page" })).toHaveLength(2);
  });

  // The synthesis summarises the RECORD, which exists before any measure does. Rendered through the
  // page rather than against the component: the bug this replaces was the page never calling it.
  it("rend la synthèse de parcours sur une fiche sans programme publié", async () => {
    mockGetCandidacy.mockResolvedValue(
      candidacy({
        synthesis: "Camille Rivière est actuellement conseillère municipale de Testville.",
        synthesisGeneratedAt: new Date("2026-10-01T12:00:00.000Z"),
      })
    );
    const { default: Page } = await import("../page");
    render(await Page({ params: Promise.resolve({ slug: "camille-riviere" }) }));
    expect(
      screen.getByText("Camille Rivière est actuellement conseillère municipale de Testville.")
    ).toBeInTheDocument();
  });

  // Without a zero branch the caption read "des 0 mesures publiées ci-dessous", naming a count of
  // nothing and pointing at blocks the page does not render.
  it("ne promet aucune mesure dans la légende quand il n'y en a pas", async () => {
    mockGetCandidacy.mockResolvedValue(
      candidacy({
        synthesis: "Camille Rivière est actuellement conseillère municipale de Testville.",
        synthesisGeneratedAt: new Date("2026-10-01T12:00:00.000Z"),
      })
    );
    const { default: Page } = await import("../page");
    const { container } = render(
      await Page({ params: Promise.resolve({ slug: "camille-riviere" }) })
    );
    const texte = container.textContent ?? "";
    expect(texte).not.toContain("0 mesures");
    expect(texte).not.toContain("ci-dessous");
    expect(texte).toContain("Texte généré à partir des mandats et des votes");
  });

  it("nomme les mesures dans la légende dès qu'il y en a", async () => {
    mockGetCandidacy.mockResolvedValue(
      candidacy({
        synthesis: "Résumé.",
        synthesisGeneratedAt: new Date("2026-10-01T12:00:00.000Z"),
        publishedMeasureCount: 27,
        primarySourceMeasureCount: 20,
      })
    );
    const { default: Page } = await import("../page");
    const { container } = render(
      await Page({ params: Promise.resolve({ slug: "camille-riviere" }) })
    );
    expect(container.textContent ?? "").toContain("des 27 mesures publiées ci-dessous");
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

  it("rend notFound sans lire de candidature quand la personne n'a pas de document public", async () => {
    mockGetPoliticianProfile.mockResolvedValue(null);
    const { default: Page } = await import("../page");
    await expect(Page({ params: Promise.resolve({ slug: "camille-riviere" }) })).rejects.toThrow(
      "NOT_FOUND"
    );
    expect(mockGetCandidacy).not.toHaveBeenCalled();
  });

  it("désindexe les métadonnées quand la personne n'a pas de document public", async () => {
    mockGetPoliticianProfile.mockResolvedValue(null);
    const { generateMetadata } = await import("../page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "camille-riviere" }),
    });
    expect(metadata).toEqual({ robots: { index: false, follow: true } });
    expect(mockGetCandidacy).not.toHaveBeenCalled();
  });

  // Decided 2026-10-01: withholding a sourced candidacy from search read as a judgement on the
  // candidate when the missing programme is OUR gap. The page says so, so it may be indexed.
  it("indexe une candidature sourcée même sans programme publié", async () => {
    mockGetCandidacy.mockResolvedValue(candidacy());
    const { generateMetadata } = await import("../page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "camille-riviere" }),
    });
    expect(metadata.robots).toBeUndefined();
  });

  it("reste noindex quand aucune candidature publique n'existe", async () => {
    mockGetCandidacy.mockResolvedValue(null);
    const { generateMetadata } = await import("../page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "camille-riviere" }),
    });
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("rend des données structurées Person et Breadcrumb même sans programme publié", async () => {
    mockGetCandidacy.mockResolvedValue(candidacy());
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

  it("laisse le gabarit du layout ajouter la marque, une seule fois", async () => {
    mockGetCandidacy.mockResolvedValue(candidacy());
    const { generateMetadata } = await import("../page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "camille-riviere" }),
    });
    expect(metadata.title).toBe("Camille Rivière, candidature à la présidentielle 2027");
    expect(metadata.openGraph?.title).toBe(
      "Camille Rivière, candidature à la présidentielle 2027 | Poligraph"
    );
    expect(metadata.twitter?.title).toBe(
      "Camille Rivière, candidature à la présidentielle 2027 | Poligraph"
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
