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

    expect(screen.getByText("Candidature pressentie")).toBeInTheDocument();
  });

  it("affiche le statut quand la candidature est déclarée", () => {
    render(<CandidacyCard candidacy={{ ...baseCandidacy, status: "DECLARE" }} />);

    expect(screen.getByText("Candidature déclarée")).toBeInTheDocument();
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
