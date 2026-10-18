import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: h.queryRaw } }));

import {
  getTerritoireReperes,
  readIndicator,
  REPERES_PAGE_LIMIT,
} from "@/lib/data/territoire-reperes";

const raw = (over: Record<string, unknown> = {}) => ({
  indicatorKey: "population_municipale",
  periodStart: new Date("2023-01-01"),
  periodEnd: new Date("2023-12-31"),
  scopeKind: "COMMUNE",
  scopeId: "",
  scopeLabel: null,
  value: 6412,
  unit: "habitants",
  sampleSize: null,
  state: "ETABLI",
  reason: null,
  producer: "INSEE",
  resourceUrl: "https://example.test/pop",
  licenceName: "Licence Ouverte 2.0",
  licenceUrl: "https://example.test/lo",
  attribution: "Source : INSEE",
  methodSlug: "population",
  importedAt: new Date("2026-10-13T08:00:00Z"),
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("lecteur du territoire en chiffres", () => {
  it("lit une page en une seule requête, bornée, sur un seul territoire", async () => {
    h.queryRaw.mockResolvedValueOnce([raw(), raw({ indicatorKey: "age_tranche_0_14" })]);
    const rows = await getTerritoireReperes("COM", "35238");

    expect(h.queryRaw).toHaveBeenCalledTimes(1);
    const sql = h.queryRaw.mock.calls[0]?.[0] as { sql: string; values: unknown[] };
    expect(sql.sql).toContain(`i."status" = 'PUBLISHED'`);
    expect(sql.values).toEqual(["COM", "35238", REPERES_PAGE_LIMIT]);
    expect(REPERES_PAGE_LIMIT).toBe(200);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.periodEnd).toBe("2023-12-31");
  });

  it("ne rend aucune ligne, jamais un zéro, quand rien n'est publié", async () => {
    h.queryRaw.mockResolvedValueOnce([]);
    const rows = await getTerritoireReperes("COM", "35238");
    expect(rows).toEqual([]);
    const reading = readIndicator(rows, "population_municipale", "COM");
    expect(reading).toMatchObject({ state: "NON_ETABLI", latest: null, rows: [] });
  });

  it("annule la valeur d'une ligne dont l'état n'en établit pas", async () => {
    h.queryRaw.mockResolvedValueOnce([
      raw({ state: "SECRET_STATISTIQUE", value: 0 }),
      raw({ indicatorKey: "x", state: "NON_ETABLI", value: 0 }),
      raw({ indicatorKey: "y", state: "PARTIEL", value: 12 }),
    ]);
    const rows = await getTerritoireReperes("DEP", "35");
    expect(rows[0]?.value).toBeNull();
    expect(rows[1]?.value).toBeNull();
    expect(rows[2]?.value).toBe(12);
  });

  it("dit non applicable un indicateur absent de cette échelle, pas non établi", () => {
    expect(readIndicator([], "climat_temp_moyenne", "REG")).toBe("NON_APPLICABLE");
    expect(readIndicator([], "climat_temp_moyenne", "COM")).toMatchObject({ state: "NON_ETABLI" });
  });

  it("tolère l'absence des tables tant que le SQL manuel n'est pas appliqué", async () => {
    h.queryRaw.mockRejectedValueOnce({
      meta: { driverAdapterError: { cause: { kind: "TableDoesNotExist" } } },
    });
    await expect(getTerritoireReperes("COM", "35238")).resolves.toEqual([]);
  });

  it("laisse remonter toute autre erreur", async () => {
    h.queryRaw.mockRejectedValueOnce(new Error("connexion perdue"));
    await expect(getTerritoireReperes("COM", "35238")).rejects.toThrow("connexion perdue");
  });
});

describe("garde-fous du schéma et du lecteur", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const modelBody = (name: string) => {
    const start = schema.indexOf(`model ${name} {`);
    expect(start).toBeGreaterThan(-1);
    return schema.slice(start, schema.indexOf("\n}", start));
  };

  it.each(["TerritoireRepere", "RepereImport", "RepereSource"])(
    "%s ne porte ni transaction, ni parcelle, ni adresse, ni score",
    (name) => {
      const columns = modelBody(name)
        .split("\n")
        .filter((l) => !l.trim().startsWith("///"))
        .join("\n");
      expect(columns).not.toMatch(/adresse|address|parcelle|parcel|transaction|score|rang|rank/i);
    }
  );

  it("ne porte aucune donnée d'élu ni de parti dans le schéma des repères", () => {
    for (const name of ["TerritoireRepere", "RepereImport", "RepereSource"]) {
      expect(modelBody(name)).not.toMatch(/politician|mandate|party|maire/i);
    }
  });

  it("n'invalide aucun tag : la publication d'un lot suit le profil de 24 h", () => {
    for (const file of ["src/lib/data/territoire-reperes.ts", "src/config/territoire-reperes.ts"]) {
      const code = readFileSync(join(process.cwd(), file), "utf8")
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join("\n");
      expect(code).not.toMatch(/revalidateTag|updateTag|revalidatePath/);
    }
  });

  it("ne lit aucune donnée d'élu ni de parti", () => {
    const code = readFileSync(join(process.cwd(), "src/lib/data/territoire-reperes.ts"), "utf8")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    expect(code).not.toMatch(/politician|mandate|"Party"|maire/i);
  });
});
