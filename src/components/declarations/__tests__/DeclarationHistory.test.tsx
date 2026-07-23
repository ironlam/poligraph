import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  DeclarationHistory,
  declarationHistoryState,
} from "@/components/declarations/DeclarationHistory";
import type { DeclarationDetails } from "@/types/hatvp";

const details = (over: Partial<DeclarationDetails>): DeclarationDetails => ({
  financialParticipations: [],
  professionalActivities: [],
  electoralMandates: [],
  directorships: [],
  spouseActivity: null,
  collaborators: [],
  totalPortfolioValue: null,
  totalCompanies: 0,
  latestAnnualIncome: null,
  totalDirectorships: 0,
  ...over,
});

const part = (evaluation: number | null) => ({
  company: "X",
  evaluation,
  shares: null,
  capitalPercent: null,
  dividends: null,
  isBoardMember: false,
});

describe("declarationHistoryState", () => {
  it("no parsed details => unavailable", () => {
    expect(declarationHistoryState(null).kind).toBe("unavailable");
    expect(declarationHistoryState(null).text).toBe("Donnée indisponible");
  });
  it("DIA with no participation => none", () => {
    const s = declarationHistoryState(details({ financialParticipations: [] }));
    expect(s.kind).toBe("none");
    expect(s.text).toBe("Aucune participation financière déclarée");
  });
  it("participations but no usable evaluation => unknown", () => {
    const s = declarationHistoryState(
      details({ financialParticipations: [part(null)], totalPortfolioValue: null })
    );
    expect(s.kind).toBe("unknown");
    expect(s.text).toBe("Montant non renseigné");
  });
  it("real zero sum shows 0 €, not a dash", () => {
    const s = declarationHistoryState(
      details({ financialParticipations: [part(0)], totalPortfolioValue: 0 })
    );
    expect(s.kind).toBe("value");
    expect(s.text).toBe("0 €");
  });
  it("real value shows the amount", () => {
    const s = declarationHistoryState(
      details({ financialParticipations: [part(617000)], totalPortfolioValue: 617000 })
    );
    expect(s.kind).toBe("value");
    expect(s.text).toContain("617");
  });
});

describe("DeclarationHistory", () => {
  it("lists DIA rows newest first with 'DIA' label", () => {
    render(
      <DeclarationHistory
        declarations={[
          {
            id: "a",
            year: 2022,
            details: details({
              financialParticipations: [part(438000)],
              totalPortfolioValue: 438000,
            }),
          },
          {
            id: "b",
            year: 2024,
            details: details({
              financialParticipations: [part(617000)],
              totalPortfolioValue: 617000,
            }),
          },
        ]}
      />
    );
    expect(screen.getAllByText("DIA")).toHaveLength(2);
    const years = screen.getAllByText(/202[24]/).map((n) => n.textContent);
    expect(years[0]).toContain("2024");
  });

  it("renders nothing when there are no declarations", () => {
    const { container } = render(<DeclarationHistory declarations={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
