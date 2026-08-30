import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

const getDetail = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NOT_FOUND");
});
vi.mock("@/lib/data/presidential-measure-detail", () => ({
  getPublicPresidentialMeasureDetail: (...args: unknown[]) => getDetail(...args),
}));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

const detail = {
  id: "measure-1",
  slug: "camille-riviere-construire-davantage-de-logements-accessibles",
  electionSlug: "presidentielle-2027",
  theme: "LOGEMENT_URBANISME",
  text: "Construire davantage de logements accessibles",
  details: "La source précise les **territoires concernés** et le calendrier annoncé.",
  precision: "CHIFFREE",
  attribution: "PERSONAL",
  reviewedAt: new Date("2026-08-20T00:00:00Z"),
  publishedAt: new Date("2026-08-21T00:00:00Z"),
  programEdition: {
    label: "Programme pour 2027",
    publishedAt: new Date("2026-08-10T00:00:00Z"),
    documentUrl: "https://example.org/programme-complet",
  },
  candidate: {
    name: "Camille Rivière",
    slug: "camille-riviere",
    photoUrl: null,
    blobPhotoUrl: null,
    party: null,
  },
  subtopics: [
    {
      slug: "logement-social",
      label: "Logement social",
      description: "Construction, attribution et financement du logement social.",
    },
  ],
  sources: [
    {
      id: "source-1",
      sourceKind: "PROGRAMME_CANDIDAT",
      tier: "PRIMARY",
      url: "https://example.org/programme",
      page: "p. 12",
      publishedAt: new Date("2026-08-10T00:00:00Z"),
    },
  ],
  votes: [],
  relatedMeasures: [],
};

describe("page publique d'une mesure présidentielle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDetail.mockResolvedValue(detail);
  });

  it("rend une mesure publique avec les labels centraux et ses liens canoniques", async () => {
    const { default: Page } = await import("./page");
    render(
      <TooltipProvider>
        {await Page({ params: Promise.resolve({ id: "measure-1" }) })}
      </TooltipProvider>
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(detail.text);
    expect(screen.queryByText("Objectif quantifié")).not.toBeInTheDocument();
    expect(screen.getByText("Source primaire")).toBeInTheDocument();
    expect(screen.getByText("Programme de candidature")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ce que prévoit la mesure" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Voir les sources utilisées pour ce contexte" })
    ).toHaveAttribute("href", "#sources");
    expect(screen.getByRole("heading", { name: "Dans le programme" })).toBeInTheDocument();
    expect(screen.getByText("Formulée personnellement")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Consulter le programme/ })).toHaveAttribute(
      "href",
      "https://example.org/programme-complet"
    );
    expect(screen.getByText("territoires concernés")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notions abordées" })).toBeInTheDocument();
    expect(screen.getByText("Logement social")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Logement social" })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/recherche?sous-theme=logement-social"
    );
    expect(
      screen.getByText("Construction, attribution et financement du logement social.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Camille Rivière/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/candidats/camille-riviere"
    );
    expect(screen.getByRole("link", { name: "Voir la méthode" })).toHaveAttribute(
      "href",
      "/methodologie/mesures-presidentielle-2027"
    );
    expect(
      screen.getByRole("link", {
        name: "Comparer cette mesure avec celles d'un autre candidat",
      })
    ).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/comparer?candidat=camille-riviere&theme=logement-urbanisme"
    );
  });

  it("propose des mesures factuelles d'autres personnalités quand elles existent", async () => {
    getDetail.mockResolvedValue({
      ...detail,
      relatedMeasures: [
        {
          slug: "alex-martin-encadrer-les-loyers",
          text: "Encadrer les loyers dans les zones tendues",
          candidateName: "Alex Martin",
          candidateSlug: "alex-martin",
          party: "Parti Test",
          sharedSubtopics: [{ slug: "encadrement-loyers", label: "Encadrement des loyers" }],
        },
      ],
    });
    const { default: Page } = await import("./page");
    render(
      <TooltipProvider>
        {await Page({ params: Promise.resolve({ id: "measure-1" }) })}
      </TooltipProvider>
    );

    expect(
      screen.getByRole("heading", { name: "Ce que proposent d'autres candidates et candidats" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Alex Martin/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/mesures/alex-martin-encadrer-les-loyers"
    );
    expect(screen.getByText("Encadrement des loyers")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Encadrement des loyers" })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/recherche?sous-theme=encadrement-loyers"
    );
  });

  it("n'invente aucun vote quand aucun lien public n'existe", async () => {
    const { default: Page } = await import("./page");
    render(
      <TooltipProvider>
        {await Page({ params: Promise.resolve({ id: "measure-1" }) })}
      </TooltipProvider>
    );
    expect(
      screen.queryByRole("heading", { name: "Votes parlementaires liés" })
    ).not.toBeInTheDocument();
  });

  it("renvoie notFound pour toute mesure refusée par le loader public", async () => {
    getDetail.mockResolvedValue(null);
    const { default: Page } = await import("./page");
    await expect(Page({ params: Promise.resolve({ id: "measure-fermee" }) })).rejects.toThrow(
      "NOT_FOUND"
    );
  });

  it("ne fuit aucun texte fermé dans les métadonnées", async () => {
    getDetail.mockResolvedValue(null);
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: "measure-fermee" }),
    });
    expect(metadata.title).toBe("Mesure indisponible | Poligraph");
    expect(metadata.description).toBeUndefined();
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("produit un canonical propre uniquement pour une mesure publique", async () => {
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: "measure-1" }),
    });
    expect(metadata.alternates?.canonical).toBe(
      "/elections/presidentielle-2027/mesures/camille-riviere-construire-davantage-de-logements-accessibles"
    );
  });
});
