import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DeclarationMetrics } from "@/components/declarations/DeclarationMetrics";
import type { ComponentProps } from "react";

// DeclarationMetrics renders InfoTooltip (Radix Tooltip), which needs a provider.
function renderMetrics(props: ComponentProps<typeof DeclarationMetrics>) {
  return render(
    <TooltipProvider>
      <DeclarationMetrics {...props} />
    </TooltipProvider>
  );
}

describe("DeclarationMetrics", () => {
  it("renames the portfolio tile and never calls it a total portfolio", () => {
    renderMetrics({
      totalPortfolioValue: 617000,
      totalCompanies: 1,
      latestAnnualIncome: 124000,
      electoralMandatesCount: 1,
      directorshipsCount: 1,
    });
    expect(screen.getByText("Participations financières déclarées")).toBeInTheDocument();
    expect(screen.queryByText("Portefeuille total")).toBeNull();
  });

  it("counts mandats + directions, not directorships alone", () => {
    renderMetrics({
      totalPortfolioValue: null,
      totalCompanies: 0,
      latestAnnualIncome: null,
      electoralMandatesCount: 2,
      directorshipsCount: 1,
    });
    const tile = screen
      .getByText("Mandats et fonctions de direction")
      .closest("div")?.parentElement;
    expect(tile).toHaveTextContent("3");
  });
});
