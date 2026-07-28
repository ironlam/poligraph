import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { VoteCard } from "../VoteCard";
import type { ScrutinGroupPositionData } from "@/lib/data/groupes";

const base = {
  id: "1",
  externalId: "V123",
  slug: "s",
  title: "Titre",
  votingDate: new Date("2024-03-12"),
  legislature: 17,
  chamber: "AN" as const,
  votesFor: 100,
  votesAgainst: 96,
  votesAbstain: 12,
  result: "ADOPTED" as const,
};

function groupPosition(
  id: string,
  position: "POUR" | "CONTRE" | "ABSTENTION",
  code: string
): ScrutinGroupPositionData {
  return {
    id,
    position,
    forCount: 1,
    againstCount: 0,
    abstainCount: 0,
    cohesionPct: 90,
    group: {
      id: `g${id}`,
      code,
      name: `${code} nom`,
      shortName: code,
      color: "#123456",
      slug: code.toLowerCase(),
    },
  };
}

describe("VoteCard", () => {
  it("affiche le libellé de marge (vote serré)", () => {
    render(<VoteCard {...base} />);
    expect(screen.getByText(/vote serré/)).toBeInTheDocument();
    expect(screen.getByText(/majorité \+4/)).toBeInTheDocument();
  });

  it("affiche l'abstention séparément de la barre", () => {
    render(<VoteCard {...base} />);
    expect(screen.getByText(/Abstention: 12/)).toBeInTheDocument();
  });

  it("conserve les comptes Pour et Contre en texte", () => {
    render(<VoteCard {...base} />);
    expect(screen.getByText(/Pour: 100/)).toBeInTheDocument();
    expect(screen.getByText(/Contre: 96/)).toBeInTheDocument();
  });

  it("aucun suffrage exprimé : pas de barre, libellé dédié", () => {
    render(<VoteCard {...base} votesFor={0} votesAgainst={0} votesAbstain={0} />);
    expect(screen.getByText(/Aucun suffrage exprimé/)).toBeInTheDocument();
  });

  it("regroupe date, votants et législature en une ligne calme", () => {
    render(<VoteCard {...base} />);
    expect(screen.getByText(/12 mars 2024 · 208 votants · 17ᵉ législature/)).toBeInTheDocument();
  });

  it("mode compact : pas de barre de suffrages", () => {
    render(<VoteCard {...base} compact />);
    expect(screen.queryByText(/vote serré/)).not.toBeInTheDocument();
  });

  it("affiche les positions de groupes quand fournies", () => {
    render(
      <VoteCard
        {...base}
        groupPositions={[groupPosition("1", "POUR", "RE"), groupPosition("2", "CONTRE", "RN")]}
      />
    );
    expect(screen.getAllByText("RE").length).toBeGreaterThan(0);
    expect(screen.getAllByText("RN").length).toBeGreaterThan(0);
  });

  it("mode compact : pas de positions de groupes", () => {
    render(<VoteCard {...base} compact groupPositions={[groupPosition("1", "POUR", "RE")]} />);
    expect(screen.queryByText("RE")).not.toBeInTheDocument();
  });

  it("motion de censure : pas de cadrage majorité simple, voix pour + note de règle", () => {
    render(
      <VoteCard
        {...base}
        type="MOTION"
        votesFor={239}
        votesAgainst={0}
        votesAbstain={0}
        result="REJECTED"
      />
    );
    expect(screen.queryByText(/majorité \+/)).not.toBeInTheDocument();
    expect(screen.queryByText(/vote serré/)).not.toBeInTheDocument();
    expect(screen.getByText(/239 voix pour/)).toBeInTheDocument();
    expect(screen.getByText(/majorité absolue des membres/)).toBeInTheDocument();
  });

  it("garde-fou : pour > contre mais rejeté (hors motion) masque le libellé de majorité", () => {
    render(
      <VoteCard
        {...base}
        type="ARTICLE"
        votesFor={100}
        votesAgainst={50}
        votesAbstain={0}
        result="REJECTED"
      />
    );
    expect(screen.queryByText(/majorité \+/)).not.toBeInTheDocument();
    expect(screen.queryByText(/vote serré/)).not.toBeInTheDocument();
    // Les comptes bruts restent affichés, sans revendication de majorité.
    expect(screen.getByText(/Pour: 100/)).toBeInTheDocument();
    expect(screen.getByText(/Contre: 50/)).toBeInTheDocument();
  });
});
