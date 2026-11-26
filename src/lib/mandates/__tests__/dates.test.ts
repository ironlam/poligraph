import { describe, expect, it } from "vitest";
import {
  formatMandateDate,
  formatMandatePeriod,
  hasUnknownEnd,
  mandateAxisEnd,
  mandateDuration,
  parsePartialDate,
  sameStartWithin,
} from "../dates";

describe("parsePartialDate", () => {
  it.each([
    ["2001", "2001-01-01T00:00:00.000Z", "YEAR"],
    ["2001-03", "2001-03-01T00:00:00.000Z", "MONTH"],
    ["2001-03-25", "2001-03-25T00:00:00.000Z", "DAY"],
  ])("lit %s sans inventer plus que ce qui est écrit", (input, iso, precision) => {
    const parsed = parsePartialDate(input);
    expect(parsed?.date.toISOString()).toBe(iso);
    expect(parsed?.precision).toBe(precision);
  });

  it.each(["", "01", "2001-13", "2001-02-30", "2001-3-5", "25/03/2001", "2001-03-25T10:00"])(
    "refuse %j",
    (input) => {
      expect(parsePartialDate(input)).toBeNull();
    }
  );
});

describe("formatMandateDate", () => {
  const date = new Date("2001-03-25T00:00:00Z");
  it("n'affiche que ce qui est connu", () => {
    expect(formatMandateDate(date, "YEAR")).toBe("2001");
    expect(formatMandateDate(date, "MONTH")).toBe("mars 2001");
    expect(formatMandateDate(date, "DAY")).toBe("25 mars 2001");
  });

  it("ne glisse pas d'un jour sur une date stockée à minuit UTC", () => {
    expect(formatMandateDate("2001-01-01T00:00:00.000Z", "DAY")).toBe("1 janvier 2001");
  });
});

describe("sameStartWithin", () => {
  const stored = new Date("2001-01-01T00:00:00Z");
  it("une date connue à l'année couvre toute l'année, pas la suivante", () => {
    expect(sameStartWithin(stored, "YEAR", new Date("2001-03-25T00:00:00Z"), 30)).toBe(true);
    expect(sameStartWithin(stored, "YEAR", new Date("2002-01-01T00:00:00Z"), 30)).toBe(false);
  });

  it("une date connue au mois couvre le mois", () => {
    const march = new Date("2001-03-01T00:00:00Z");
    expect(sameStartWithin(march, "MONTH", new Date("2001-03-25T00:00:00Z"), 30)).toBe(true);
    expect(sameStartWithin(march, "MONTH", new Date("2001-04-02T00:00:00Z"), 30)).toBe(false);
  });

  it("une date connue au jour garde la tolérance en jours", () => {
    expect(sameStartWithin(stored, "DAY", new Date("2001-01-20T00:00:00Z"), 30)).toBe(true);
    expect(sameStartWithin(stored, "DAY", new Date("2001-03-25T00:00:00Z"), 30)).toBe(false);
  });
});

describe("affichage d'une période de mandat", () => {
  const NOW = new Date("2026-11-26T00:00:00Z");
  const months = (start: Date, end: Date) =>
    `${Math.round((end.getTime() - start.getTime()) / (86_400_000 * 30.44))} mois`;
  const yearOnly = {
    startDate: "2001-01-01T00:00:00.000Z",
    startDatePrecision: "YEAR" as const,
    endDate: "2014-03-01T00:00:00.000Z",
    endDatePrecision: "MONTH" as const,
    isCurrent: false,
  };
  const closedUnknownEnd = {
    startDate: "2001-03-25T00:00:00.000Z",
    endDate: null,
    isCurrent: false,
  };
  const current = { startDate: "2020-07-03T00:00:00.000Z", endDate: null, isCurrent: true };

  it("n'affiche pas de jour pour une date connue à l'année", () => {
    expect(formatMandatePeriod(yearOnly)).toBe("2001 - mars 2014");
  });

  it("dit « fin non connue » pour un mandat terminé sans date, pas « Aujourd'hui »", () => {
    expect(formatMandatePeriod(closedUnknownEnd)).toBe("25 mars 2001 - fin non connue");
    expect(formatMandatePeriod(current)).toBe("3 juillet 2020 - Aujourd'hui");
    expect(hasUnknownEnd(closedUnknownEnd)).toBe(true);
    expect(hasUnknownEnd(current)).toBe(false);
  });

  it("lit comme connue au jour une fiche stockée avant l'ajout de la précision", () => {
    expect(
      formatMandatePeriod({ startDate: "2012-06-20T00:00:00.000Z", endDate: null, isCurrent: true })
    ).toBe("20 juin 2012 - Aujourd'hui");
  });

  it("n'étire pas jusqu'à aujourd'hui un mandat terminé sans date de fin", () => {
    expect(mandateAxisEnd(closedUnknownEnd, NOW).toISOString()).toBe("2001-03-25T00:00:00.000Z");
    expect(mandateAxisEnd(current, NOW)).toBe(NOW);
    expect(mandateAxisEnd(yearOnly, NOW).toISOString()).toBe("2014-03-01T00:00:00.000Z");
  });

  it("ne calcule aucune durée quand la fin est inconnue", () => {
    expect(mandateDuration(closedUnknownEnd, months, NOW)).toBeNull();
  });

  it("compte en années entières quand une borne n'est pas connue au jour", () => {
    expect(mandateDuration(yearOnly, months, NOW)).toBe("13 ans");
    expect(
      mandateDuration({ ...yearOnly, endDate: "2001-09-01T00:00:00.000Z" }, months, NOW)
    ).toBeNull();
    expect(mandateDuration({ ...yearOnly, endDate: "2002-02-01T00:00:00.000Z" }, months, NOW)).toBe(
      "1 an"
    );
  });

  it("laisse le calcul au mois près quand les deux bornes sont connues au jour", () => {
    expect(
      mandateDuration(
        {
          startDate: "2020-01-01T00:00:00.000Z",
          endDate: "2020-07-01T00:00:00.000Z",
          isCurrent: false,
        },
        months,
        NOW
      )
    ).toBe("6 mois");
    expect(mandateDuration(current, months, NOW)).toBe("77 mois");
  });
});
