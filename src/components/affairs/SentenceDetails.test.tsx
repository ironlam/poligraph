import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SentenceDetails } from "./SentenceDetails";

function renderWithTooltip(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("SentenceDetails", () => {
  it("should render nothing when no sentence data", () => {
    const { container } = renderWithTooltip(<SentenceDetails affair={{}} involvement="DIRECT" />);
    expect(container.firstChild).toBeNull();
  });

  it("should render legacy sentence when no detailed fields", () => {
    renderWithTooltip(
      <SentenceDetails affair={{ sentence: "2 ans avec sursis" }} involvement="DIRECT" />
    );
    expect(screen.getByText("Peine :")).toBeInTheDocument();
    expect(screen.getByText("2 ans avec sursis")).toBeInTheDocument();
  });

  it("should render prison sentence", () => {
    renderWithTooltip(
      <SentenceDetails
        affair={{
          prisonMonths: 24,
          prisonSuspended: false,
        }}
        involvement="DIRECT"
      />
    );
    expect(screen.getByText("Peine prononcée")).toBeInTheDocument();
    expect(screen.getByText("2 ans")).toBeInTheDocument();
    expect(screen.getByText("(ferme)")).toBeInTheDocument();
  });

  it("should render suspended prison sentence", () => {
    renderWithTooltip(
      <SentenceDetails
        affair={{
          prisonMonths: 6,
          prisonSuspended: true,
        }}
        involvement="DIRECT"
      />
    );
    expect(screen.getByText("6 mois")).toBeInTheDocument();
    expect(screen.getByText("(avec sursis)")).toBeInTheDocument();
  });

  it("should render fine amount", () => {
    renderWithTooltip(
      <SentenceDetails
        affair={{
          fineAmount: 50000,
        }}
        involvement="DIRECT"
      />
    );
    expect(screen.getByText(/50.*000/)).toBeInTheDocument();
    expect(screen.getByText("d'amende")).toBeInTheDocument();
  });

  it("should render ineligibility period", () => {
    renderWithTooltip(
      <SentenceDetails
        affair={{
          ineligibilityMonths: 60,
        }}
        involvement="DIRECT"
      />
    );
    expect(screen.getByText("5 ans")).toBeInTheDocument();
    expect(screen.getByText("d'inéligibilité")).toBeInTheDocument();
  });

  it("should render community service hours", () => {
    renderWithTooltip(
      <SentenceDetails
        affair={{
          communityService: 140,
        }}
        involvement="DIRECT"
      />
    );
    expect(screen.getByText("140h")).toBeInTheDocument();
    expect(screen.getByText("de TIG")).toBeInTheDocument();
  });

  it("should render other sentence", () => {
    renderWithTooltip(
      <SentenceDetails
        affair={{
          prisonMonths: 12,
          otherSentence: "interdiction d'exercer",
        }}
        involvement="DIRECT"
      />
    );
    expect(screen.getByText("Autre :")).toBeInTheDocument();
    expect(screen.getByText("interdiction d'exercer")).toBeInTheDocument();
  });

  it("should render multiple penalties together", () => {
    renderWithTooltip(
      <SentenceDetails
        affair={{
          prisonMonths: 24,
          prisonSuspended: true,
          fineAmount: 100000,
          ineligibilityMonths: 120,
        }}
        involvement="DIRECT"
      />
    );
    expect(screen.getByText("2 ans")).toBeInTheDocument();
    expect(screen.getByText("(avec sursis)")).toBeInTheDocument();
    expect(screen.getByText("d'amende")).toBeInTheDocument();
    expect(screen.getByText("10 ans")).toBeInTheDocument();
    expect(screen.getByText("d'inéligibilité")).toBeInTheDocument();
  });

  it("should format months correctly", () => {
    // Less than 12 months
    const { rerender } = renderWithTooltip(
      <SentenceDetails affair={{ prisonMonths: 8 }} involvement="DIRECT" />
    );
    expect(screen.getByText("8 mois")).toBeInTheDocument();

    // Exactly 1 year
    rerender(
      <TooltipProvider>
        <SentenceDetails affair={{ prisonMonths: 12 }} involvement="DIRECT" />
      </TooltipProvider>
    );
    expect(screen.getByText("1 an")).toBeInTheDocument();

    // Multiple years
    rerender(
      <TooltipProvider>
        <SentenceDetails affair={{ prisonMonths: 36 }} involvement="DIRECT" />
      </TooltipProvider>
    );
    expect(screen.getByText("3 ans")).toBeInTheDocument();

    // Years and months
    rerender(
      <TooltipProvider>
        <SentenceDetails affair={{ prisonMonths: 18 }} involvement="DIRECT" />
      </TooltipProvider>
    );
    expect(screen.getByText("1 an et 6 mois")).toBeInTheDocument();
  });
});

/**
 * Issue #511, mitigation de #517 — les colonnes de peine appartiennent à l'affaire,
 * pas à la personne, et une affaire est une ligne par personne. Une fiche où le
 * politicien n'est que mentionné porte donc la peine du tiers poursuivi.
 *
 * Cas réel qui a motivé ce garde : l'affaire Benalla est rattachée à Emmanuel Macron
 * avec `involvement = MENTIONED_ONLY`, et portait 36 mois de prison. La page publique
 * affichait « Peine prononcée » et « 3 ans » sans dire de qui.
 */
describe("SentenceDetails — attribution personnelle (#511)", () => {
  const SENTENCE = {
    prisonMonths: 36,
    fineAmount: 45000,
    ineligibilityMonths: 24,
    otherSentence: "Interdiction d'exercer une fonction publique",
  };
  const NOT_MINE = /ne concernent pas cette personne/;

  it("personne seulement mentionnée, tiers condamné : aucune peine affichée", () => {
    renderWithTooltip(<SentenceDetails affair={SENTENCE} involvement="MENTIONED_ONLY" />);

    expect(screen.getByText(NOT_MINE)).toBeInTheDocument();
    expect(screen.queryByText("Peine prononcée")).not.toBeInTheDocument();
    expect(screen.queryByText("3 ans")).not.toBeInTheDocument();
    expect(screen.queryByText(/45\s*000/)).not.toBeInTheDocument();
    expect(screen.queryByText("2 ans")).not.toBeInTheDocument();
    expect(screen.queryByText(/Interdiction d'exercer/)).not.toBeInTheDocument();
  });

  it("victime dans une affaire de condamnation : aucune peine affichée", () => {
    renderWithTooltip(<SentenceDetails affair={SENTENCE} involvement="VICTIM" />);

    expect(screen.getByText(NOT_MINE)).toBeInTheDocument();
    expect(screen.queryByText("Peine prononcée")).not.toBeInTheDocument();
    expect(screen.queryByText("3 ans")).not.toBeInTheDocument();
  });

  it("plaignant dans une affaire de condamnation : aucune peine affichée", () => {
    renderWithTooltip(<SentenceDetails affair={SENTENCE} involvement="PLAINTIFF" />);

    expect(screen.getByText(NOT_MINE)).toBeInTheDocument();
    expect(screen.queryByText("Peine prononcée")).not.toBeInTheDocument();
    expect(screen.queryByText("3 ans")).not.toBeInTheDocument();
  });

  it("le champ texte hérité est masqué lui aussi", () => {
    // Il contient couramment la peine rédigée en clair, donc le garder reviendrait
    // à contourner le garde par une autre colonne.
    renderWithTooltip(
      <SentenceDetails affair={{ sentence: "2 ans avec sursis" }} involvement="MENTIONED_ONLY" />
    );

    expect(screen.queryByText("2 ans avec sursis")).not.toBeInTheDocument();
    expect(screen.getByText(NOT_MINE)).toBeInTheDocument();
  });

  it("personne directement poursuivie et condamnée : affichage inchangé", () => {
    renderWithTooltip(<SentenceDetails affair={SENTENCE} involvement="DIRECT" />);

    expect(screen.getByText("Peine prononcée")).toBeInTheDocument();
    expect(screen.getByText("3 ans")).toBeInTheDocument();
    expect(screen.getByText("2 ans")).toBeInTheDocument();
    expect(screen.queryByText(NOT_MINE)).not.toBeInTheDocument();
  });

  it("un mis en cause secondaire garde l'affichage : la peine est bien la sienne", () => {
    renderWithTooltip(<SentenceDetails affair={SENTENCE} involvement="INDIRECT" />);

    expect(screen.getByText("Peine prononcée")).toBeInTheDocument();
    expect(screen.queryByText(NOT_MINE)).not.toBeInTheDocument();
  });
});
