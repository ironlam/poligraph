import { describe, expect, it } from "vitest";
import { groupAtDate, type MandateWindow } from "../group-at-date";

const group = (id: string) => ({ id, code: id.toUpperCase(), name: `Groupe ${id}` });
const mandates: MandateWindow[] = [
  {
    type: "DEPUTE",
    startDate: new Date("2017-06-21"),
    endDate: new Date("2022-06-20"),
    group: group("lfi"),
  },
  { type: "DEPUTE", startDate: new Date("2022-06-21"), endDate: null, group: group("ecos") },
  { type: "SENATEUR", startDate: new Date("2023-10-01"), endDate: null, group: group("sen") },
];

describe("groupAtDate", () => {
  it("retient le mandat qui couvre le jour du scrutin", () => {
    expect(groupAtDate(mandates, "AN", new Date("2019-03-01"))?.id).toBe("lfi");
    expect(groupAtDate(mandates, "AN", new Date("2024-03-01"))?.id).toBe("ecos");
  });

  it("garde les bornes incluses", () => {
    expect(groupAtDate(mandates, "AN", new Date("2022-06-20"))?.id).toBe("lfi");
    expect(groupAtDate(mandates, "AN", new Date("2022-06-21"))?.id).toBe("ecos");
  });

  it("ne mélange pas les chambres", () => {
    expect(groupAtDate(mandates, "SENAT", new Date("2019-03-01"))).toBeNull();
    expect(groupAtDate(mandates, "SENAT", new Date("2024-03-01"))?.id).toBe("sen");
  });

  it("ne renvoie rien hors de tout mandat", () => {
    expect(groupAtDate(mandates, "AN", new Date("2010-01-01"))).toBeNull();
  });
});
