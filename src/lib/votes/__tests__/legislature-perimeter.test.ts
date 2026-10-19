import { describe, expect, it } from "vitest";
import { MandateType } from "@/generated/prisma";
import type { MandateInterval } from "@/lib/mandates/overlaps";
import { resolveLegislaturePerimeter, resolveLegislatureSelection } from "../legislature-perimeter";

const L16 = {
  start: new Date("2022-07-11T00:00:00.000Z"),
  end: new Date("2024-06-07T00:00:00.000Z"),
};
const L17 = {
  start: new Date("2024-10-08T00:00:00.000Z"),
  end: new Date("2026-10-16T00:00:00.000Z"),
};

function deputy(
  id: string,
  startDate: string,
  endDate: string | null,
  isCurrent = false
): MandateInterval {
  return {
    id,
    politicianId: "depute",
    type: MandateType.DEPUTE,
    startDate: new Date(startDate),
    endDate: endDate ? new Date(endDate) : null,
    isCurrent,
  };
}

describe("resolveLegislaturePerimeter", () => {
  it("borne un mandat ancien à la législature", () => {
    const result = resolveLegislaturePerimeter([deputy("m16", "2022-06-22", "2024-06-09")], L16);

    expect(result).toEqual({ issue: null, periods: [{ start: L16.start, end: L16.end }] });
  });

  it("traite un mandat en cours comme ouvert, même avec une endDate", () => {
    const result = resolveLegislaturePerimeter(
      [deputy("m17", "2024-07-01", "2025-01-01", true)],
      L17
    );

    expect(result).toEqual({ issue: null, periods: [{ start: L17.start, end: L17.end }] });
  });

  it("garde plusieurs périodes disjointes (suppléant qui revient)", () => {
    const result = resolveLegislaturePerimeter(
      [deputy("a", "2024-07-01", "2025-03-01"), deputy("b", "2025-09-01", null, true)],
      L17
    );

    expect(result.issue).toBeNull();
    expect(result.periods).toHaveLength(2);
  });

  it("refuse le périmètre quand aucun mandat de député n'est documenté", () => {
    expect(resolveLegislaturePerimeter([], L16)).toEqual({ issue: "NO_MANDATE", periods: [] });
  });

  it("ne retient pas un mandat qui commence après la législature (cas raphael-gerard, 16e)", () => {
    const result = resolveLegislaturePerimeter([deputy("late", "2026-04-17", null, true)], L16);

    expect(result.issue).toBe("NO_MANDATE");
  });

  it("refuse le périmètre quand deux mandats se chevauchent dans la législature", () => {
    const result = resolveLegislaturePerimeter(
      [deputy("a", "2022-06-22", "2024-06-09"), deputy("b", "2023-01-01", "2024-06-09")],
      L16
    );

    expect(result).toEqual({ issue: "OVERLAPPING_MANDATES", periods: [] });
  });

  it("ignore un chevauchement qui a lieu avant la législature (cas Dupont-Aignan)", () => {
    const result = resolveLegislaturePerimeter(
      [
        deputy("generique", "1997-06-01", "2022-06-19"),
        deputy("2017", "2017-06-21", "2022-06-21"),
        deputy("2022", "2022-06-22", "2024-06-09"),
      ],
      L16
    );

    expect(result).toEqual({ issue: null, periods: [{ start: L16.start, end: L16.end }] });
  });

  it("ne compte pas un mandat de sénateur comme mandat de député", () => {
    const senator: MandateInterval = {
      ...deputy("senat", "2020-10-01", null, true),
      type: MandateType.SENATEUR,
    };

    expect(resolveLegislaturePerimeter([senator], L17).issue).toBe("NO_MANDATE");
  });
});

describe("resolveLegislatureSelection", () => {
  it("renvoie la législature la plus récente sans paramètre", () => {
    expect(resolveLegislatureSelection(undefined, [16, 17])).toBe(17);
  });

  it("accepte une législature où le député a des votes", () => {
    expect(resolveLegislatureSelection("16", [16, 17])).toBe(16);
  });

  it.each(["99", "15", "abc", "17abc", "-1", "", "16.5", "1e1"])(
    "ignore la valeur %j et applique le défaut",
    (raw) => {
      expect(resolveLegislatureSelection(raw, [16, 17])).toBe(17);
    }
  );

  it("ignore un paramètre répété", () => {
    expect(resolveLegislatureSelection(["16", "17"], [16, 17])).toBe(17);
  });

  it("renvoie null quand le député n'a aucun vote à l'Assemblée", () => {
    expect(resolveLegislatureSelection("17", [])).toBeNull();
  });
});
