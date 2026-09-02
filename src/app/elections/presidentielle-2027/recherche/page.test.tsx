import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const search = vi.fn();
vi.mock("@/lib/presidentielle/corpus-search", () => ({
  searchPresidentialCorpus: (...args: unknown[]) => search(...args),
}));

import PresidentialSearchPage, { metadata } from "./page";

describe("page complète de recherche présidentielle", () => {
  beforeEach(() => {
    search.mockReset();
    search.mockResolvedValue({
      query: "logement",
      total: 1,
      subjects: [],
      candidacies: [],
      measures: [
        {
          type: "measure",
          id: "m1",
          text: "Construire davantage de logements accessibles sur tout le territoire",
          url: "/elections/presidentielle-2027/mesures/m1",
          candidateName: "Camille Rivière",
          candidateSlug: "camille-riviere",
          theme: "LOGEMENT_URBANISME",
          precision: null,
          sourceLabel: null,
          sourceUrl: null,
        },
      ],
    });
  });

  it("reste partageable mais noindex avec un canonical sans requête", () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe("/elections/presidentielle-2027/recherche");
  });

  it("affiche un état HTML accessible sans lancer la recherche lorsque le quota est atteint", async () => {
    render(
      await PresidentialSearchPage({
        searchParams: Promise.resolve({ q: "retraites", limite: "1" }),
      })
    );

    expect(search).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Trop de recherches ont été lancées en peu de temps"
    );
  });

  it("affiche le texte complet et le lien canonique de la mesure", async () => {
    render(await PresidentialSearchPage({ searchParams: Promise.resolve({ q: "logement" }) }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Résultats pour « logement »" })
    ).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: /Construire davantage de logements accessibles sur tout le territoire/,
    });
    expect(link).toHaveAttribute("href", "/elections/presidentielle-2027/mesures/m1");
    expect(search).toHaveBeenCalledWith("presidentielle-2027", "logement", 50, {
      subtopicSlug: undefined,
      page: 1,
      strategy: "hybrid",
    });
  });

  it("regroupe les mesures, expose leur source et prépare une comparaison", async () => {
    search.mockResolvedValue({
      query: "transports",
      total: 2,
      subjects: [],
      candidacies: [],
      measures: [
        {
          type: "measure",
          id: "m1",
          text: "Développer les trains de nuit",
          url: "/elections/presidentielle-2027/mesures/m1",
          candidateName: "Camille Rivière",
          candidateSlug: "camille-riviere",
          theme: "TRANSPORTS",
          precision: null,
          sourceLabel: "PROGRAMME_CANDIDAT",
          sourceUrl: "https://example.org/camille",
        },
        {
          type: "measure",
          id: "m2",
          text: "Renforcer les transports régionaux",
          url: "/elections/presidentielle-2027/mesures/m2",
          candidateName: "Alex Martin",
          candidateSlug: "alex-martin",
          theme: "TRANSPORTS",
          precision: null,
          sourceLabel: "PROGRAMME_CANDIDAT",
          sourceUrl: "https://example.org/alex",
        },
      ],
    });

    render(await PresidentialSearchPage({ searchParams: Promise.resolve({ q: "transports" }) }));

    expect(screen.getByRole("heading", { level: 3, name: "Transports" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /ouvrir dans un nouvel onglet/ })[0]
    ).toHaveAttribute("href", "https://example.org/camille");
    expect(screen.getByRole("link", { name: /Comparer ces candidats/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/comparer?candidat=camille-riviere&candidat=alex-martin&theme=transports"
    );
  });

  it("transmet le slug validé et affiche la pagination d'un sous-thème", async () => {
    search.mockResolvedValue({
      query: "Accès aux soins",
      total: 74,
      subjects: [],
      candidacies: [],
      measures: [
        {
          type: "measure",
          id: "m2",
          text: "Ouvrir des centres de santé",
          url: "/elections/presidentielle-2027/mesures/m2",
          candidateName: "Camille Rivière",
          candidateSlug: "camille-riviere",
          theme: "SANTE",
          precision: null,
          sourceLabel: null,
          sourceUrl: null,
        },
      ],
      filter: {
        type: "subtopic",
        slug: "acces-aux-soins",
        label: "Accès aux soins",
        theme: "SANTE",
      },
      page: 1,
      totalPages: 2,
    });

    render(
      await PresidentialSearchPage({
        searchParams: Promise.resolve({ "sous-theme": "acces-aux-soins" }),
      })
    );

    expect(search).toHaveBeenCalledWith("presidentielle-2027", "", 50, {
      subtopicSlug: "acces-aux-soins",
      page: 1,
      strategy: "lexical",
    });
    expect(screen.getByRole("link", { name: "Suivant" })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/recherche?sous-theme=acces-aux-soins&page=2"
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Mesures sur « Accès aux soins »" })
    ).toBeInTheDocument();
    expect(screen.getByText("Sous-thème")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Santé" })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/themes/sante"
    );

    const measureLink = screen.getByRole("link", { name: "Ouvrir des centres de santé" });
    const newSearch = screen.getByRole("search");
    expect(
      measureLink.compareDocumentPosition(newSearch) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("présente un thème comme un résultat sans message vide ni promesse de comparabilité", async () => {
    search.mockResolvedValue({
      query: "Logement",
      total: 1,
      subjects: [
        {
          type: "subject",
          theme: "LOGEMENT_URBANISME",
          label: "Logement & Urbanisme",
          url: "/elections/presidentielle-2027/themes/logement-urbanisme",
        },
      ],
      candidacies: [],
      measures: [],
    });

    render(
      await PresidentialSearchPage({
        searchParams: Promise.resolve({ q: "Logement" }),
      })
    );

    expect(screen.getByRole("heading", { level: 2, name: "Thématiques" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Logement & Urbanisme/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/themes/logement-urbanisme"
    );
    expect(screen.queryByText(/Aucun résultat/)).not.toBeInTheDocument();
    expect(screen.queryByText(/thème comparable/)).not.toBeInTheDocument();
  });

  it("reprend l'état vide prudent du handoff", async () => {
    search.mockResolvedValue({
      query: "inconnu",
      total: 0,
      subjects: [],
      candidacies: [],
      measures: [],
    });
    render(await PresidentialSearchPage({ searchParams: Promise.resolve({ q: "inconnu" }) }));
    expect(
      screen.getByRole("heading", { name: "Aucun résultat pour « inconnu »" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Cette absence ne prouve pas qu'une proposition n'existe pas/)
    ).toBeInTheDocument();
  });
});
