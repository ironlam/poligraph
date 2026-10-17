/**
 * Validation of the official archives against a baseline (lot 5, phase 5A-2).
 *
 * The pure parsers and the classification live in `src/lib/parlement/historical-groups/`. This file
 * only walks the archives, hands each file to them, and compares the aggregates to a baseline.
 * Aggregates only: no name, no identifier of a person, no path of the machine it ran on.
 */
import {
  classifyGroupOrgans,
  parseActeur,
  parseOrgane,
  type ActorParse,
  type OrganParse,
} from "@/lib/parlement/historical-groups/parse-amo30";
import { parseScrutin } from "@/lib/parlement/historical-groups/parse-scrutin";
import {
  addScrutinParse,
  amo30InvariantViolations,
  blockingViolations,
  createScrutinsAccumulator,
  finalizeScrutins,
  scrutinsInvariantViolations,
  summarizeAmo30,
  type Amo30Aggregate,
  type Examples,
  type ScrutinsAggregate,
} from "@/lib/parlement/historical-groups/official-validation";
import { ArchiveIntegrityError, type OpenedArchive } from "./historical-groups-archive";

export const PARSER_VERSION = "5A-2.1";
export const BASELINE_SCHEMA_VERSION = 1;

export interface ArchiveMeta {
  sha256: string;
  sizeBytes: number;
  entryCount: number;
  entriesByFolder: Record<string, number>;
  /** HTTP `Last-Modified` of the file on the server. Not readable from the archive: set by hand. */
  serverLastModified: string | null;
}

export interface Baseline {
  schemaVersion: typeof BASELINE_SCHEMA_VERSION;
  parserVersion: string;
  amo30: { archive: ArchiveMeta; aggregate: Amo30Aggregate };
  scrutins: { archive: ArchiveMeta; amo30Sha256: string; aggregate: ScrutinsAggregate }[];
}

const AMO30_FOLDERS = new Set(["json/acteur", "json/organe", "json/deport"]);
const SCRUTIN_FOLDERS = new Set(["json"]);

const metaOf = (archive: OpenedArchive): ArchiveMeta => ({
  sha256: archive.sha256,
  sizeBytes: archive.sizeBytes,
  entryCount: archive.entryCount,
  entriesByFolder: archive.entriesByFolder,
  serverLastModified: null,
});

export function isAmo30Archive(archive: OpenedArchive): boolean {
  return "json/organe" in archive.entriesByFolder;
}

function requireFolders(archive: OpenedArchive, allowed: ReadonlySet<string>, label: string): void {
  for (const folder of Object.keys(archive.entriesByFolder)) {
    if (!allowed.has(folder)) {
      throw new ArchiveIntegrityError(
        "ENTRY_NAME_REFUSED",
        `${label}: unexpected folder ${JSON.stringify(folder)}`
      );
    }
  }
}

/** `null` for a file that is not JSON: the parsers reject it as a missing root, and it is counted. */
function jsonOrNull(data: Buffer): unknown {
  try {
    return JSON.parse(data.toString("utf8"));
  } catch {
    return null;
  }
}

export interface Analysis {
  baseline: Baseline;
  invariantViolations: string[];
  blocking: Record<string, number>;
  informative: Record<string, number>;
  /** Identifiers of records, a few per category. Never written to a baseline. */
  examples: Record<string, string[]>;
}

const examplesToRecord = (examples: Examples): Record<string, string[]> =>
  Object.fromEntries([...examples.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));

export function analyzeArchives(
  amo30: OpenedArchive,
  scrutinArchives: readonly OpenedArchive[]
): Analysis {
  requireFolders(amo30, AMO30_FOLDERS, "AMO30");
  const organParses: OrganParse[] = [];
  const actorParses: ActorParse[] = [];
  for (const entry of amo30.entries()) {
    if (entry.name.startsWith("json/organe/"))
      organParses.push(parseOrgane(jsonOrNull(entry.data)));
    else if (entry.name.startsWith("json/acteur/"))
      actorParses.push(parseActeur(jsonOrNull(entry.data)));
  }
  const model = summarizeAmo30(organParses, actorParses);

  const examples: Examples = new Map();
  const scrutins: Baseline["scrutins"] = [];
  for (const archive of scrutinArchives) {
    requireFolders(archive, SCRUTIN_FOLDERS, "scrutins");
    const acc = createScrutinsAccumulator();
    for (const entry of archive.entries()) {
      addScrutinParse(acc, parseScrutin(jsonOrNull(entry.data)), model.reference);
    }
    for (const [key, ids] of acc.examples)
      examples.set(`${archive.sha256.slice(0, 8)}:${key}`, ids);
    const aggregate = finalizeScrutins(acc);
    scrutins.push({ archive: metaOf(archive), amo30Sha256: amo30.sha256, aggregate });
  }

  const violations = [
    ...amo30InvariantViolations(model.aggregate),
    ...scrutins.flatMap((s) =>
      scrutinsInvariantViolations(s.aggregate).map((v) => `${s.archive.sha256.slice(0, 8)}: ${v}`)
    ),
  ];
  const { blocking, informative } = blockingViolations(
    model.aggregate,
    scrutins.map((s) => s.aggregate)
  );
  return {
    baseline: {
      schemaVersion: BASELINE_SCHEMA_VERSION,
      parserVersion: PARSER_VERSION,
      amo30: { archive: metaOf(amo30), aggregate: model.aggregate },
      scrutins,
    },
    invariantViolations: violations,
    blocking,
    informative,
    examples: examplesToRecord(examples),
  };
}

// ---------------------------------------------------------------------------
// Comparison with a baseline
// ---------------------------------------------------------------------------

export interface Difference {
  path: string;
  baseline: unknown;
  current: unknown;
}

function flatten(value: unknown, prefix: string, out: Map<string, unknown>): void {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) out.set(prefix, "{}");
    for (const [key, child] of entries)
      flatten(child, prefix === "" ? key : `${prefix}.${key}`, out);
  } else {
    out.set(prefix, Array.isArray(value) ? JSON.stringify(value) : value);
  }
}

/** Every path whose value differs, or that exists on one side only. Sorted by path. */
export function differences(baseline: unknown, current: unknown): Difference[] {
  const a = new Map<string, unknown>();
  const b = new Map<string, unknown>();
  flatten(baseline, "", a);
  flatten(current, "", b);
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort();
  return paths
    .filter((path) => a.get(path) !== b.get(path))
    .map((path) => ({ path, baseline: a.get(path), current: b.get(path) }));
}

export type ComparisonStatus =
  /** Same bytes, same reference, same figures. */
  | "STRICT_MATCH"
  /** Same bytes, same reference, different figures: the parser or the baseline is wrong. A failure. */
  | "STRICT_MISMATCH"
  /** The archive or the referential it is read against has other bytes. Reported, never a failure. */
  | "CHANGED_INPUT"
  | "NO_BASELINE";

export interface ComparisonItem {
  subject: string;
  status: ComparisonStatus;
  sha256: string;
  baselineSha256: string | null;
  differenceCount: number;
  /** At most `MAX_LISTED_DIFFERENCES`, sorted by path. */
  differences: Difference[];
}

const MAX_LISTED_DIFFERENCES = 200;

function item(
  subject: string,
  status: ComparisonStatus,
  sha: string,
  baselineSha: string | null,
  diffs: Difference[]
): ComparisonItem {
  return {
    subject,
    status,
    sha256: sha,
    baselineSha256: baselineSha,
    differenceCount: diffs.length,
    differences: diffs.slice(0, MAX_LISTED_DIFFERENCES),
  };
}

export function compareToBaseline(current: Baseline, reference: Baseline): ComparisonItem[] {
  const items: ComparisonItem[] = [];
  const amo = current.amo30;
  const amoSame = amo.archive.sha256 === reference.amo30.archive.sha256;
  const amoDiffs = differences(reference.amo30.aggregate, amo.aggregate);
  items.push(
    item(
      "amo30",
      amoSame ? (amoDiffs.length === 0 ? "STRICT_MATCH" : "STRICT_MISMATCH") : "CHANGED_INPUT",
      amo.archive.sha256,
      reference.amo30.archive.sha256,
      amoDiffs
    )
  );

  const legislatures = (aggregate: ScrutinsAggregate) =>
    Object.keys(aggregate.byLegislature).sort().join(",");
  for (const entry of current.scrutins) {
    const subject = `scrutins:L${legislatures(entry.aggregate)}`;
    const bySha = reference.scrutins.find((r) => r.archive.sha256 === entry.archive.sha256);
    const byLegislature = reference.scrutins.find(
      (r) => legislatures(r.aggregate) === legislatures(entry.aggregate)
    );
    const found = bySha ?? byLegislature;
    if (!found) {
      items.push(item(subject, "NO_BASELINE", entry.archive.sha256, null, []));
      continue;
    }
    const diffs = differences(found.aggregate, entry.aggregate);
    const strict = bySha !== undefined && found.amo30Sha256 === entry.amo30Sha256;
    items.push(
      item(
        subject,
        strict ? (diffs.length === 0 ? "STRICT_MATCH" : "STRICT_MISMATCH") : "CHANGED_INPUT",
        entry.archive.sha256,
        found.archive.sha256,
        diffs
      )
    );
  }
  return items;
}

/** What makes a run fail. A changed input alone never does. */
export function failures(analysis: Analysis, comparison: readonly ComparisonItem[]): string[] {
  const out: string[] = [];
  for (const violation of analysis.invariantViolations) out.push(`invariant: ${violation}`);
  for (const [key, value] of Object.entries(analysis.blocking)) {
    if (value > 0) out.push(`blocking: ${key} = ${value}`);
  }
  for (const entry of comparison) {
    if (entry.status === "STRICT_MISMATCH")
      out.push(
        `baseline: ${entry.subject} differs on identical input (${entry.differenceCount} figures)`
      );
  }
  return out;
}
