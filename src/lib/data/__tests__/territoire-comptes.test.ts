import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: h.queryRaw } }));

import { getComptesTerritoire, groupComptes } from "@/lib/data/territoire-comptes";
import { COMPTES_PAGE_LIMIT, type RepereRow } from "@/lib/data/territoire-reperes";

const SOURCE = {
  producer: "Observatoire des finances et de la gestion publique locales (OFGL)",
  resourceUrl: "https://data.ofgl.fr/explore/dataset/ofgl-base-communes-consolidee/",
  licenceName: "Licence Ouverte 2.0",
  licenceUrl: "https://example.test/lo",
  attribution: "« Calcul OFGL, source DGFiP »",
  methodSlug: null,
};

// Brest, 2024 values of the OFGL (fixtures of the plan).
const raw = (
  key: string,
  year: number,
  value: number | null,
  over: Record<string, unknown> = {}
) => ({
  indicatorKey: key,
  periodStart: new Date(`${year}-01-01`),
  periodEnd: new Date(`${year}-12-31`),
  scopeKind: "COLLECTIVITE",
  scopeId: "212900195",
  scopeLabel: null,
  value,
  unit: key.endsWith("par_habitant") ? "€/hab" : "€",
  sampleSize: null,
  state: value === null ? "NON_ETABLI" : "ETABLI",
  reason: null,
  ...SOURCE,
  importedAt: new Date("2026-11-22T08:00:00Z"),
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("lecteur des comptes de la collectivité", () => {
  it("lit les seules clés des comptes d'un territoire, en une requête bornée", async () => {
    h.queryRaw.mockResolvedValueOnce([
      raw("comptes_depenses_fonctionnement_montant", 2024, 132888085.6),
      raw("comptes_depenses_fonctionnement_par_habitant", 2024, 934.29),
    ]);
    const c = await getComptesTerritoire("COM", "29019");

    expect(h.queryRaw).toHaveBeenCalledTimes(1);
    const sql = h.queryRaw.mock.calls[0]?.[0] as { sql: string; values: unknown[] };
    expect(sql.sql).toContain(`AND starts_with(r."indicatorKey",`);
    expect(sql.sql).not.toContain("NOT starts_with");
    expect(sql.sql).toContain(`i."status" = 'PUBLISHED'`);
    expect(sql.values).toEqual(["COM", "29019", "comptes_", COMPTES_PAGE_LIMIT]);
    // Five aggregates, two measures, 2018 to 2024.
    expect(COMPTES_PAGE_LIMIT).toBe(70);

    expect(c.dernierExercice).toBe(2024);
    expect(c.agregats[0]?.serie[0]).toMatchObject({
      exercice: 2024,
      parHabitant: { value: 934.29, state: "ETABLI" },
      montant: { value: 132888085.6, state: "ETABLI" },
    });
    expect(c.source?.attribution).toMatch(/Calcul OFGL/);
  });

  it("garde l'ordre des cinq agrégats et met l'exercice le plus récent en premier", () => {
    const c = groupComptes(
      [
        raw("comptes_epargne_brute_montant", 2018, -5),
        raw("comptes_epargne_brute_montant", 2024, 16677933.51),
        raw("comptes_frais_personnel_montant", 2023, 1),
      ].map(asRow)
    );
    expect(c.agregats.map((a) => a.key)).toEqual([
      "depenses_fonctionnement",
      "frais_personnel",
      "depenses_equipement",
      "encours_dette",
      "epargne_brute",
    ]);
    expect(c.agregats[4]?.serie.map((e) => e.exercice)).toEqual([2024, 2018]);
    // A negative savings stays a figure with its sign.
    expect(c.agregats[4]?.serie[1]?.montant.value).toBe(-5);
  });

  it("dit non établi la mesure absente d'un exercice, jamais zéro", () => {
    const c = groupComptes([raw("comptes_encours_dette_montant", 2024, 19298274.94)].map(asRow));
    expect(c.agregats[3]?.serie[0]?.parHabitant).toEqual({
      value: null,
      state: "NON_ETABLI",
      reason: null,
      scopeLabel: null,
    });
  });

  it("garde le motif et le nom de la collectivité qui porte les comptes", () => {
    const c = groupComptes(
      [
        raw("comptes_encours_dette_montant", 2024, 1, {
          scopeLabel: "Collectivité européenne d'Alsace",
        }),
        raw("comptes_frais_personnel_montant", 2024, null, { reason: "COMMUNE_FORMEE_APRES" }),
      ].map(asRow)
    );
    expect(c.agregats[3]?.serie[0]?.montant.scopeLabel).toBe("Collectivité européenne d'Alsace");
    expect(c.agregats[1]?.serie[0]?.montant).toMatchObject({
      value: null,
      reason: "COMMUNE_FORMEE_APRES",
    });
  });

  it("ne rend rien, sans source, tant que rien n'est publié", async () => {
    h.queryRaw.mockResolvedValueOnce([]);
    const c = await getComptesTerritoire("REG", "53");
    expect(c.dernierExercice).toBeNull();
    expect(c.source).toBeNull();
    for (const a of c.agregats) expect(a.serie).toEqual([]);
  });

  it("ignore une clé hors de la famille des comptes", () => {
    const c = groupComptes([raw("population_municipale", 2023, 6412)].map(asRow));
    expect(c.dernierExercice).toBeNull();
  });
});

/** The reader's row shape, as getTerritoireComptesRows returns it. */
function asRow(r: ReturnType<typeof raw>): RepereRow {
  return {
    indicatorKey: r.indicatorKey,
    periodStart: r.periodStart.toISOString().slice(0, 10),
    periodEnd: r.periodEnd.toISOString().slice(0, 10),
    scopeKind: "COMMUNE",
    scopeId: r.scopeId,
    scopeLabel: r.scopeLabel as string | null,
    value: r.value,
    unit: r.unit,
    sampleSize: null,
    state: r.state as RepereRow["state"],
    reason: r.reason as string | null,
    source: { ...SOURCE, importedAt: r.importedAt.toISOString() },
  };
}
