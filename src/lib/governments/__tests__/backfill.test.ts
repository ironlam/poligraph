import { describe, expect, it } from "vitest";
import { planBackfill, type BackfillRow } from "../backfill";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

let n = 0;
function row(over: Partial<BackfillRow> & { governmentName: string }): BackfillRow {
  n += 1;
  return {
    membershipId: `m${n}`,
    mandateId: `ma${n}`,
    politicianId: `p${n}`,
    type: "MINISTRE",
    startDate: d("2020-07-06"),
    endDate: null,
    ...over,
  };
}

describe("planBackfill", () => {
  it("dérive les dates du minimum des débuts et du maximum des fins", () => {
    const rows = [
      row({
        governmentName: "Gouvernement Jean Castex",
        type: "PREMIER_MINISTRE",
        politicianId: "pm",
        startDate: d("2020-07-03"),
        endDate: d("2022-05-16"),
      }),
      row({
        governmentName: "Gouvernement Jean Castex",
        startDate: d("2020-07-06"),
        endDate: d("2022-05-16"),
      }),
      row({
        governmentName: "Gouvernement Jean Castex",
        startDate: d("2020-07-06"),
        endDate: d("2021-01-01"),
      }),
    ];
    const plan = planBackfill(rows);
    expect(plan.governments).toHaveLength(1);
    const g = plan.governments[0]!;
    expect(g.slug).toBe("castex");
    expect(g.primeMinisterId).toBe("pm");
    expect(g.primeMinisterAppointedAt).toBe("2020-07-03");
    expect(g.formedAt).toBe("2020-07-03");
    expect(g.endedAt).toBe("2022-05-16");
    expect(g.membershipIds).toHaveLength(3);
    expect(g.report.functions).toBe(3);
    expect(g.report.persons).toBe(3);
  });

  it("laisse endedAt à null quand une fonction n'a pas de fin", () => {
    const plan = planBackfill([
      row({ governmentName: "Gouvernement Jean Castex", type: "PREMIER_MINISTRE" }),
      row({ governmentName: "Gouvernement Jean Castex", endDate: d("2021-01-01") }),
    ]);
    expect(plan.governments[0]!.endedAt).toBeNull();
    expect(plan.governments[0]!.report.withoutEnd).toBe(1);
  });

  it("fusionne les deux libellés de Valls dans valls-1", () => {
    const plan = planBackfill([
      row({
        governmentName: "Gouvernement Manuel Valls",
        type: "PREMIER_MINISTRE",
        startDate: d("2014-03-31"),
      }),
      row({ governmentName: "Gouvernement Manuel Valls n°1", startDate: d("2014-04-02") }),
    ]);
    expect(plan.governments.map((g) => g.slug)).toEqual(["valls-1"]);
    expect(plan.governments[0]!.membershipIds).toHaveLength(2);
  });

  it("range un libellé inconnu et un gouvernement sans Premier ministre dans unresolved", () => {
    const plan = planBackfill([
      row({ governmentName: "Gouvernement Inconnu" }),
      row({ governmentName: "Gouvernement Jean Castex" }),
    ]);
    expect(plan.governments).toHaveLength(0);
    const kinds = plan.unresolved
      .map((u) => u.kind)
      .filter((k) => k !== "no-function" && k !== "lecornu-prime-minister-not-found")
      .sort();
    expect(kinds).toEqual(["no-prime-minister", "unknown-label"]);
  });

  it("ne rattache pas Lecornu mais crée lecornu-1 et lecornu-2 depuis les mandats de Premier ministre", () => {
    const plan = planBackfill([
      row({
        governmentName: "Gouvernement Sébastien Lecornu",
        type: "PREMIER_MINISTRE",
        politicianId: "lec",
        startDate: d("2025-09-09"),
        endDate: d("2025-10-09"),
      }),
      row({
        governmentName: "Gouvernement Sébastien Lecornu",
        type: "PREMIER_MINISTRE",
        politicianId: "lec",
        startDate: d("2025-10-10"),
        endDate: null,
      }),
      row({ governmentName: "Gouvernement Sébastien Lecornu", startDate: d("2025-10-12") }),
    ]);
    const l1 = plan.governments.find((g) => g.slug === "lecornu-1")!;
    const l2 = plan.governments.find((g) => g.slug === "lecornu-2")!;
    expect(l1.primeMinisterId).toBe("lec");
    expect(l1.formedAt).toBe("2025-09-09");
    expect(l1.endedAt).toBe("2025-10-09");
    expect(l2.formedAt).toBe("2025-10-10");
    expect(l2.endedAt).toBeNull();
    expect(l1.membershipIds).toEqual([]);
    expect(l2.membershipIds).toEqual([]);
    const split = plan.unresolved.find((u) => u.kind === "split-manual")!;
    expect(split.membershipIds).toHaveLength(3);
  });

  it("est déterministe quel que soit l'ordre des lignes", () => {
    const rows = [
      row({ governmentName: "Gouvernement Jean Castex", type: "PREMIER_MINISTRE" }),
      row({ governmentName: "Gouvernement Gabriel Attal", type: "PREMIER_MINISTRE" }),
      row({ governmentName: "Gouvernement Gabriel Attal" }),
    ];
    expect(planBackfill(rows)).toEqual(planBackfill([...rows].reverse()));
  });
});
