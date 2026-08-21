import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CandidateFicheDetail } from "@/lib/data/politician-candidacy";
import { CandidateThemes } from "../_components/CandidateFicheBlocks";

type Theme = CandidateFicheDetail["themes"][number];

function theme(over: Partial<Theme> = {}): Theme {
  return {
    theme: "SANTE",
    slug: "sante",
    measureCount: 1,
    measures: [{ id: "m1", text: "Rouvrir des maternités de proximité.", sourceUrl: null }],
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
              { id: "m1", text: "Première mesure santé.", sourceUrl: null },
              { id: "m2", text: "Deuxième mesure santé.", sourceUrl: null },
              { id: "m3", text: "Troisième mesure santé.", sourceUrl: null },
            ],
          }),
        ]}
        electionSlug="presidentielle-2027"
        lastReviewedAt={null}
      />
    );

    expect(screen.getByText("Première mesure santé.")).toBeInTheDocument();
    expect(screen.getByText("Deuxième mesure santé.")).toBeInTheDocument();
    expect(screen.getByText("Troisième mesure santé.")).toBeInTheDocument();
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
              { id: "s1", text: "Santé un.", sourceUrl: null },
              { id: "s2", text: "Santé deux.", sourceUrl: null },
            ],
          }),
          theme({
            theme: "TRANSPORTS",
            slug: "transports",
            measureCount: 1,
            measures: [{ id: "t1", text: "Transports un.", sourceUrl: null }],
          }),
        ]}
        electionSlug="presidentielle-2027"
        lastReviewedAt={null}
      />
    );

    const section = screen.getByRole("region", { name: /mesures/i });
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
              { id: "m1", text: "Avec source.", sourceUrl: "https://example.org/programme.pdf" },
              { id: "m2", text: "Sans source.", sourceUrl: null },
            ],
          }),
        ]}
        electionSlug="presidentielle-2027"
        lastReviewedAt={null}
      />
    );

    const liens = screen.getAllByRole("link", { name: /source/i });
    expect(liens).toHaveLength(1);
    expect(liens[0]).toHaveAttribute("href", "https://example.org/programme.pdf");
    expect(liens[0]).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("ne promet pas une comparaison là où le lien mène à l'index des sujets", () => {
    // `/sujets` liste les treize sujets ; la comparaison se fait un cran plus bas, par sujet.
    render(
      <CandidateThemes
        themes={[theme()]}
        electionSlug="presidentielle-2027"
        lastReviewedAt={null}
      />
    );

    const lien = screen.getByRole("link", { name: /Explorer les propositions par thème/ });
    expect(lien).toHaveAttribute("href", "/elections/presidentielle-2027/sujets");
    expect(screen.queryByText(/Comparer ces mesures/)).not.toBeInTheDocument();
  });

  it("n'affiche rien quand aucun sujet n'est couvert", () => {
    const { container } = render(
      <CandidateThemes themes={[]} electionSlug="presidentielle-2027" lastReviewedAt={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
