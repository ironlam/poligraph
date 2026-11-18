import { db } from "@/lib/db";
import { DEPARTMENTS } from "@/config/departments";
import { isMissingTableError } from "@/lib/data/commune-population";
import { downloadBuffer } from "./csv-download";
import { parseParrainagesCsv } from "./parrainages-parse";
import {
  countByCandidate,
  diffCandidateTotals,
  planParrainages,
  type ParrainagesPlan,
} from "./parrainages-plan";
import { buildTerritoryIndex } from "./parrainages-territoires";

/**
 * Import of the presidential presentations published by the Conseil constitutionnel into
 * `Parrainage`. Preview by default; with `write`, the missing rows are inserted in one
 * transaction that also re-counts the base per candidate against the file and rolls back on any
 * difference. Rows already stored are never updated nor deleted, so a second run writes nothing.
 * The list grows with each publication: importing the next file adds the new rows only.
 */

/** One official file per election, keyed by `Election.slug`. */
export const PARRAINAGES_SOURCES: Readonly<Record<string, string>> = {
  "presidentielle-2022":
    "https://static.data.gouv.fr/resources/parrainages-des-candidats-a-lelection-presidentielle-francaise-de-2022/20220307-183308/parrainagestotal.csv",
};

const INSERT_CHUNK = 1000;

export interface ParrainagesReport {
  electionSlug: string;
  sourceUrl: string;
  linesRead: number;
  /** False until prisma/migrations/manual/2026-11-18-parrainages.sql is applied. */
  tableReady: boolean;
  stored: number;
  plan: ParrainagesPlan;
  written: number;
}

export async function syncParrainages(
  electionSlug: string,
  options: { write: boolean }
): Promise<ParrainagesReport> {
  const sourceUrl = PARRAINAGES_SOURCES[electionSlug];
  if (!sourceUrl) throw new Error(`Aucune liste de parrainages connue pour ${electionSlug}`);
  const election = await db.election.findUnique({
    where: { slug: electionSlug },
    select: { id: true, slug: true },
  });
  if (!election) throw new Error(`Élection introuvable : ${electionSlug}`);

  const parsed = parseParrainagesCsv((await downloadBuffer(sourceUrl)).toString("utf8"));
  const [communes, candidacies] = await Promise.all([
    db.commune.findMany({ select: { id: true, name: true, departmentCode: true } }),
    db.candidacy.findMany({
      where: { electionId: election.id },
      select: { id: true, candidateName: true },
    }),
  ]);

  let tableReady = true;
  const stored = await db.parrainage
    .findMany({
      where: { electionId: election.id },
      select: { dedupeKey: true, candidateName: true },
    })
    .catch((error: unknown) => {
      if (!isMissingTableError(error)) throw error;
      tableReady = false;
      return [];
    });

  const plan = planParrainages({
    election,
    sourceUrl,
    parsed,
    index: buildTerritoryIndex(DEPARTMENTS, communes),
    candidacies,
    stored,
  });
  const report: ParrainagesReport = {
    electionSlug,
    sourceUrl,
    linesRead: parsed.rows.length + parsed.rejected.length,
    tableReady,
    stored: stored.length,
    plan,
    written: 0,
  };
  if (!options.write) return report;

  if (!tableReady) throw new Error("Table Parrainage absente : appliquer le SQL manuel d'abord.");
  if (plan.blockers.length) throw new Error(`Import refusé :\n- ${plan.blockers.join("\n- ")}`);

  await db.$transaction(
    async (tx) => {
      for (let i = 0; i < plan.creates.length; i += INSERT_CHUNK) {
        await tx.parrainage.createMany({ data: plan.creates.slice(i, i + INSERT_CHUNK) });
      }
      const inBase = await tx.parrainage.findMany({
        where: { electionId: election.id },
        select: { candidateName: true },
      });
      const gaps = diffCandidateTotals(plan.fileTotals, countByCandidate(inBase));
      if (gaps.length)
        throw new Error(`Totaux différents du fichier, rien écrit :\n- ${gaps.join("\n- ")}`);
    },
    { timeout: 120_000 }
  );
  report.written = plan.creates.length;
  return report;
}
