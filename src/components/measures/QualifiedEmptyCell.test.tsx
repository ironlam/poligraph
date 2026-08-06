import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QualifiedEmptyCell, type MeasureAbsence } from "./QualifiedEmptyCell";

const ALL: MeasureAbsence[] = [
  {
    kind: "no_vote_identified",
    checkedAt: new Date("2026-08-04T00:00:00Z"),
    scope: "à l'Assemblée, législatures 16 et 17",
  },
  { kind: "never_sat" },
  { kind: "never_held_office" },
  { kind: "no_measure_published", theme: "LOGEMENT_URBANISME" },
  { kind: "not_reviewed" },
  { kind: "insufficient_context" },
  { kind: "not_applicable", reason: "Le sujet ne concerne pas cette candidature" },
];

describe("QualifiedEmptyCell", () => {
  it("rend un libellé non vide pour chacune des sept absences", () => {
    for (const absence of ALL) {
      const { container, unmount } = render(<QualifiedEmptyCell absence={absence} />);
      const text = container.textContent?.trim() ?? "";
      expect(text.length).toBeGreaterThan(1);
      // Jamais une cellule vide ni un tiret seul.
      expect(text).not.toBe("-");
      expect(text).not.toBe("—");
      unmount();
    }
  });

  it("no_vote_identified porte son périmètre et sa date, jamais une vérité intemporelle", () => {
    render(
      <QualifiedEmptyCell
        absence={{
          kind: "no_vote_identified",
          checkedAt: new Date("2026-08-04T00:00:00Z"),
          scope: "à l'Assemblée, législatures 16 et 17",
        }}
      />
    );
    expect(screen.getByText(/à l'Assemblée, législatures 16 et 17/)).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("no_measure_published nomme le thème", () => {
    render(
      <QualifiedEmptyCell absence={{ kind: "no_measure_published", theme: "LOGEMENT_URBANISME" }} />
    );
    // Le libellé du thème vient de THEME_CATEGORY_LABELS, pas d'un littéral.
    expect(screen.getByText(/logement/i)).toBeInTheDocument();
  });

  it("not_applicable affiche sa raison", () => {
    render(
      <QualifiedEmptyCell
        absence={{ kind: "not_applicable", reason: "Le sujet ne concerne pas cette candidature" }}
      />
    );
    expect(screen.getByText(/ne concerne pas cette candidature/)).toBeInTheDocument();
  });
});
