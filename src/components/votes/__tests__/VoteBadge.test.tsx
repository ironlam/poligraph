import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VotePositionBadge, VotingResultBadge } from "@/components/votes/VoteBadge";
import type { VotePosition, VotingResult } from "@/types";

describe("VotePositionBadge", () => {
  it("affiche 'Pour'", () => {
    render(<VotePositionBadge position="POUR" />);
    expect(screen.getByText("Pour")).toBeInTheDocument();
  });

  it("affiche 'Contre'", () => {
    render(<VotePositionBadge position="CONTRE" />);
    expect(screen.getByText("Contre")).toBeInTheDocument();
  });

  it("rend toutes les positions de l'enum sans crash", () => {
    const cases: [VotePosition, string][] = [
      ["POUR", "Pour"],
      ["CONTRE", "Contre"],
      ["ABSTENTION", "Abstention"],
      ["NON_VOTANT", "Non-votant"],
      ["ABSENT", "Absent"],
    ];
    cases.forEach(([position, label]) => {
      const { unmount } = render(<VotePositionBadge position={position} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    });
  });
});

describe("VotingResultBadge", () => {
  it("affiche le résultat adopté ou rejeté", () => {
    const cases: [VotingResult, string][] = [
      ["ADOPTED", "Adopté"],
      ["REJECTED", "Rejeté"],
    ];
    cases.forEach(([result, label]) => {
      const { unmount } = render(<VotingResultBadge result={result} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    });
  });
});
