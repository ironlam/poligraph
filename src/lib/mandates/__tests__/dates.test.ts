import { describe, expect, it } from "vitest";
import { formatMandateDate, parsePartialDate, sameStartWithin } from "../dates";

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
