import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MeasureParliamentFinalVote } from "@/lib/data/measure-parliament-links";
import { MeasureFinalVoteChart } from "./MeasureFinalVoteChart";

const group = (code: string, position: "POUR" | "CONTRE" | "ABSTENTION", size = 10) => ({
  id: code,
  code,
  name: `Groupe ${code}`,
  shortName: null,
  color: null,
  position,
  size,
});

function vote(over: Partial<MeasureParliamentFinalVote> = {}): MeasureParliamentFinalVote {
  return {
    slug: "s1",
    title: "Texte",
    votingDate: new Date("2025-03-03T12:00:00Z"),
    chamber: "AN",
    result: "ADOPTED",
    counts: { for: 312, against: 214, abstain: 1 },
    groups: [group("RN", "POUR"), group("LFI", "CONTRE"), group("SOC", "CONTRE")],
    candidateVote: "POUR",
    candidateGroup: { code: "RN", name: "Rassemblement National", position: "POUR" },
    ...over,
  };
}

describe("MeasureFinalVoteChart", () => {
  it("écrit les totaux à côté de la barre, avec le bon accord", () => {
    render(<MeasureFinalVoteChart vote={vote()} candidateName="A B" />);
    expect(screen.getByText(/312/)).toBeInTheDocument();
    expect(screen.getByText(/214/)).toBeInTheDocument();
    expect(screen.getByText(/abstention$/)).toBeInTheDocument();
    expect(screen.getByTestId("position-count-bar")).toHaveAttribute("aria-hidden", "true");
  });

  it("range les groupes par position et repère celui du candidat sans s'appuyer sur la couleur", () => {
    render(<MeasureFinalVoteChart vote={vote()} candidateName="A B" />);
    const pour = screen.getByRole("list", { name: "Groupes : pour" });
    expect(within(pour).getByText(/RN/)).toBeInTheDocument();
    expect(within(pour).getByText("(groupe de A B)", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Groupes : contre" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Groupes : abstention" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Le groupe de A B est entouré (appartenance au groupe non datée).")
    ).toBeInTheDocument();
  });

  it("n'annonce aucun groupe entouré quand celui du candidat est inconnu", () => {
    render(<MeasureFinalVoteChart vote={vote({ candidateGroup: null })} candidateName="A B" />);
    expect(screen.queryByText(/est entouré/)).not.toBeInTheDocument();
    expect(screen.queryByText(/groupe de A B/)).not.toBeInTheDocument();
  });

  it("ne rend rien sans aucun résultat", () => {
    const { container } = render(
      <MeasureFinalVoteChart
        vote={vote({ counts: { for: 0, against: 0, abstain: 0 }, groups: [] })}
        candidateName="A B"
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
