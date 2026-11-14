import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GovernmentProjectGroupSummary } from "@/lib/data/government-project-positions";
import type { GroupListingItem } from "@/lib/data/groupes";
import { GroupCard } from "../GroupCard";
import { GovernmentProjectPositionBreakdown } from "../GovernmentProjectPositionBreakdown";

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

    expect(screen.getByText("pour")).toBeInTheDocument();
    expect(screen.getByText("abst.")).toBeInTheDocument();
    expect(screen.getByText("contre")).toBeInTheDocument();
    expect(screen.getAllByText("33 %")).toHaveLength(3);
    expect(screen.getByText("Sur 3 scrutins")).toBeInTheDocument();
    expect(screen.getByTestId("position-share-bar")).toBeInTheDocument();
    expect(screen.queryByText("Concordance")).not.toBeInTheDocument();
    expect(screen.queryByText("Cohésion")).not.toBeInTheDocument();
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
    expect(screen.getByText("42 %")).toBeInTheDocument();
    expect(screen.queryByText("Participation")).not.toBeInTheDocument();
    expect(screen.queryByTestId("position-share-bar")).not.toBeInTheDocument();
  });

  it("distingue une part nulle d'une valeur indisponible", () => {
    const summary: GovernmentProjectGroupSummary = {
      candidateCount: 2,
      eligibleScrutinCount: 2,
      consideredCount: 2,
      excludedCount: 0,
      groupExcludedCount: 0,
      scopeExcludedCount: 0,
      counts: { POUR: 2, ABSTENTION: 0, CONTRE: 0 },
      percentages: { POUR: 100, ABSTENTION: 0, CONTRE: null },
      updatedAt: null,
    };

    render(<GovernmentProjectPositionBreakdown summary={summary} />);

    expect(screen.getByText("0 %")).toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.getByText("Abstention")).toBeInTheDocument();
    expect(screen.getByText("Contre")).toBeInTheDocument();
    expect(screen.getAllByText("aucun scrutin")).toHaveLength(2);
  });

  it("affiche la part des sièges quand le total de la chambre est connu", () => {
    render(<GroupCard group={{ ...baseGroup, seatCount: 90 }} chamberSeats={574} />);

    expect(screen.getByText("90 députés · 15,7 % des sièges")).toBeInTheDocument();
  });

  it("explique que les non-inscrits n'ont pas de position de groupe calculée", () => {
    render(
      <GroupCard
        group={{
          ...baseGroup,
          code: "NI",
          governmentProjectPositions: null,
        }}
      />
    );

    expect(
      screen.getByText("Non calculé pour les non-inscrits, qui ne forment pas un groupe.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Données indisponibles")).not.toBeInTheDocument();
    expect(screen.queryByText("33 %")).not.toBeInTheDocument();
  });
});
