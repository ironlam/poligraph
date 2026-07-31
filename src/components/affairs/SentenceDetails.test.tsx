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
          prisonFirmMonths: 24,
        }}
        involvement="DIRECT"
      />
    );
    expect(screen.getByText("Peine prononcée")).toBeInTheDocument();
    expect(screen.getByText("2 ans")).toBeInTheDocument();
    expect(screen.getByText("ferme")).toBeInTheDocument();
  });

  it("should render suspended prison sentence", () => {
    renderWithTooltip(
      <SentenceDetails
        affair={{
          prisonMonths: 6,
          prisonFirmMonths: 0,
        }}
        involvement="DIRECT"
      />
    );
    expect(screen.getByText("6 mois")).toBeInTheDocument();
    expect(screen.getByText("avec sursis")).toBeInTheDocument();
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
          prisonFirmMonths: 0,
          fineAmount: 100000,
          ineligibilityMonths: 120,
        }}
        involvement="DIRECT"
      />
    );
    expect(screen.getByText("2 ans")).toBeInTheDocument();
    expect(screen.getByText("avec sursis")).toBeInTheDocument();
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
 * Issue #576 — une peine « N ans dont M avec sursis » n'était pas représentable.
 *
 * `prisonSuspended` était un booléen nullable, et `!prisonSuspended` rendait « (ferme) »
 * pour `false` comme pour `null`. Une fiche publiée a affiché « 3 ans (ferme) » sur une
 * peine dont un an seulement était ferme, triplant la part ferme d'une personne nommée.
 *
 * L'affichage parle du sursis, ce qui est la formulation des arrêts, et le stockage garde
 * la part ferme, dont un repli accidentel sur 0 minore la peine au lieu de la majorer.
 */
describe("SentenceDetails — répartition ferme / sursis (#576)", () => {
  it("nomme la lacune quand la part ferme n'est pas établie", () => {
    renderWithTooltip(
      <SentenceDetails affair={{ prisonMonths: 48, prisonFirmMonths: null }} involvement="DIRECT" />
    );

    expect(screen.getByText("4 ans")).toBeInTheDocument();
    expect(screen.getByText(/répartition ferme \/ sursis non établie/)).toBeInTheDocument();
    expect(screen.queryByText("ferme")).not.toBeInTheDocument();
  });

  it("dit « avec sursis » sur une peine intégralement assortie du sursis", () => {
    renderWithTooltip(
      <SentenceDetails affair={{ prisonMonths: 48, prisonFirmMonths: 0 }} involvement="DIRECT" />
    );

    expect(screen.getByText("4 ans")).toBeInTheDocument();
    expect(screen.getByText("avec sursis")).toBeInTheDocument();
  });

  it("dit « ferme » seulement quand la part ferme égale le total", () => {
    renderWithTooltip(
      <SentenceDetails affair={{ prisonMonths: 48, prisonFirmMonths: 48 }} involvement="DIRECT" />
    );

    expect(screen.getByText("ferme")).toBeInTheDocument();
  });

  it("énonce la part avec sursis sur une peine mixte", () => {
    renderWithTooltip(
      <SentenceDetails affair={{ prisonMonths: 48, prisonFirmMonths: 24 }} involvement="DIRECT" />
    );

    expect(screen.getByText("4 ans")).toBeInTheDocument();
    expect(screen.getByText("dont 2 ans avec sursis")).toBeInTheDocument();
  });

  // Le cas Marine Le Pen du 7 juillet 2026, tel que le tableau de la cour d'appel l'énonce.
  it("rend le cas qui a motivé l'issue", () => {
    renderWithTooltip(
      <SentenceDetails affair={{ prisonMonths: 36, prisonFirmMonths: 12 }} involvement="DIRECT" />
    );

    expect(screen.getByText("3 ans")).toBeInTheDocument();
    expect(screen.getByText("dont 2 ans avec sursis")).toBeInTheDocument();
    expect(screen.queryByText("ferme")).not.toBeInTheDocument();
  });

  // Atteignable à l'exécution : les invariants sont applicatifs et des scripts écrivent
  // directement en base.
  it("n'écrit jamais « ferme » sur des données incohérentes", () => {
    renderWithTooltip(
      <SentenceDetails affair={{ prisonMonths: 48, prisonFirmMonths: 60 }} involvement="DIRECT" />
    );

    expect(screen.getByText(/répartition incohérente dans les données/)).toBeInTheDocument();
    expect(screen.queryByText("ferme")).not.toBeInTheDocument();
  });

  // formatMonths(9999) rendrait « 833 ans et 3 mois ».
  it("rend la perpétuité au lieu de 833 ans", () => {
    renderWithTooltip(
      <SentenceDetails
        affair={{ prisonMonths: 9999, prisonFirmMonths: null }}
        involvement="DIRECT"
      />
    );

    expect(screen.getByText("réclusion criminelle à perpétuité")).toBeInTheDocument();
    expect(screen.queryByText(/833 ans/)).not.toBeInTheDocument();
  });

  it("énonce la part avec sursis de l'inéligibilité", () => {
    renderWithTooltip(
      <SentenceDetails
        affair={{ ineligibilityMonths: 45, ineligibilityFirmMonths: 15 }}
        involvement="DIRECT"
      />
    );

    expect(screen.getByText("3 ans et 9 mois")).toBeInTheDocument();
    expect(screen.getByText("dont 2 ans et 6 mois avec sursis")).toBeInTheDocument();
  });

  /**
   * Collision volontaire, spec §5 : sur l'inéligibilité, le total nu EST la formulation
   * normale du cas intégralement ferme, les arrêts n'écrivant pas « inéligibilité ferme ».
   * Ce n'est donc pas un repli. Asserté pour qu'un changement futur soit une décision.
   */
  it("rend le total nu de l'inéligibilité pour « non établie » comme pour « intégralement ferme »", () => {
    const { container: unknown } = renderWithTooltip(
      <SentenceDetails
        affair={{ ineligibilityMonths: 45, ineligibilityFirmMonths: null }}
        involvement="DIRECT"
      />
    );
    const { container: fullyFirm } = renderWithTooltip(
      <SentenceDetails
        affair={{ ineligibilityMonths: 45, ineligibilityFirmMonths: 45 }}
        involvement="DIRECT"
      />
    );

    expect(unknown.textContent).toContain("3 ans et 9 mois");
    expect(unknown.textContent).toContain("d'inéligibilité");
    expect(unknown.textContent).not.toMatch(/sursis|ferme/);
    expect(fullyFirm.textContent).toBe(unknown.textContent);
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
