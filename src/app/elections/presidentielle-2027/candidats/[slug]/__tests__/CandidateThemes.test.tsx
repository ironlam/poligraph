import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CandidateFicheDetail } from "@/lib/data/politician-candidacy";
import { CandidateThemes, CandidateTransparency } from "../_components/CandidateFicheBlocks";

type Theme = CandidateFicheDetail["themes"][number];

function theme(over: Partial<Theme> = {}): Theme {
  return {
    theme: "SANTE",
    slug: "sante",
    measureCount: 1,
    synthesis: null,
    measures: [
      {
        id: "m1",
        slug: "rouvrir-des-maternites",
        text: "Rouvrir des maternités de proximité.",
        sourceUrl: null,
      },
    ],
    subtopics: [],
    ...over,
  };
}

describe("CandidateThemes", () => {
  it("rend TOUTES les mesures d'un sujet, jamais un échantillon", () => {
    // La régression que ça verrouille : la fiche citait la première mesure de chaque sujet et
    // comptait le reste, si bien qu'une candidature à dix-neuf mesures en montrait treize au plus.
    // Un `list[0]` réintroduit dans le loader repasserait ici en silence sans ce test.
    render(
      <CandidateThemes
        themes={[
          theme({
            measureCount: 3,
            measures: [
              {
                id: "m1",
                slug: "premiere-mesure",
                text: "Première mesure santé.",
                sourceUrl: null,
              },
              {
                id: "m2",
                slug: "deuxieme-mesure",
                text: "Deuxième mesure santé.",
                sourceUrl: null,
              },
              {
                id: "m3",
                slug: "troisieme-mesure",
                text: "Troisième mesure santé.",
                sourceUrl: null,
              },
            ],
          }),
        ]}
        electionSlug="presidentielle-2027"
        candidateSlug="camille-riviere"
        measureCount={3}
        lastReviewedAt={null}
      />
    );

    expect(screen.getByText("Première mesure santé.")).toBeInTheDocument();
    expect(screen.getByText("Deuxième mesure santé.")).toBeInTheDocument();
    expect(screen.getByText("Troisième mesure santé.")).toBeInTheDocument();
  });

  it("relie chaque mesure à sa fiche Poligraph", () => {
    render(
      <CandidateThemes
        themes={[theme()]}
        electionSlug="presidentielle-2027"
        candidateSlug="camille-riviere"
        measureCount={1}
        lastReviewedAt={null}
      />
    );

    expect(screen.getByRole("link", { name: /Voir la mesure : Rouvrir/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/mesures/rouvrir-des-maternites"
    );
  });

  it("rend une synthèse thématique publiée dans le HTML avant les mesures", () => {
    render(
      <CandidateThemes
        themes={[
          theme({
            synthesis: "Les mesures portent sur les maternités et l’accès aux soins de proximité.",
          }),
        ]}
        electionSlug="presidentielle-2027"
        candidateSlug="camille-riviere"
        measureCount={1}
        lastReviewedAt={null}
      />
    );

    const heading = screen.getByRole("heading", { level: 3, name: "Santé" });
    const synthesis = screen.getByText(/Les mesures portent sur les maternités/);
    const measure = screen.getByText("Rouvrir des maternités de proximité.");
    expect(
      heading.compareDocumentPosition(synthesis) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      synthesis.compareDocumentPosition(measure) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByText(/puis relue par Poligraph/)).toBeInTheDocument();
  });

  it("n'affiche aucun extrait arbitraire pour un grand programme", () => {
    const measures = Array.from({ length: 16 }, (_, index) => ({
      id: `m${index + 1}`,
      slug: `mesure-${index + 1}`,
      text: `Mesure ${index + 1}.`,
      sourceUrl: null,
    }));
    render(
      <CandidateThemes
        themes={[theme({ measureCount: measures.length, measures })]}
        electionSlug="presidentielle-2027"
        candidateSlug="camille-riviere"
        measureCount={16}
        lastReviewedAt={null}
      />
    );

    expect(screen.queryByText("Mesure 1.")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir ces mesures" })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/candidats/camille-riviere/mesures?theme=sante"
    );
  });

  it("ouvre directement la mesure quand un thème d'un grand programme n'en contient qu'une", () => {
    render(
      <CandidateThemes
        themes={[theme()]}
        electionSlug="presidentielle-2027"
        candidateSlug="camille-riviere"
        measureCount={16}
        lastReviewedAt={null}
      />
    );

    expect(screen.getByRole("link", { name: "Voir cette mesure" })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/mesures/rouvrir-des-maternites"
    );
  });

  it("ne perd aucune mesure au regroupement, sur plusieurs sujets", () => {
    render(
      <CandidateThemes
        themes={[
          theme({
            theme: "SANTE",
            slug: "sante",
            measureCount: 2,
            measures: [
              { id: "s1", slug: "sante-un", text: "Santé un.", sourceUrl: null },
              { id: "s2", slug: "sante-deux", text: "Santé deux.", sourceUrl: null },
            ],
          }),
          theme({
            theme: "TRANSPORTS",
            slug: "transports",
            measureCount: 1,
            measures: [
              { id: "t1", slug: "transports-un", text: "Transports un.", sourceUrl: null },
            ],
          }),
        ]}
        electionSlug="presidentielle-2027"
        candidateSlug="camille-riviere"
        measureCount={3}
        lastReviewedAt={null}
      />
    );

    const section = screen.getByRole("region", { name: /programme/i });
    // Trois textes de mesure rendus, pas deux têtes de liste.
    expect(within(section).getByText("Santé un.")).toBeInTheDocument();
    expect(within(section).getByText("Santé deux.")).toBeInTheDocument();
    expect(within(section).getByText("Transports un.")).toBeInTheDocument();
  });

  it("porte un lien de source par mesure qui en a une, et rien pour les autres", () => {
    render(
      <CandidateThemes
        themes={[
          theme({
            measureCount: 2,
            measures: [
              {
                id: "m1",
                slug: "avec-source",
                text: "Avec source.",
                sourceUrl: "https://example.org/programme.pdf",
              },
              { id: "m2", slug: "sans-source", text: "Sans source.", sourceUrl: null },
            ],
          }),
        ]}
        electionSlug="presidentielle-2027"
        candidateSlug="camille-riviere"
        measureCount={2}
        lastReviewedAt={null}
      />
    );

    const liens = screen.getAllByRole("link", { name: /source externe/i });
    expect(liens).toHaveLength(1);
    expect(liens[0]).toHaveAttribute("href", "https://example.org/programme.pdf");
    expect(liens[0]).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("mène vers la page dédiée du candidat", () => {
    render(
      <CandidateThemes
        themes={[theme()]}
        electionSlug="presidentielle-2027"
        candidateSlug="camille-riviere"
        measureCount={1}
        lastReviewedAt={null}
      />
    );

    const lien = screen.getByRole("link", { name: /Explorer la mesure/ });
    expect(lien).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/candidats/camille-riviere/mesures"
    );
  });

  it("n'affiche rien quand aucun sujet n'est couvert", () => {
    const { container } = render(
      <CandidateThemes
        themes={[]}
        electionSlug="presidentielle-2027"
        candidateSlug="camille-riviere"
        measureCount={0}
        lastReviewedAt={null}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("CandidateTransparency", () => {
  it("ne présente pas toutes les procédures comme un compteur à charge", () => {
    render(
      <CandidateTransparency
        declarationCount={2}
        probityConvictionCount={1}
        probityNonDefinitiveConvictionCount={1}
        politicianSlug="camille-riviere"
      />
    );

    expect(screen.getByText("1 condamnation documentée")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Transparence et probité" })).toBeInTheDocument();
    expect(screen.getByText(/au moins en première instance/)).toBeInTheDocument();
    expect(screen.getByText(/Présomption d'innocence/)).toBeInTheDocument();
    expect(screen.queryByText(/procédures documentées/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir le détail sur sa fiche" })).toHaveAttribute(
      "href",
      "/politiques/camille-riviere"
    );
  });
});
