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
    const positions: VotePosition[] = ["POUR", "CONTRE", "ABSTENTION", "NON_VOTANT", "ABSENT"];
    const labels = ["Pour", "Contre", "Abstention", "Non-votant", "Absent"];
    positions.forEach((pos, i) => {
      const { unmount } = render(<VotePositionBadge position={pos} />);
      expect(screen.getByText(labels[i])).toBeInTheDocument();
      unmount();
    });
  });
});

describe("VotingResultBadge", () => {
  it("affiche le résultat adopté ou rejeté", () => {
    const results: VotingResult[] = ["ADOPTED", "REJECTED"];
    const labels = ["Adopté", "Rejeté"];
    results.forEach((result, i) => {
      const { unmount } = render(<VotingResultBadge result={result} />);
      expect(screen.getByText(labels[i])).toBeInTheDocument();
      unmount();
    });
  });
});
