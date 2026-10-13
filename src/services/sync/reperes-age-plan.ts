/**
 * Pure rules of the age-structure import (#1052, "Le territoire en chiffres", lot R2). No network,
 * no database: the reader of the INSEE file and the checks that decide what may be written.
 *
 * File: INSEE "Évolution et structure de la population en 2022", communal base, communal
 * boundaries of 1 January 2025, Mayotte excluded (src/config/territoires-sources.ts).
 */

export const AGE_FILE = {
  pageUrl: "https://www.insee.fr/fr/statistiques/8581696",
  zipUrl:
    "https://www.insee.fr/fr/statistiques/fichier/8581696/base-cc-evol-struct-pop-2022_csv.zip",
  zipEntry: "base-cc-evol-struct-pop-2022.CSV",
  periodStart: "2022-01-01",
  periodEnd: "2022-12-31",
  cogEdition: "2025",
  totalColumn: "P22_POP",
} as const;

/** The six bands of the block. 75 and over is the sum of two source columns. */
export const AGE_COLUMNS: readonly { key: string; columns: readonly string[] }[] = [
  { key: "age_tranche_0_14", columns: ["P22_POP0014"] },
  { key: "age_tranche_15_29", columns: ["P22_POP1529"] },
  { key: "age_tranche_30_44", columns: ["P22_POP3044"] },
  { key: "age_tranche_45_59", columns: ["P22_POP4559"] },
  { key: "age_tranche_60_74", columns: ["P22_POP6074"] },
  { key: "age_tranche_75_plus", columns: ["P22_POP7589", "P22_POP90P"] },
];

/** Tolerance on the sum of the six shares, in points (kit R2). */
export const AGE_SUM_TOLERANCE = 0.1;

export interface AgeRow {
  territoryCode: string;
  indicatorKey: string;
  /** Share of the population, in percent, 2 decimals. Null when not established. */
  value: number | null;
  state: "ETABLI" | "NON_ETABLI";
  reason: "EFFECTIF_ABSENT_SOURCE" | "POPULATION_NULLE" | null;
}

export interface AgeParseReport {
  rows: AgeRow[];
  communes: number;
  /** Communes of the file that Poligraph does not hold. */
  unknownCommunes: number;
  /** Communes with no figure published, or with no inhabitant: six NON_ETABLI rows each. */
  nonEtabli: { effectifAbsent: string[]; populationNulle: string[] };
  /** Communes whose six shares do not total 100 within the tolerance: not written at all. */
  sumErrors: { code: string; sum: number }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function numberOrNull(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function parseAgeStructure(csv: string, knownCommunes: ReadonlySet<string>): AgeParseReport {
  const lines = csv.split(/\r?\n/);
  const header = (lines[0] ?? "").replace(/^﻿/, "").split(";");
  const idx = new Map(header.map((h, i) => [h.trim(), i]));
  const required = ["CODGEO", AGE_FILE.totalColumn, ...AGE_COLUMNS.flatMap((c) => c.columns)];
  for (const c of required) {
    if (!idx.has(c)) throw new Error(`Colonne absente du fichier INSEE : ${c}`);
  }
  const col = (cells: string[], name: string) => cells[idx.get(name) as number];

  const report: AgeParseReport = {
    rows: [],
    communes: 0,
    unknownCommunes: 0,
    nonEtabli: { effectifAbsent: [], populationNulle: [] },
    sumErrors: [],
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cells = line.split(";");
    const code = (col(cells, "CODGEO") ?? "").trim();
    if (!code) continue;
    if (!knownCommunes.has(code)) {
      report.unknownCommunes++;
      continue;
    }
    report.communes++;

    const total = numberOrNull(col(cells, AGE_FILE.totalColumn));
    const counts = AGE_COLUMNS.map((b) => {
      const parts = b.columns.map((c) => numberOrNull(col(cells, c)));
      return parts.some((p) => p === null)
        ? null
        : parts.reduce<number>((a, p) => a + (p as number), 0);
    });

    const missing = total === null || counts.some((c) => c === null);
    if (missing || total === 0) {
      (missing ? report.nonEtabli.effectifAbsent : report.nonEtabli.populationNulle).push(code);
      for (const b of AGE_COLUMNS) {
        report.rows.push({
          territoryCode: code,
          indicatorKey: b.key,
          value: null,
          state: "NON_ETABLI",
          reason: missing ? "EFFECTIF_ABSENT_SOURCE" : "POPULATION_NULLE",
        });
      }
      continue;
    }

    const shares = (counts as number[]).map((c) => round2((c / (total as number)) * 100));
    const sum = shares.reduce((a, s) => a + s, 0);
    if (Math.abs(sum - 100) > AGE_SUM_TOLERANCE) {
      report.sumErrors.push({ code, sum: round2(sum) });
      continue;
    }
    AGE_COLUMNS.forEach((b, k) =>
      report.rows.push({
        territoryCode: code,
        indicatorKey: b.key,
        value: shares[k] as number,
        state: "ETABLI",
        reason: null,
      })
    );
  }
  return report;
}
