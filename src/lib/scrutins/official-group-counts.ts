/**
 * Parser for the official group-level vote totals published by the Assemblée
 * nationale.
 *
 * These counts are deliberately kept separate from the nominative vote
 * import.  A group total remains an official observation even when some
 * individual actors cannot be matched to a local politician record, and a
 * change in this section of the source must not be hidden by `votesHash`.
 */

import { createHash } from "crypto";

export type OfficialGroupMajorityPosition = "POUR" | "CONTRE" | "ABSTENTION";

export type OfficialGroupCountField =
  | "memberCount"
  | "forCount"
  | "againstCount"
  | "abstainCount"
  | "nonVoterCount"
  | "voluntaryNonVoterCount";

export interface OfficialGroupCount {
  /** Zero-based position of the block in the official ventilation. */
  sourceIndex: number;
  /** AN's stable organ identifier for the group at the time of the vote. */
  organeRef: string | null;
  memberCount: number | null;
  forCount: number | null;
  againstCount: number | null;
  abstainCount: number | null;
  nonVoterCount: number | null;
  voluntaryNonVoterCount: number | null;
  majorityPosition: OfficialGroupMajorityPosition | null;
  /** Human-readable parser diagnostics. An issue never changes a value to 0. */
  issues: string[];
}

export interface OfficialGroupCountsParseResult {
  counts: OfficialGroupCount[];
  /** Diagnostics outside individual group rows, such as missing ventilation. */
  issues: string[];
}

type UnknownRecord = Record<string, unknown>;

const COUNT_FIELDS: Array<{
  field: OfficialGroupCountField;
  source: string;
}> = [
  { field: "memberCount", source: "nombreMembresGroupe" },
  { field: "forCount", source: "pour" },
  { field: "againstCount", source: "contre" },
  { field: "abstainCount", source: "abstentions" },
  { field: "nonVoterCount", source: "nonVotants" },
  { field: "voluntaryNonVoterCount", source: "nonVotantsVolontaires" },
];

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

function asOneOrMany(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parseNonNegativeInteger(
  value: unknown,
  field: OfficialGroupCountField,
  issues: string[]
): number | null {
  if (typeof value === "number") {
    if (Number.isSafeInteger(value) && value >= 0) return value;
    issues.push(`${field}: valeur entière positive attendue`);
    return null;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (/^[0-9]+$/.test(normalized)) {
      const parsed = Number(normalized);
      if (Number.isSafeInteger(parsed)) return parsed;
    }
    issues.push(`${field}: valeur entière positive attendue`);
    return null;
  }

  issues.push(`${field}: valeur absente`);
  return null;
}

function parseMajorityPosition(
  value: unknown,
  issues: string[]
): OfficialGroupMajorityPosition | null {
  if (typeof value !== "string" || value.trim() === "") {
    issues.push("majorityPosition: valeur absente");
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "pour") return "POUR";
  if (normalized === "contre") return "CONTRE";
  if (normalized === "abstention") return "ABSTENTION";

  issues.push("majorityPosition: valeur inconnue");
  return null;
}

/**
 * Parse one element of `ventilationVotes.organe.groupes.groupe`.
 *
 * The parser is intentionally tolerant at the transport boundary, but never
 * converts missing, null, or malformed source values to zero. This matters
 * for audit output: zero is an official count, whereas null means that the
 * source could not be read safely.
 */
export function parseOfficialGroupCount(
  value: unknown,
  sourceIndex: number = 0
): OfficialGroupCount {
  const group = asRecord(value);
  const issues: string[] = [];
  const rawRef = group?.organeRef;
  const organeRef = typeof rawRef === "string" && rawRef.trim() ? rawRef.trim() : null;
  if (organeRef === null) issues.push("organeRef: valeur absente");

  const rawVote = asRecord(group?.vote);
  if (!rawVote) issues.push("vote: objet absent");
  const rawCounts = asRecord(rawVote?.decompteVoix);
  if (!rawCounts) issues.push("decompteVoix: objet absent");

  const result: OfficialGroupCount = {
    sourceIndex,
    organeRef,
    memberCount: null,
    forCount: null,
    againstCount: null,
    abstainCount: null,
    nonVoterCount: null,
    voluntaryNonVoterCount: null,
    majorityPosition: null,
    issues,
  };

  for (const { field, source } of COUNT_FIELDS) {
    const sourceValue = field === "memberCount" ? group?.[source] : rawCounts?.[source];
    result[field] = parseNonNegativeInteger(sourceValue, field, issues);
  }
  result.majorityPosition = parseMajorityPosition(rawVote?.positionMajoritaire, issues);

  return result;
}

/**
 * Parse all official group counts from an AN scrutin payload.
 *
 * A missing ventilation is represented by an empty array. The caller should
 * distinguish this case from a non-empty array whose rows carry diagnostics,
 * and persist that distinction in the scrutin-level audit fields.
 */
export function parseOfficialGroupCounts(scrutin: unknown): OfficialGroupCount[] {
  return parseOfficialGroupCountsDetailed(scrutin).counts;
}

/**
 * Parse group counts and retain container-level diagnostics. This allows a
 * sync to distinguish an official empty group list from a payload that did not
 * contain the ventilation section at all.
 */
export function parseOfficialGroupCountsDetailed(scrutin: unknown): OfficialGroupCountsParseResult {
  const root = asRecord(scrutin);
  const rawScrutin = asRecord(root?.scrutin) ?? root;
  const issues: string[] = [];
  if (!rawScrutin) {
    return { counts: [], issues: ["scrutin: objet absent"] };
  }

  const ventilation = asRecord(rawScrutin?.ventilationVotes);
  if (!ventilation) return { counts: [], issues: ["ventilationVotes: objet absent"] };

  const organ = asRecord(ventilation?.organe);
  if (!organ) return { counts: [], issues: ["ventilationVotes.organe: objet absent"] };

  const groups = asRecord(organ?.groupes);
  if (!groups) return { counts: [], issues: ["ventilationVotes.organe.groupes: objet absent"] };

  if (groups.groupe === null || groups.groupe === undefined) {
    return { counts: [], issues: ["ventilationVotes.organe.groupes.groupe: liste absente"] };
  }

  const rawGroupList = asOneOrMany(groups?.groupe);
  const counts = rawGroupList.map((group, sourceIndex) =>
    parseOfficialGroupCount(group, sourceIndex)
  );
  const seenRefs = new Set<string>();
  for (const [index, count] of counts.entries()) {
    if (!count.organeRef) continue;
    if (seenRefs.has(count.organeRef)) {
      count.issues.push(`organeRef: doublon à l'index ${index}`);
      continue;
    }
    seenRefs.add(count.organeRef);
  }

  return { counts, issues };
}

/**
 * Stable representation for hashing official group metadata independently of
 * the nominative `votesHash`.
 */
function canonicalGroupCounts(counts: OfficialGroupCount[]) {
  return [...counts]
    .sort(
      (a, b) =>
        (a.organeRef ?? "").localeCompare(b.organeRef ?? "") || a.sourceIndex - b.sourceIndex
    )
    .map((count) => ({
      sourceIndex: count.sourceIndex,
      organeRef: count.organeRef,
      memberCount: count.memberCount,
      forCount: count.forCount,
      againstCount: count.againstCount,
      abstainCount: count.abstainCount,
      nonVoterCount: count.nonVoterCount,
      voluntaryNonVoterCount: count.voluntaryNonVoterCount,
      majorityPosition: count.majorityPosition,
      issues: [...count.issues].sort(),
    }));
}

export function serializeOfficialGroupCounts(counts: OfficialGroupCount[]): string {
  return JSON.stringify(canonicalGroupCounts(counts));
}

/**
 * Stable representation of the complete official group section, including
 * diagnostics outside individual group rows.
 */
export function serializeOfficialGroupSnapshot(
  counts: OfficialGroupCount[],
  issues: string[]
): string {
  return JSON.stringify({
    counts: canonicalGroupCounts(counts),
    issues: [...issues].sort(),
  });
}

/** Hash the official section only, independently of individual `votesHash`. */
export function hashOfficialGroupSnapshot(counts: OfficialGroupCount[], issues: string[]): string {
  const serialized = serializeOfficialGroupSnapshot(counts, issues);
  return createHash("md5").update(serialized).digest("hex");
}
