import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GroupesComparison } from "./GroupesComparison";

function group(code: string, chamber: "AN" | "SENAT") {
  return {
    group: {
      id: code,
      code,
      shortName: code,
      name: `Groupe ${code}`,
      color: null,
      chamber,
      memberCount: 20,
      legislature: chamber === "AN" ? 17 : null,
      defaultParty: null,
    },
    stats: {
      avgParticipation: null,
      participationStatus: chamber === "SENAT" ? "SOURCE_INSUFFICIENT" : "COMPUTATION_INCOMPLETE",
      cohesionRate: 88,
      totalVotes: 240,
    },
    affairs: [],
    factCheckMentions: [],
  } as never;
}

describe("comparateur des groupes", () => {
  it("masque la participation du groupe Sénat et conserve la cohésion", () => {
    render(<GroupesComparison left={group("LR", "SENAT")} right={group("SOC", "AN")} />);

    expect(screen.getAllByText("Indisponible")).toHaveLength(2);
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
    expect(screen.getAllByText("88%")).toHaveLength(2);
    expect(screen.getByText(/Le Sénat ne publie pas actuellement/)).toBeInTheDocument();
  });
});
