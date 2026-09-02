import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPolitician: vi.fn(),
  getCandidacy: vi.fn(),
  getElection: vi.fn(),
  listMeasures: vi.fn(),
  getSubtopicCounts: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
}));
vi.mock("@/lib/data/politicians", () => ({
  getPolitician: mocks.getPolitician,
}));
vi.mock("@/lib/data/politician-candidacy", () => ({
  getPoliticianPresidentialCandidacy: mocks.getCandidacy,
}));
vi.mock("@/lib/data/presidential-candidacy-field", () => ({
  getPublicElectionIdentity: mocks.getElection,
}));
vi.mock("@/lib/data/measures", () => ({
  listPublicPresidentialMeasures: mocks.listMeasures,
  getPublicMeasureSubtopicCountsByCandidacy: mocks.getSubtopicCounts,
}));

const params = Promise.resolve({ slug: "camille-riviere" });

describe("page des mesures d'une candidature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPolitician.mockResolvedValue({
      id: "politician-1",
      fullName: "Camille Rivière",
    });
    mocks.getElection.mockResolvedValue({
      id: "election-1",
      slug: "presidentielle-2027",
      title: "Présidentielle 2027",
      type: "PRESIDENTIELLE",
    });
    mocks.getCandidacy.mockResolvedValue({
      candidacyId: "candidacy-1",
      primarySourceMeasureCount: 12,
      publishedMeasureCount: 42,
    });
    mocks.listMeasures.mockResolvedValue({
      total: 1,
      data: [
        {
          measureId: "measure-1",
          slug: "camille-riviere-encadrer-les-loyers",
          publicUrl: "/elections/presidentielle-2027/mesures/camille-riviere-encadrer-les-loyers",
          text: "Encadrer les loyers dans les zones tendues.",
          theme: {
            code: "LOGEMENT_URBANISME",
            label: "Logement & Urbanisme",
          },
          sources: [{ url: "https://example.org/programme.pdf" }],
          subtopics: [{ slug: "encadrement-loyers", label: "Encadrement des loyers" }],
        },
      ],
    });
    mocks.getSubtopicCounts.mockResolvedValue([]);
  });

  it("filtre en base et conserve les filtres dans la pagination", async () => {
    mocks.listMeasures.mockResolvedValue({
      total: 21,
      data: [
        {
          measureId: "measure-1",
          slug: "camille-riviere-encadrer-les-loyers",
          publicUrl: "/elections/presidentielle-2027/mesures/camille-riviere-encadrer-les-loyers",
          text: "Encadrer les loyers dans les zones tendues.",
          theme: { code: "LOGEMENT_URBANISME", label: "Logement & Urbanisme" },
          sources: [],
          subtopics: [],
        },
      ],
    });
    const { default: Page } = await import("./page");
    render(
      await Page({
        params,
        searchParams: Promise.resolve({ theme: "logement-urbanisme", q: "loyers" }),
      })
    );

    expect(mocks.listMeasures).toHaveBeenCalledWith({
      electionId: "election-1",
      electionSlug: "presidentielle-2027",
      candidateSlug: "camille-riviere",
      theme: "LOGEMENT_URBANISME",
      subtopicSlug: undefined,
      query: "loyers",
      page: 1,
      limit: 20,
    });
    expect(screen.getByRole("link", { name: "Suivant" })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/candidats/camille-riviere/mesures?theme=logement-urbanisme&q=loyers&page=2"
    );
  });

  it("emploie sous-theme dans le filtre public et accepte encore l'ancien paramètre", async () => {
    mocks.getSubtopicCounts.mockResolvedValue([{ slug: "salaires", label: "Salaires", count: 4 }]);
    const { default: Page } = await import("./page");

    const rendered = render(
      await Page({
        params,
        searchParams: Promise.resolve({ "sous-theme": "salaires" }),
      })
    );

    expect(screen.getByLabelText("Sous-thème")).toHaveAttribute("name", "sous-theme");
    expect(mocks.listMeasures).toHaveBeenLastCalledWith(
      expect.objectContaining({ subtopicSlug: "salaires" })
    );

    rendered.unmount();
    await Page({
      params,
      searchParams: Promise.resolve({ "sous-sujet": "salaires" }),
    });
    expect(mocks.listMeasures).toHaveBeenLastCalledWith(
      expect.objectContaining({ subtopicSlug: "salaires" })
    );
  });

  it("ramène une page démesurée à une valeur sûre avant la requête Prisma", async () => {
    const { default: Page } = await import("./page");
    render(
      await Page({
        params,
        searchParams: Promise.resolve({ page: "9007199254740991" }),
      })
    );

    expect(mocks.listMeasures).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  });

  it("rend des liens explicites vers la mesure et sa source", async () => {
    const { default: Page } = await import("./page");
    render(await Page({ params, searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Les mesures de Camille Rivière"
    );
    expect(screen.getByRole("link", { name: /Voir la mesure : Encadrer/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/mesures/camille-riviere-encadrer-les-loyers"
    );
    expect(screen.getByRole("link", { name: /source externe de la mesure/i })).toHaveAttribute(
      "rel",
      expect.stringContaining("noopener")
    );
    expect(screen.getByRole("link", { name: "Encadrement des loyers" })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/candidats/camille-riviere/mesures?theme=logement-urbanisme&sous-theme=encadrement-loyers"
    );
  });

  it("met les variantes filtrées en noindex tout en gardant la page nue indexable", async () => {
    const { generateMetadata } = await import("./page");
    const bare = await generateMetadata({ params, searchParams: Promise.resolve({}) });
    const filtered = await generateMetadata({
      params,
      searchParams: Promise.resolve({ theme: "sante" }),
    });

    expect(bare.robots).toBeUndefined();
    expect(filtered.robots).toEqual({ index: false, follow: true });
    expect(filtered.alternates?.canonical).toBe(
      "/elections/presidentielle-2027/candidats/camille-riviere/mesures"
    );
  });

  it("garde l'ancienne URL lisible sans proposer le thème historique dans le filtre", async () => {
    const { default: Page } = await import("./page");

    render(
      await Page({
        params,
        searchParams: Promise.resolve({ theme: "social-travail" }),
      })
    );
    expect(mocks.listMeasures).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "SOCIAL_TRAVAIL" })
    );
    expect(
      screen.queryByRole("option", { name: /ancienne classification/ })
    ).not.toBeInTheDocument();
  });
});
