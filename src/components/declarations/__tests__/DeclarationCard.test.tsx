import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DeclarationCard } from "@/components/declarations/DeclarationCard";
import type { DeclarationDetails } from "@/types/hatvp";

const details: DeclarationDetails = {
  financialParticipations: [
    {
      company: "SCI X",
      evaluation: 616800,
      shares: null,
      capitalPercent: null,
      dividends: null,
      isBoardMember: false,
    },
  ],
  professionalActivities: [],
  electoralMandates: [
    {
      mandate: "Député",
      startDate: "2017",
      endDate: "2024",
      annualRevenues: [
        { year: 2017, amount: 39655 },
        { year: 2018, amount: 72932 },
      ],
    },
  ],
  directorships: [],
  spouseActivity: null,
  collaborators: [
    { name: "KOTARAC ANDREA", employer: "Néant" },
    { name: "RIBLE Raphael", employer: "Rassemblement National" },
  ],
  totalPortfolioValue: 616800,
  totalCompanies: 1,
  latestAnnualIncome: 72932,
  totalDirectorships: 0,
};

const declarations = [
  { id: "d1", type: "INTERETS", year: 2024, hatvpUrl: "H1", pdfUrl: null, details },
  {
    id: "d2",
    type: "PATRIMOINE_DEBUT_MANDAT",
    year: 2022,
    hatvpUrl: "H2",
    pdfUrl: null,
    details: null,
  },
];

function renderCard() {
  return render(
    <TooltipProvider>
      <DeclarationCard declarations={declarations} />
    </TooltipProvider>
  );
}

describe("DeclarationCard (integration)", () => {
  it("keeps the declarative banner", () => {
    renderCard();
    expect(screen.getByText(/Données déclaratives, non auditées/)).toBeInTheDocument();
  });

  it("shows a single participation as a value line (no bar chart)", () => {
    renderCard();
    // "616 800 €" appears in the participation line and in the DIA history row.
    expect(screen.getAllByText(/616\s?800\s?€/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows a named section total", () => {
    renderCard();
    expect(screen.getByText(/Total des montants déclarés dans cette section/)).toBeInTheDocument();
  });

  it("groups empty collaborators and shows usable ones", () => {
    renderCard();
    expect(screen.getByText("RIBLE Raphael")).toBeInTheDocument();
    expect(screen.getByText(/1 collaborateur déclaré « Néant » ou sans objet/)).toBeInTheDocument();
  });

  it("groups declaration links by type and marks the most recent year", () => {
    renderCard();
    expect(screen.getByText("Intérêts (DIA)")).toBeInTheDocument();
    expect(screen.getByText("Patrimoine (préfecture)")).toBeInTheDocument();
    expect(screen.getByText(/Intérêts 2024 · année la plus récente/)).toBeInTheDocument();
    expect(screen.getByText(/Début mandat 2022/)).toBeInTheDocument();
    expect(screen.getAllByText(/ouvre un nouvel onglet/).length).toBeGreaterThan(0);
  });
});
