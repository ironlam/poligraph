import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CandidacyCard } from "@/components/elections/CandidacyCard";

const baseCandidacy = {
  id: "c1",
  candidateName: "Camille Durand",
  partyLabel: "Parti A",
  constituencyName: null,
  isElected: false,
  round1Pct: null,
  round2Pct: null,
  status: null,
  sourceUrl: null,
  sourceLabel: null,
  politician: { slug: "camille-durand" },
  party: { color: "#123456" },
};

describe("CandidacyCard", () => {
  it("affiche le nom du candidat et son étiquette de parti", () => {
    render(<CandidacyCard candidacy={baseCandidacy} />);

    expect(screen.getByText("Camille Durand")).toBeInTheDocument();
    expect(screen.getByText("Parti A")).toBeInTheDocument();
  });

  it("affiche le statut quand la candidature n'est que pressentie", () => {
    render(<CandidacyCard candidacy={{ ...baseCandidacy, status: "PRESSENTI" }} />);

    expect(screen.getByText("Personnalité pressentie")).toBeInTheDocument();
  });

  it("affiche le statut quand la candidature est annoncée", () => {
    render(<CandidacyCard candidacy={{ ...baseCandidacy, status: "DECLARE" }} />);

    expect(screen.getByText("Candidature annoncée")).toBeInTheDocument();
  });

  it("n'affiche aucun statut quand la candidature n'en porte pas", () => {
    render(<CandidacyCard candidacy={baseCandidacy} />);

    expect(screen.queryByText(/^Candidature /)).not.toBeInTheDocument();
  });

  it("renvoie vers la source qui atteste le statut", () => {
    render(
      <CandidacyCard
        candidacy={{
          ...baseCandidacy,
          status: "PRESSENTI",
          sourceUrl: "https://example.org/article",
          sourceLabel: "Le Monde, 12 mars 2026",
        }}
      />
    );

    const link = screen.getByRole("link", { name: /Le Monde, 12 mars 2026/ });
    expect(link).toHaveAttribute("href", "https://example.org/article");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("n'affiche pas de lien de source quand l'URL manque", () => {
    render(
      <CandidacyCard
        candidacy={{ ...baseCandidacy, status: "PRESSENTI", sourceLabel: "Le Monde" }}
      />
    );

    expect(screen.queryByRole("link", { name: /Le Monde/ })).not.toBeInTheDocument();
  });
});

describe("CandidacyCard : la marque du parti", () => {
  it("rend le logo du parti quand il existe", () => {
    const { container } = render(
      <CandidacyCard
        candidacy={{
          ...baseCandidacy,
          party: {
            color: "#0D378A",
            shortName: "RN",
            logoUrl: "https://upload.wikimedia.org/wikipedia/commons/d/d5/logo.svg",
          },
        }}
      />
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    // Décoratif : le nom du parti est déjà écrit à côté, le répéter n'apporte rien au lecteur d'écran.
    expect(img).toHaveAttribute("alt", "");
    // Les initiales ne doivent pas doubler le logo.
    expect(screen.queryByText("RN")).not.toBeInTheDocument();
  });

  it("se rabat sur les initiales quand le parti n'a pas de logo", () => {
    render(
      <CandidacyCard
        candidacy={{ ...baseCandidacy, party: { color: "#0D378A", shortName: "RN" } }}
      />
    );

    expect(screen.getByText("RN")).toBeInTheDocument();
  });

  it("choisit une couleur de texte lisible sur un fond clair comme sur un fond sombre", () => {
    // Le vrai piège du jeu de couleurs : Renaissance est #FFD600 et Place publique #FFF100.
    // Des initiales blanches y tombent sous 1,2:1. Une valeur codée en dur ferait passer ce test
    // sur le RN et échouer sur Renaissance, donc les deux sont vérifiés ensemble.
    const { getByText, unmount } = render(
      <CandidacyCard
        candidacy={{ ...baseCandidacy, party: { color: "#FFD600", shortName: "RE" } }}
      />
    );
    expect(getByText("RE").getAttribute("style")).toContain("color: rgb(0, 0, 0)");
    unmount();

    render(
      <CandidacyCard
        candidacy={{ ...baseCandidacy, party: { color: "#0D378A", shortName: "RN" } }}
      />
    );
    expect(screen.getByText("RN").getAttribute("style")).toContain("color: rgb(255, 255, 255)");
  });

  it("ne rend aucune marque quand la candidature n'est rattachée à aucun parti", () => {
    const { container } = render(<CandidacyCard candidacy={{ ...baseCandidacy, party: null }} />);

    expect(container.querySelector("img")).toBeNull();
    // L'étiquette textuelle reste, elle : elle vient de la source, pas de l'entité parti.
    expect(screen.getByText("Parti A")).toBeInTheDocument();
  });
});
