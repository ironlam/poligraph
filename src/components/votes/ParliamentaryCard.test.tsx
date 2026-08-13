import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ParliamentaryCard } from "./ParliamentaryCard";

describe("carte parlementaire", () => {
  it("refuse un ancien taux numérique Sénat même si le DTO hostile le contient", () => {
    render(
      <ParliamentaryCard
        data={{
          chamber: "SENAT",
          mandateType: "SENATEUR",
          votesCount: 20,
          eligibleScrutins: 20,
          participationRate: 100,
          participationStatus: "SOURCE_INSUFFICIENT",
          rank: 1,
          totalPeers: 348,
          dissidenceRate: null,
          dissidenceCount: null,
          dissidenceTotal: null,
        }}
        groupCode="LR"
        groupName="Les Républicains"
        groupColor={null}
        constituency={null}
        mandateTitle="Sénateur"
      />
    );

    expect(screen.getByText(/Le Sénat ne publie pas actuellement/)).toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Participation : 100%/)).not.toBeInTheDocument();
  });
});
