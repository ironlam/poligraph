import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FinancialParticipations } from "@/components/declarations/FinancialParticipations";
import type { FinancialParticipation } from "@/types/hatvp";

const p = (company: string, evaluation: number | null): FinancialParticipation => ({
  company,
  evaluation,
  shares: null,
  capitalPercent: null,
  dividends: null,
  isBoardMember: false,
});

describe("FinancialParticipations", () => {
  it("renders nothing with no participations", () => {
    const { container } = render(<FinancialParticipations participations={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("single evaluated: value line, no chart image", () => {
    render(<FinancialParticipations participations={[p("SCI X", 616800)]} />);
    expect(screen.getByText(/616\s?800\s?€/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("unevaluated participation is kept, shown as 'Montant non renseigné'", () => {
    render(<FinancialParticipations participations={[p("SCI X", null)]} />);
    expect(screen.getByText(/Montant non renseigné/)).toBeInTheDocument();
  });

  it("real zero shows 0 €", () => {
    render(<FinancialParticipations participations={[p("SCI X", 0)]} />);
    expect(screen.getByText(/0\s?€/)).toBeInTheDocument();
  });

  it("two or more evaluated: renders the bar chart", () => {
    render(<FinancialParticipations participations={[p("A", 100), p("B", 50)]} />);
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("mixed one evaluated + one null: no chart, both as lines", () => {
    render(<FinancialParticipations participations={[p("A", 100), p("B", null)]} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/Montant non renseigné/)).toBeInTheDocument();
    expect(screen.getByText(/100\s?€/)).toBeInTheDocument();
  });
});
