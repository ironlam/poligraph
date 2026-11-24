import { createHash } from "node:crypto";
import type { ParrainageRow, ParrainagesParseResult } from "./parrainages-parse";
import {
  normalizeTerritoryName,
  resolveParrainageTerritory,
  summarizeTerritoryResolutions,
  type TerritoryIndex,
  type TerritoryReport,
} from "./parrainages-territoires";

/**
 * What an import of the presentations would write, computed without touching the database. The
 * importer shows this plan as its preview and writes it only when `blockers` is empty.
 */

export interface ParrainageCreate {
  electionId: string;
  candidateName: string;
  candidacyId: string | null;
  civility: string;
  lastName: string;
  firstName: string;
  mandateLabel: string;
  constituencyLabel: string;
  departmentLabel: string;
  communeCode: string | null;
  departmentCode: string | null;
  publishedOn: Date;
  sourceUrl: string;
  dedupeKey: string;
}

export type CandidateTotals = [candidateName: string, count: number][];

export interface ParrainagesPlan {
  creates: ParrainageCreate[];
  /** Rows of the file already in base: their published columns are left untouched. */
  alreadyStored: number;
  /**
   * Stored rows without a commune code that the reference tables now resolve (a merger added to
   * the official list, a commune added to ours). A code already set is never replaced.
   */
  communeBackfills: { dedupeKey: string; communeCode: string }[];
  /** Reasons that forbid any write. Empty when the plan can be applied. */
  blockers: string[];
  /** Presentations per candidate in the file, by count then by name. */
  fileTotals: CandidateTotals;
  /** Candidacy found in base for each published candidate, null when there is none. */
  candidacyLinks: { candidateName: string; candidacyName: string | null }[];
  territories: TerritoryReport;
  /** Rows per publication date (ISO), in order. */
  publications: [publishedOn: string, count: number][];
}

/** Stable across imports: the election and the eight published columns, nothing resolved. */
export function buildParrainageDedupeKey(electionSlug: string, row: ParrainageRow): string {
  const parts = [
    electionSlug,
    row.civility,
    row.lastName,
    row.firstName,
    row.mandateLabel,
    row.constituencyLabel,
    row.departmentLabel,
    row.candidateName,
    row.publishedOn,
  ];
  return createHash("sha256").update(parts.join("\u001f")).digest("hex");
}

export function countByCandidate(rows: readonly { candidateName: string }[]): CandidateTotals {
  const counts = new Map<string, number>();
  for (const { candidateName } of rows) {
    counts.set(candidateName, (counts.get(candidateName) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"));
}

/** Candidates whose count differs between the file and the base, either way. */
export function diffCandidateTotals(expected: CandidateTotals, actual: CandidateTotals): string[] {
  const got = new Map(actual);
  const names = new Set([...expected.map(([name]) => name), ...got.keys()]);
  const want = new Map(expected);
  return [...names]
    .filter((name) => (want.get(name) ?? 0) !== (got.get(name) ?? 0))
    .sort((a, b) => a.localeCompare(b, "fr"))
    .map(
      (name) => `${name} : ${want.get(name) ?? 0} dans le fichier, ${got.get(name) ?? 0} en base`
    );
}

/** "LE PEN Marine" and "Marine Le Pen" share one key: the same words, whatever their order. */
function personKey(name: string): string {
  return normalizeTerritoryName(name).split(" ").sort().join(" ");
}

/** Exact match on the words of the name. Two candidacies under one name link to neither. */
export function matchCandidacy<T extends { candidateName: string }>(
  publishedName: string,
  candidacies: readonly T[]
): T | null {
  const key = personKey(publishedName);
  const matches = candidacies.filter((candidacy) => personKey(candidacy.candidateName) === key);
  return matches.length === 1 ? matches[0]! : null;
}

export function planParrainages(input: {
  election: { id: string; slug: string };
  sourceUrl: string;
  parsed: ParrainagesParseResult;
  index: TerritoryIndex;
  candidacies: readonly { id: string; candidateName: string }[];
  stored: readonly { dedupeKey: string; candidateName: string; communeCode?: string | null }[];
}): ParrainagesPlan {
  const { election, sourceUrl, parsed, index, candidacies, stored } = input;
  const blockers: string[] = [];
  if (!parsed.rows.length) blockers.push("Le fichier ne contient aucune présentation.");
  if (parsed.rejected.length) {
    const lines = parsed.rejected.slice(0, 5).map((r) => `ligne ${r.line} (${r.reason})`);
    blockers.push(`${parsed.rejected.length} ligne(s) rejetée(s) : ${lines.join(", ")}`);
  }
  if (parsed.unknownMandateLabels.length) {
    blockers.push(`Libellé(s) de mandat inconnu(s) : ${parsed.unknownMandateLabels.join(" | ")}`);
  }

  const fileTotals = countByCandidate(parsed.rows);
  const candidacyByName = new Map(
    fileTotals.map(([name]) => [name, matchCandidacy(name, candidacies)])
  );
  const storedByKey = new Map(stored.map((row) => [row.dedupeKey, row]));
  const communeBackfills: ParrainagesPlan["communeBackfills"] = [];
  const fileKeys = new Set<string>();
  const creates: ParrainageCreate[] = [];
  const resolutions = parsed.rows.map((row) => resolveParrainageTerritory(row, index));
  const publications = new Map<string, number>();

  parsed.rows.forEach((row, i) => {
    publications.set(row.publishedOn, (publications.get(row.publishedOn) ?? 0) + 1);
    const dedupeKey = buildParrainageDedupeKey(election.slug, row);
    if (fileKeys.has(dedupeKey)) {
      blockers.push(`Ligne ${row.line} : présentation publiée deux fois à l'identique.`);
      return;
    }
    fileKeys.add(dedupeKey);
    const existing = storedByKey.get(dedupeKey);
    if (existing) {
      const communeCode = resolutions[i]!.communeCode;
      if (existing.communeCode === null && communeCode) {
        communeBackfills.push({ dedupeKey, communeCode });
      }
      return;
    }
    creates.push({
      electionId: election.id,
      candidateName: row.candidateName,
      candidacyId: candidacyByName.get(row.candidateName)?.id ?? null,
      civility: row.civility,
      lastName: row.lastName,
      firstName: row.firstName,
      mandateLabel: row.mandateLabel,
      constituencyLabel: row.constituencyLabel,
      departmentLabel: row.departmentLabel,
      communeCode: resolutions[i]!.communeCode,
      departmentCode: resolutions[i]!.departmentCode,
      publishedOn: new Date(`${row.publishedOn}T00:00:00Z`),
      sourceUrl,
      dedupeKey,
    });
  });

  // A stored row is never updated nor deleted: if the file no longer carries it, the totals can
  // no longer agree and a human has to look.
  const projected = countByCandidate([...stored, ...creates]);
  const gaps = diffCandidateTotals(fileTotals, projected);
  if (gaps.length) {
    blockers.push(`Totaux par candidat différents du fichier : ${gaps.slice(0, 5).join(" ; ")}`);
  }

  return {
    creates,
    alreadyStored: fileKeys.size - creates.length,
    communeBackfills,
    blockers,
    fileTotals,
    candidacyLinks: fileTotals.map(([candidateName]) => ({
      candidateName,
      candidacyName: candidacyByName.get(candidateName)?.candidateName ?? null,
    })),
    territories: summarizeTerritoryResolutions(resolutions),
    publications: [...publications].sort((a, b) => a[0].localeCompare(b[0])),
  };
}
