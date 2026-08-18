import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewReadinessPanel } from "../ReviewReadinessPanel";

describe("ReviewReadinessPanel", () => {
  it("explique READY sans le présenter comme une validation", () => {
    render(<ReviewReadinessPanel readiness="READY_FOR_REVIEW" warnings={[]} />);

    expect(screen.getByText("Prête pour revue technique")).toBeInTheDocument();
    expect(screen.getByText(/ne valide ni son fond/)).toBeInTheDocument();
  });

  it("rend les warnings très visibles", () => {
    render(
      <ReviewReadinessPanel
        readiness="REVIEW_WITH_WARNING"
        warnings={["POSSIBLE_DIAGNOSIS_AS_ACTION", "WORDING_NEEDS_REVIEW"]}
      />
    );

    expect(screen.getByLabelText("Warnings de revue")).toHaveTextContent(
      "Possible diagnostic transformé en action"
    );
    expect(screen.getByLabelText("Warnings de revue")).toHaveTextContent("Formulation à revoir");
  });

  it("indique qu'un blocage technique interdit la création du DRAFT", () => {
    render(
      <ReviewReadinessPanel
        readiness="TECHNICALLY_BLOCKED"
        warnings={[]}
        blockers={["INVALID_EVIDENCE_SNAPSHOT"]}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("aucun DRAFT ne doit être créé");
    expect(screen.getByRole("alert")).toHaveTextContent("INVALID_EVIDENCE_SNAPSHOT");
  });
});
