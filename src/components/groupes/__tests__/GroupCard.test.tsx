import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GroupListingItem } from "@/lib/data/groupes";
import { GroupCard } from "../GroupCard";

const baseGroup: GroupListingItem = {
  id: "group-1",
  code: "RN",
  name: "Groupe test",
  shortName: null,
  color: null,
  slug: "groupe-test",
  chamber: "AN",
  politicalPosition: null,
  seatCount: 10,
  stats: {
    cohesionPct: 81,
    governmentAlignmentPct: 42,
    finalVoteAlignmentPct: 37,
    averageParticipationPct: null,
  },
  governmentProjectPositions: {
    candidateCount: 4,
    eligibleScrutinCount: 3,
    consideredCount: 3,
    excludedCount: 1,
    groupExcludedCount: 0,
    scopeExcludedCount: 1,
    counts: { POUR: 1, ABSTENTION: 1, CONTRE: 1 },
    percentages: { POUR: 100 / 3, ABSTENTION: 100 / 3, CONTRE: 100 / 3 },
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  },
};

describe("carte d'un groupe parlementaire", () => {
  it("remplace la concordance AN par trois parts séparées", () => {
    render(<GroupCard group={baseGroup} />);

    expect(screen.getByText("Positions sur les projets gouvernementaux")).toBeInTheDocument();
    expect(screen.getByText("Pour")).toBeInTheDocument();
    expect(screen.getByText("Abstention")).toBeInTheDocument();
    expect(screen.getByText("Contre")).toBeInTheDocument();
    expect(screen.getAllByText("33 %")).toHaveLength(3);
    expect(screen.queryByText("Concordance")).not.toBeInTheDocument();
  });

  it("conserve la concordance sur une carte du Sénat", () => {
    render(
      <GroupCard
        group={{
          ...baseGroup,
          chamber: "SENAT",
          code: "LR",
          governmentProjectPositions: null,
        }}
      />
    );

    expect(screen.getByText("Concordance")).toBeInTheDocument();
    expect(screen.queryByText("Positions sur les projets gouvernementaux")).not.toBeInTheDocument();
  });
});
