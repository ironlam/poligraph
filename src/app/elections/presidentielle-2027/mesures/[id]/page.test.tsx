import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  electionSlug: "presidentielle-2027",
  theme: "LOGEMENT_URBANISME",
  text: "Construire davantage de logements accessibles",
  precision: "CHIFFREE",
  reviewedAt: new Date("2026-08-20T00:00:00Z"),
  publishedAt: new Date("2026-08-21T00:00:00Z"),
  candidate: {
    name: "Camille Rivière",
    slug: "camille-riviere",
    photoUrl: null,
    blobPhotoUrl: null,
    party: null,
  },
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
};

describe("page publique d'une mesure présidentielle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDetail.mockResolvedValue(detail);
  });

  it("rend une mesure publique avec les labels centraux et ses liens canoniques", async () => {
    const { default: Page } = await import("./page");
    render(await Page({ params: Promise.resolve({ id: "measure-1" }) }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(detail.text);
    expect(screen.getByText("Chiffrée")).toBeInTheDocument();
    expect(screen.getByText("Source primaire")).toBeInTheDocument();
    expect(screen.getByText("Programme de candidature")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Camille Rivière/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/candidats/camille-riviere"
    );
    expect(screen.getByRole("link", { name: /Comparer les mesures/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/themes/logement-urbanisme"
    );
  });

  it("n'invente aucun vote quand aucun lien public n'existe", async () => {
    const { default: Page } = await import("./page");
    render(await Page({ params: Promise.resolve({ id: "measure-1" }) }));
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
    expect(metadata.alternates?.canonical).toBe("/elections/presidentielle-2027/mesures/measure-1");
  });
});
