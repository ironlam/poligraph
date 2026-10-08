import { describe, it, expect } from "vitest";
import {
  describeEventDate,
  formatEventDate,
  isDateConsistent,
  isUpcoming,
  normalizeEventDate,
  parseEventDateInput,
} from "../dates";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("formatEventDate", () => {
  it("formate un jour", () => {
    expect(formatEventDate({ date: d("2024-05-13"), datePrecision: "DAY" })).toBe("13 mai 2024");
  });
  it("écrit 1er pour le premier jour du mois", () => {
    expect(formatEventDate({ date: d("2024-05-01"), datePrecision: "DAY" })).toBe("1er mai 2024");
  });
  it("formate un mois sans jour", () => {
    expect(formatEventDate({ date: d("2024-05-01"), datePrecision: "MONTH" })).toBe("mai 2024");
  });
  it("formate une année", () => {
    expect(formatEventDate({ date: d("2012-01-01"), datePrecision: "YEAR" })).toBe("2012");
  });
  it("formate une période en années", () => {
    expect(
      formatEventDate({ date: d("2012-01-01"), datePrecision: "YEAR", dateEnd: d("2014-01-01") })
    ).toBe("de 2012 à 2014");
  });
  it("formate une période en mois", () => {
    expect(
      formatEventDate({ date: d("2012-03-01"), datePrecision: "MONTH", dateEnd: d("2014-06-01") })
    ).toBe("de mars 2012 à juin 2014");
  });
});

describe("describeEventDate", () => {
  const scheduledDay = {
    date: d("2026-12-01"),
    datePrecision: "DAY" as const,
    occurrence: "SCHEDULED" as const,
    type: "JUGEMENT" as const,
  };

  it("annonce une date à venir", () => {
    expect(describeEventDate(scheduledDay, d("2026-10-08"))).toEqual({
      text: "Prévu le 1er décembre 2026",
      unconfirmed: false,
    });
  });
  it("signale une date annoncée passée et non confirmée", () => {
    expect(describeEventDate(scheduledDay, d("2026-12-02"))).toEqual({
      text: "Prévu le 1er décembre 2026, non confirmé à ce jour",
      unconfirmed: true,
    });
  });
  it("ne signale rien le jour même", () => {
    expect(describeEventDate(scheduledDay, d("2026-12-01")).unconfirmed).toBe(false);
  });
  it("compte le jour à Paris, pas en UTC", () => {
    // 2026-12-01T23:30Z est déjà le 2 décembre à Paris
    expect(describeEventDate(scheduledDay, new Date("2026-12-01T23:30:00Z")).unconfirmed).toBe(
      true
    );
  });
  it("garde un mois annoncé valable jusqu'à son dernier jour", () => {
    const r = describeEventDate(
      { ...scheduledDay, date: d("2026-12-01"), datePrecision: "MONTH" },
      d("2026-12-15")
    );
    expect(r).toEqual({ text: "Prévu en décembre 2026", unconfirmed: false });
    expect(
      describeEventDate(
        { ...scheduledDay, date: d("2026-12-01"), datePrecision: "MONTH" },
        d("2027-01-01")
      ).unconfirmed
    ).toBe(true);
  });
  it("date une révélation par sa publication", () => {
    const base = { occurrence: "HELD" as const, type: "REVELATION" as const };
    expect(
      describeEventDate({ ...base, date: d("2025-03-03"), datePrecision: "DAY" }, d("2026-10-08"))
        .text
    ).toBe("Publié le 3 mars 2025");
    expect(
      describeEventDate({ ...base, date: d("2025-03-01"), datePrecision: "MONTH" }, d("2026-10-08"))
        .text
    ).toBe("Publié en mars 2025");
    expect(
      describeEventDate({ ...base, date: d("2025-01-01"), datePrecision: "YEAR" }, d("2026-10-08"))
        .text
    ).toBe("Publié en 2025");
  });
  it("rend la date seule pour un acte tenu", () => {
    expect(
      describeEventDate(
        { date: d("2024-05-13"), datePrecision: "DAY", occurrence: "HELD", type: "JUGEMENT" },
        d("2026-10-08")
      )
    ).toEqual({ text: "13 mai 2024", unconfirmed: false });
  });
});

describe("isUpcoming", () => {
  const e = {
    date: d("2026-12-01"),
    datePrecision: "DAY" as const,
    occurrence: "SCHEDULED" as const,
    type: "PROCES" as const,
  };
  it("vrai pour une étape annoncée à venir", () => {
    expect(isUpcoming(e, d("2026-10-08"))).toBe(true);
  });
  it("faux une fois la date dépassée", () => {
    expect(isUpcoming(e, d("2026-12-02"))).toBe(false);
  });
  it("faux pour un acte tenu", () => {
    expect(isUpcoming({ ...e, occurrence: "HELD" }, d("2026-10-08"))).toBe(false);
  });
});

describe("parseEventDateInput", () => {
  it("lit une année", () => {
    expect(parseEventDateInput("2024")).toEqual({ date: d("2024-01-01"), precision: "YEAR" });
  });
  it("lit un mois", () => {
    expect(parseEventDateInput("2024-05")).toEqual({ date: d("2024-05-01"), precision: "MONTH" });
  });
  it("lit un jour", () => {
    expect(parseEventDateInput("2024-05-13")).toEqual({ date: d("2024-05-13"), precision: "DAY" });
  });
  it.each(["2026-02-30", "2024-13", "24-05", "", "2024-00", "2024-05-00", "abcd"])(
    "refuse %s",
    (s) => {
      expect(parseEventDateInput(s)).toBeNull();
    }
  );
});

describe("normalizeEventDate et isDateConsistent", () => {
  it("ramène un mois au jour 1 et une année au 1er janvier", () => {
    const t = new Date("2024-05-13T15:42:00Z");
    expect(normalizeEventDate(t, "DAY")).toEqual(d("2024-05-13"));
    expect(normalizeEventDate(t, "MONTH")).toEqual(d("2024-05-01"));
    expect(normalizeEventDate(t, "YEAR")).toEqual(d("2024-01-01"));
  });
  it("vérifie la cohérence avec la précision", () => {
    expect(isDateConsistent(d("2024-05-13"), "DAY")).toBe(true);
    expect(isDateConsistent(new Date("2024-05-13T10:00:00Z"), "DAY")).toBe(false);
    expect(isDateConsistent(d("2024-05-01"), "MONTH")).toBe(true);
    expect(isDateConsistent(d("2024-05-13"), "MONTH")).toBe(false);
    expect(isDateConsistent(d("2024-01-01"), "YEAR")).toBe(true);
    expect(isDateConsistent(d("2024-05-01"), "YEAR")).toBe(false);
  });
});
