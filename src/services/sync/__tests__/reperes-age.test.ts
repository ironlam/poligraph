import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  communeFindMany: vi.fn(),
  repereCount: vi.fn(),
  repereCreateMany: vi.fn(),
  sourceFindFirst: vi.fn(),
  sourceCreate: vi.fn(),
  importDeleteMany: vi.fn(),
  importCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    commune: { findMany: h.communeFindMany },
    territoireRepere: { count: h.repereCount, createMany: h.repereCreateMany },
    repereSource: { findFirst: h.sourceFindFirst, create: h.sourceCreate },
    repereImport: { deleteMany: h.importDeleteMany, create: h.importCreate },
  },
}));

import { licenceOfSource, syncReperesAge } from "@/services/sync/reperes-age";
import { AGE_SUM_TOLERANCE, parseAgeStructure } from "@/services/sync/reperes-age-plan";

const HEADER =
  "CODGEO;P22_POP;P22_POP0014;P22_POP1529;P22_POP3044;P22_POP4559;P22_POP6074;P22_POP7589;P22_POP90P";
const csv = (...rows: string[]) => [HEADER, ...rows].join("\n");
const KNOWN = new Set(["35238", "15031", "55039", "01001"]);

beforeEach(() => {
  vi.clearAllMocks();
  h.communeFindMany.mockResolvedValue([{ id: "35238" }]);
  h.repereCount.mockResolvedValue(0);
  h.sourceFindFirst.mockResolvedValue(null);
  h.sourceCreate.mockResolvedValue({ id: "src1" });
  h.importDeleteMany.mockResolvedValue({ count: 0 });
  h.importCreate.mockResolvedValue({ id: "imp1" });
  h.repereCreateMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({
    count: data.length,
  }));
});

describe("lecture de la structure par âge", () => {
  it("ramène sept colonnes à six tranches dont la somme fait 100 %", () => {
    const r = parseAgeStructure(csv("35238;1000;100;200;200;200;150;100;50"), KNOWN);
    const rows = r.rows.filter((x) => x.territoryCode === "35238");
    expect(rows.map((x) => x.indicatorKey)).toEqual([
      "age_tranche_0_14",
      "age_tranche_15_29",
      "age_tranche_30_44",
      "age_tranche_45_59",
      "age_tranche_60_74",
      "age_tranche_75_plus",
    ]);
    expect(rows[5]?.value).toBe(15);
    const sum = rows.reduce((a, x) => a + (x.value as number), 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(AGE_SUM_TOLERANCE);
  });

  it("garde la somme à 0,1 près même avec des arrondis ingrats", () => {
    const r = parseAgeStructure(csv("35238;3;1;1;1;0;0;0;0"), KNOWN);
    expect(r.sumErrors).toEqual([]);
    const sum = r.rows.reduce((a, x) => a + (x.value ?? 0), 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(AGE_SUM_TOLERANCE);
  });

  it("n'écrit jamais 0 pour une commune sans effectif : six lignes non établies", () => {
    const r = parseAgeStructure(csv("15031;;;;;;;;", "55039;0;0;0;0;0;0;0;0"), KNOWN);
    expect(r.rows).toHaveLength(12);
    expect(r.rows.every((x) => x.value === null && x.state === "NON_ETABLI")).toBe(true);
    expect(r.nonEtabli.effectifAbsent).toEqual(["15031"]);
    expect(r.nonEtabli.populationNulle).toEqual(["55039"]);
  });

  it("n'écrit pas une commune dont les tranches ne totalisent pas 100 %", () => {
    const r = parseAgeStructure(csv("35238;1000;100;200;200;200;150;100;5"), KNOWN);
    expect(r.rows).toEqual([]);
    expect(r.sumErrors).toHaveLength(1);
  });

  it("ignore les communes que Poligraph ne connaît pas et les compte", () => {
    const r = parseAgeStructure(csv("99999;100;20;20;20;20;10;5;5"), KNOWN);
    expect(r.rows).toEqual([]);
    expect(r.unknownCommunes).toBe(1);
  });

  it("refuse un fichier dont une colonne attendue manque", () => {
    expect(() => parseAgeStructure("CODGEO;P22_POP\n35238;10", KNOWN)).toThrow(/Colonne absente/);
  });
});

describe("écriture du lot", () => {
  const FILE = csv("35238;1000;100;200;200;200;150;100;50");

  it("n'écrit rien en aperçu", async () => {
    const r = await syncReperesAge({ dryRun: true, csv: FILE });
    expect(r.importId).toBeNull();
    expect(h.importCreate).not.toHaveBeenCalled();
    expect(h.repereCreateMany).not.toHaveBeenCalled();
  });

  it("écrit toujours un brouillon, jamais un lot publié ou en relecture", async () => {
    const r = await syncReperesAge({ dryRun: false, csv: FILE });
    expect(h.importCreate.mock.calls[0]?.[0].data.status).toBe("DRAFT");
    expect(r.rowsWritten).toBe(6);
    expect(h.importDeleteMany.mock.calls[0]?.[0].where.status).toBe("DRAFT");
  });

  it("s'arrête si un lot relu ou publié couvre déjà la période", async () => {
    h.repereCount.mockResolvedValueOnce(12);
    await expect(syncReperesAge({ dryRun: false, csv: FILE })).rejects.toThrow(/déjà/);
    expect(h.importCreate).not.toHaveBeenCalled();
  });

  it("le code de l'importeur ne mentionne aucun statut publié", () => {
    for (const f of ["reperes-age.ts", "reperes-age-plan.ts"]) {
      const code = readFileSync(join(process.cwd(), "src/services/sync", f), "utf8")
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join("\n");
      expect(code, f).not.toMatch(/PUBLISHED|IN_REVIEW|revalidateTag/);
    }
  });
});

describe("licence", () => {
  it("lit la licence de la structure par âge au registre", () => {
    expect(licenceOfSource("insee-structure-age").licenceName).toMatch(/Licence Ouverte/);
  });

  it("bloque l'import d'une source dont la licence n'est pas établie", () => {
    expect(() => licenceOfSource("meteofrance-normales")).toThrow(/import bloqué/);
  });
});
