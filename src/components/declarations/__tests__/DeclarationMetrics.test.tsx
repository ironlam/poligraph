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

  it("shows separate 'Mandats déclarés' and 'Fonctions de direction déclarées' tiles", () => {
    renderMetrics({
      totalPortfolioValue: 617000,
      totalCompanies: 1,
      latestAnnualIncome: 124000,
      electoralMandatesCount: 2,
      directorshipsCount: 1,
    });
    const mandats = screen.getByText("Mandats déclarés").closest("div")?.parentElement;
    expect(mandats).toHaveTextContent("2");
    const dir = screen.getByText("Fonctions de direction déclarées").closest("div")?.parentElement;
    expect(dir).toHaveTextContent("1");
    expect(screen.queryByText("Mandats et fonctions de direction")).toBeNull();
  });
});
