import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MandateTimeline } from "@/components/politicians/MandateTimeline";

/**
 * A mandate entered by hand can be known to the year only, or be over without a recorded end.
 * The list must not turn either into a claim: no duration to the month from a 1 January that was
 * never a real date, and no office "held until today" because its end is missing.
 */

function mandate(over: Record<string, unknown>) {
  return {
    id: "m1",
    type: "MAIRE",
    isCurrent: false,
    startDate: new Date("2001-01-01T00:00:00Z"),
    startDatePrecision: "YEAR",
    endDate: new Date("2014-03-01T00:00:00Z"),
    endDatePrecision: "MONTH",
    role: null,
    title: "Maire de Saint-Exemple",
    constituency: null,
    institution: "Mairie de Saint-Exemple",
    officialUrl: null,
    parliamentaryData: null,
    ...over,
  };
}

function text(mandates: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<MandateTimeline mandates={mandates as any} />).container.textContent ?? "";
}

describe("MandateTimeline : dates partielles et fin inconnue", () => {
  it("compte en années entières une période connue à l'année", () => {
    const out = text([mandate({})]);
    expect(out).toContain("2001 - 2014");
    expect(out).toContain("13 ans");
    expect(out).not.toMatch(/13 ans \d+ mois/);
  });

  it("dit « fin non connue » et ne calcule aucune durée pour un mandat terminé sans date", () => {
    const out = text([mandate({ endDate: null })]);
    expect(out).toContain("2001 - fin non connue");
    // The summary badge counts the career, not this mandate: nothing past its start.
    expect(out).toContain("Moins d’un an de vie politique");
    expect(out).not.toMatch(/\d+ ans/);
  });

  it("garde la durée au mois près quand les deux dates sont connues au jour", () => {
    // Guards the two assertions above: the precise path must still exist.
    const out = text([
      mandate({
        startDate: new Date("2014-04-01T00:00:00Z"),
        startDatePrecision: "DAY",
        endDate: new Date("2020-06-30T00:00:00Z"),
        endDatePrecision: "DAY",
      }),
    ]);
    expect(out).toMatch(/6 ans \d+ mois/);
  });

  it("affiche l'intitulé et l'institution d'un mandat hors catégorie, pas seulement « Autre mandat »", () => {
    const out = text([
      mandate({
        type: "OTHER",
        title: "Président de la communauté d'agglomération de Saint-Exemple",
        institution: "Communauté d'agglomération de Saint-Exemple",
        startDatePrecision: "DAY",
        endDatePrecision: "DAY",
      }),
    ]);
    expect(out).toContain("Autres mandats");
    expect(out).toContain("Président de la communauté d'agglomération de Saint-Exemple");
    expect(out).toContain("Communauté d'agglomération de Saint-Exemple");
  });
});
