import { parse } from "csv-parse/sync";
import { db } from "@/lib/db";
import { HTTPClient } from "@/lib/api/http-client";
import { DATA_GOUV_RATE_LIMIT_MS } from "@/config/rate-limits";
import {
  RNE_CONSEILLERS_DEPARTEMENTAUX_FRAGMENTS,
  RNE_CONSEILLERS_MUNICIPAUX_FRAGMENTS,
  RNE_CONSEILLERS_REGIONAUX_FRAGMENTS,
  resolveRneResourceUrl,
} from "./rne-resource";
import { parseConseilRows, type ConseilMembreRow, type ConseilNiveau } from "./conseils-parse";

/**
 * Import of the RNE council files (departmental, regional, municipal) into `ConseilMembre`
 * (#1052). Each file is a full snapshot of its level. It is written territory by territory, in
 * batches of `BATCH_TERRITORIES` per short transaction, so the municipal file (500 000+ lines)
 * never holds a connection for minutes. A territory is replaced as a whole inside its batch.
 */

export type ImportedNiveau = ConseilNiveau;

const FRAGMENTS: Record<ImportedNiveau, readonly string[]> = {
  DEPARTEMENTAL: RNE_CONSEILLERS_DEPARTEMENTAUX_FRAGMENTS,
  REGIONAL: RNE_CONSEILLERS_REGIONAUX_FRAGMENTS,
  MUNICIPAL: RNE_CONSEILLERS_MUNICIPAUX_FRAGMENTS,
};

/** Territories per transaction: about 2 000 rows for communes, the whole file for the others. */
const BATCH_TERRITORIES = 150;
const INSERT_CHUNK = 1000;

/** A new snapshot smaller than this share of the stored one is refused: truncated download. */
const MIN_SHARE_OF_STORED = 0.5;

const client = new HTTPClient({ rateLimitMs: DATA_GOUV_RATE_LIMIT_MS });

export interface ConseilsReport {
  niveau: ImportedNiveau;
  dryRun: boolean;
  /** False until the manual SQL has created the table. */
  tableReady: boolean;
  sourceUrl: string;
  registerDate: string | null;
  linesRead: number;
  rows: number;
  skipped: number;
  duplicates: number;
  withFunction: number;
  territories: number;
  stored: number;
  written: boolean;
  /** Members per territory code, to eyeball against the legal sizes. */
  perTerritory: Record<string, number>;
  /** The most frequent function labels, to check how the register spells them. */
  topFunctions: [string, number][];
}

/** The resource URL carries its publication timestamp: `/20260811-154909/`. */
export function registerDateFromUrl(url: string): string | null {
  const m = url.match(/\/(\d{4})(\d{2})(\d{2})-\d{6}\//);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

async function storedCount(niveau: ImportedNiveau): Promise<number | null> {
  try {
    return await db.conseilMembre.count({ where: { niveau } });
  } catch {
    return null;
  }
}

export async function syncConseils(
  niveau: ImportedNiveau,
  options: { dryRun?: boolean } = {}
): Promise<ConseilsReport> {
  const dryRun = options.dryRun ?? false;
  const sourceUrl = await resolveRneResourceUrl(FRAGMENTS[niveau]);
  const { data: csvText } = await client.getText(sourceUrl);
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter: ";",
    bom: true,
  }) as Record<string, string>[];

  const { rows, skipped, duplicates } = parseConseilRows(niveau, records);
  const registerDate = registerDateFromUrl(sourceUrl);

  const perTerritory: Record<string, number> = {};
  for (const r of rows) perTerritory[r.territoryCode] = (perTerritory[r.territoryCode] ?? 0) + 1;

  const functionCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.functionLabel) {
      functionCounts.set(r.functionLabel, (functionCounts.get(r.functionLabel) ?? 0) + 1);
    }
  }
  const topFunctions = [...functionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  const stored = await storedCount(niveau);
  const report: ConseilsReport = {
    niveau,
    dryRun,
    tableReady: stored !== null,
    sourceUrl,
    registerDate,
    linesRead: records.length,
    rows: rows.length,
    skipped,
    duplicates,
    withFunction: rows.filter((r) => r.functionLabel).length,
    territories: Object.keys(perTerritory).length,
    stored: stored ?? 0,
    written: false,
    perTerritory,
    topFunctions,
  };

  if (dryRun) return report;
  if (stored === null) throw new Error("Table ConseilMembre absente : appliquer le SQL manuel.");
  if (rows.length === 0) throw new Error("Fichier sans ligne exploitable : écriture refusée.");
  if (stored > 0 && rows.length < stored * MIN_SHARE_OF_STORED) {
    throw new Error(
      `Fichier ${niveau} trop petit (${rows.length} lignes pour ${stored} en base) : écriture refusée.`
    );
  }

  await replaceLevel(niveau, rows, sourceUrl, registerDate);
  report.written = true;
  return report;
}

async function replaceLevel(
  niveau: ImportedNiveau,
  rows: ConseilMembreRow[],
  sourceUrl: string,
  registerDate: string | null
): Promise<void> {
  const date = registerDate ? new Date(`${registerDate}T12:00:00Z`) : null;

  const byTerritory = new Map<string, ConseilMembreRow[]>();
  for (const r of rows) {
    const list = byTerritory.get(r.territoryCode);
    if (list) list.push(r);
    else byTerritory.set(r.territoryCode, [r]);
  }
  const codes = [...byTerritory.keys()];

  for (let i = 0; i < codes.length; i += BATCH_TERRITORIES) {
    const batch = codes.slice(i, i + BATCH_TERRITORIES);
    const data = batch.flatMap((code) =>
      byTerritory.get(code)!.map((r) => ({ ...r, sourceUrl, registerDate: date }))
    );
    await db.$transaction(
      async (tx) => {
        await tx.conseilMembre.deleteMany({ where: { niveau, territoryCode: { in: batch } } });
        for (let j = 0; j < data.length; j += INSERT_CHUNK) {
          await tx.conseilMembre.createMany({ data: data.slice(j, j + INSERT_CHUNK) });
        }
      },
      { timeout: 60_000 }
    );
  }

  // Territories the file no longer lists (merged communes): their lines are stale.
  const inFile = new Set(codes);
  const stored = await db.conseilMembre.groupBy({ by: ["territoryCode"], where: { niveau } });
  const stale = stored.map((s) => s.territoryCode).filter((c) => !inFile.has(c));
  for (let i = 0; i < stale.length; i += 500) {
    await db.conseilMembre.deleteMany({
      where: { niveau, territoryCode: { in: stale.slice(i, i + 500) } },
    });
  }
}
