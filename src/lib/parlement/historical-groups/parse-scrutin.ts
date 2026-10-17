/**
 * Parser of one scrutin file (lot 5, phase 5A-2): the nominal attestations and the official counts.
 *
 * Pure, one file in, one typed outcome out. Three things are kept apart, because they answer three
 * different questions and must not be merged into one flag:
 * - raw conservation: every voter listed in the file is an attestation, nothing is dropped;
 * - count coherence: the nominal lists agree, or not, with the counts the Assemblée published;
 * - publication admissibility: whether the attestations may feed a publishable position. Decided
 *   here only as "the counts agree", the editorial thresholds live in `publication.ts`.
 *
 * Not interpreted: the Congrès scrutin (a different assembly, different keys), and the "mise au
 * point" (corrections of vote). The mise au point is counted and reported, never applied: it does
 * not explain the gaps between lists and counts that were measured, so whether the published
 * breakdown already reflects it stays an open question.
 */
import { parseCivilDate } from "./civil-date";
import {
  countOf,
  integerOf,
  isAbsent,
  isRecord,
  listOf,
  textOf,
  type RawRecord,
} from "./source-shape";
import {
  asGroupRef,
  asOfficialActorId,
  asScrutinId,
  type CivilDate,
  type GroupRef,
  type OfficialActorId,
  type ScrutinId,
} from "./types";

export const NOMINAL_POSITIONS = ["pour", "contre", "abstention", "nonVotant"] as const;
export type NominalPosition = (typeof NOMINAL_POSITIONS)[number];

/** Plural keys, as the Assemblée publishes an AN scrutin. */
const PLURAL_KEYS: Record<NominalPosition, string> = {
  pour: "pours",
  contre: "contres",
  abstention: "abstentions",
  nonVotant: "nonVotants",
};

export const SCRUTIN_REJECTIONS = [
  "ROOT_MISSING",
  "UID_MISSING",
  "UNKNOWN_SCRUTIN_KIND",
  "DATE_INVALID",
  "LEGISLATURE_MALFORMED",
  "UNSUPPORTED_PUBLICATION_MODE",
  "NO_GROUP_BREAKDOWN",
  "GROUP_MALFORMED",
  "ORGAN_REF_MISSING",
  "POSITION_BLOCK_MALFORMED",
  "SINGULAR_KEYS_IN_AN_SCRUTIN",
  "VOTANT_MALFORMED",
  "DUPLICATE_ACTOR_IN_SCRUTIN",
] as const;
export type ScrutinRejection = (typeof SCRUTIN_REJECTIONS)[number];

export type Counts = Record<NominalPosition, number>;

/** One voter, as listed under a group in the published nominal breakdown. */
export interface ScrutinAttestation {
  scrutinId: ScrutinId;
  date: CivilDate;
  legislature: number;
  officialId: OfficialActorId;
  /** As published, including the placeholder `PO0`. */
  publishedOrganRef: GroupRef;
  position: NominalPosition;
  /** The seat mandate the voter voted under, as published. */
  seatMandateRef: string | null;
}

export interface GroupBreakdown {
  organRef: GroupRef;
  nominal: Counts;
  /** `null` when the file gives no official count for the group. */
  official: Counts | null;
}

export type CountCoherence = "COHERENT" | "COUNT_MISMATCH" | "UNVERIFIABLE";

export interface MiseAuPointDiagnostic {
  present: boolean;
  /** Voters listed in the correction blocks. Counted, never applied. */
  listedVotants: number;
  /** A block that is neither empty, an object nor a list of objects. */
  malformedBlocks: number;
}

export interface ParsedAnScrutin {
  scrutinId: ScrutinId;
  number: string | null;
  date: CivilDate;
  legislature: number;
  attestations: ScrutinAttestation[];
  groups: GroupBreakdown[];
  /** `syntheseVote.decompte`, as published. */
  synthese: Counts | null;
  countCoherence: CountCoherence;
  /** Groups whose nominal list differs from their official count, on any position. */
  mismatchedGroups: number;
  /** The scrutin-level summary differs from the sum of the nominal lists. */
  syntheseMismatch: boolean;
  /** Same, restricted to pour, contre and abstention (`nonVotant` left out). */
  syntheseMismatchPCA: boolean;
  miseAuPoint: MiseAuPointDiagnostic;
  /** Raw conservation: always true for a parsed scrutin, a rejected one has no attestation at all. */
  rawConserved: true;
  /** `false` as soon as the counts disagree or cannot be checked. */
  publicationAdmissible: boolean;
}

/** What is known about the Congrès scrutin, without reading it as an AN scrutin. */
export interface CongresIdentification {
  uid: string;
  date: CivilDate | null;
  legislature: number | null;
  groupCount: number;
  /** Raw count of listed voters under every key spelling, singular or plural. Not interpreted. */
  listedVotants: number | null;
}

export type ScrutinParse =
  | { status: "AN"; scrutin: ParsedAnScrutin }
  | { status: "CONGRES"; congres: CongresIdentification }
  | { status: "REJECTED"; reason: ScrutinRejection; sourceRecordId: string | null };

const AN_PREFIX = "VTANR";
const CONGRES_PREFIX = "VTCGR";

const zeroCounts = (): Counts => ({ pour: 0, contre: 0, abstention: 0, nonVotant: 0 });

function groupsOf(scrutin: RawRecord): unknown[] | null {
  const ventilation = scrutin["ventilationVotes"];
  if (!isRecord(ventilation) || !isRecord(ventilation["organe"])) return null;
  const groupes = ventilation["organe"]["groupes"];
  if (!isRecord(groupes) || isAbsent(groupes["groupe"])) return null;
  return listOf(groupes["groupe"]);
}

/** Raw count of every `votant` under any key spelling. Used for the Congrès only. */
function countListedVotants(scrutin: RawRecord): number | null {
  const groups = groupsOf(scrutin);
  if (groups === null) return null;
  let total = 0;
  for (const group of groups) {
    const nominal =
      isRecord(group) && isRecord(group["vote"]) ? group["vote"]["decompteNominatif"] : null;
    if (!isRecord(nominal)) continue;
    for (const key of [...Object.values(PLURAL_KEYS), ...NOMINAL_POSITIONS]) {
      const block = nominal[key];
      if (isRecord(block)) total += listOf(block["votant"]).length;
    }
  }
  return total;
}

/**
 * The official count of a group or of a scrutin. `null` when it is absent, incomplete or not made
 * of counts: the scrutin then cannot be checked, which is a coherence verdict (`UNVERIFIABLE`) and
 * not a reason to lose its attestations. Plural and singular spellings both occur (`pour`,
 * `abstentions`), and a `0` is a real count: only an absent key falls back on the other spelling.
 */
function readOfficialCounts(raw: unknown): Counts | null {
  if (!isRecord(raw)) return null;
  const out = zeroCounts();
  for (const position of NOMINAL_POSITIONS) {
    const plural = raw[PLURAL_KEYS[position]];
    const parsed = countOf(!isAbsent(plural) ? plural : raw[position]);
    if (parsed === null) return null;
    out[position] = parsed;
  }
  return out;
}

function differs(a: Counts, b: Counts, positions: readonly NominalPosition[]): boolean {
  return positions.some((position) => a[position] !== b[position]);
}

function readMiseAuPoint(raw: unknown): MiseAuPointDiagnostic {
  if (isAbsent(raw)) return { present: false, listedVotants: 0, malformedBlocks: 0 };
  if (!isRecord(raw)) return { present: true, listedVotants: 0, malformedBlocks: 1 };
  let listedVotants = 0;
  let malformedBlocks = 0;
  for (const key of ["pours", "contres", "abstentions", "nonVotants", "nonVotantsVolontaires"]) {
    for (const block of listOf(raw[key])) {
      if (isAbsent(block)) continue;
      if (!isRecord(block)) {
        malformedBlocks += 1;
        continue;
      }
      listedVotants += listOf(block["votant"]).filter((v) => isRecord(v)).length;
    }
  }
  return { present: true, listedVotants, malformedBlocks };
}

/** `raw` is the content of one scrutin file: `{ "scrutin": { ... } }`. */
export function parseScrutin(raw: unknown): ScrutinParse {
  const scrutin = isRecord(raw) ? raw["scrutin"] : undefined;
  if (!isRecord(scrutin))
    return { status: "REJECTED", reason: "ROOT_MISSING", sourceRecordId: null };
  const uid = textOf(scrutin["uid"]);
  if (uid === null) return { status: "REJECTED", reason: "UID_MISSING", sourceRecordId: null };
  const reject = (reason: ScrutinRejection): ScrutinParse => ({
    status: "REJECTED",
    reason,
    sourceRecordId: uid,
  });

  const date = parseCivilDate(scrutin["dateScrutin"]);
  const legislatureRaw = scrutin["legislature"];
  const legislature = isAbsent(legislatureRaw) ? null : integerOf(legislatureRaw);

  if (uid.startsWith(CONGRES_PREFIX)) {
    const groups = groupsOf(scrutin);
    return {
      status: "CONGRES",
      congres: {
        uid,
        date,
        legislature,
        groupCount: groups?.length ?? 0,
        listedVotants: countListedVotants(scrutin),
      },
    };
  }
  if (!uid.startsWith(AN_PREFIX)) return reject("UNKNOWN_SCRUTIN_KIND");
  if (date === null) return reject("DATE_INVALID");
  if (legislature === null) return reject("LEGISLATURE_MALFORMED");
  if (scrutin["modePublicationDesVotes"] !== "DecompteNominatif") {
    return reject("UNSUPPORTED_PUBLICATION_MODE");
  }

  const groups = groupsOf(scrutin);
  if (groups === null || groups.length === 0) return reject("NO_GROUP_BREAKDOWN");

  const scrutinId = asScrutinId(uid);
  const attestations: ScrutinAttestation[] = [];
  const breakdown: GroupBreakdown[] = [];
  const seen = new Set<string>();
  let anyUnverifiable = false;
  let mismatchedGroups = 0;

  for (const group of groups) {
    if (!isRecord(group) || !isRecord(group["vote"])) return reject("GROUP_MALFORMED");
    const organRef = textOf(group["organeRef"]);
    if (organRef === null) return reject("ORGAN_REF_MISSING");
    const nominal = group["vote"]["decompteNominatif"];
    if (!isRecord(nominal)) return reject("POSITION_BLOCK_MALFORMED");
    // An AN scrutin never spells its positions in the singular. If it does, the file is not
    // the shape this parser was written for, and it is refused rather than half read.
    if (NOMINAL_POSITIONS.some((position) => !isAbsent(nominal[position]))) {
      return reject("SINGULAR_KEYS_IN_AN_SCRUTIN");
    }
    const counts = zeroCounts();
    for (const position of NOMINAL_POSITIONS) {
      const block = nominal[PLURAL_KEYS[position]];
      if (isAbsent(block)) continue;
      if (!isRecord(block)) return reject("POSITION_BLOCK_MALFORMED");
      for (const votant of listOf(block["votant"])) {
        if (!isRecord(votant)) return reject("VOTANT_MALFORMED");
        const actor = textOf(votant["acteurRef"]);
        if (actor === null) return reject("VOTANT_MALFORMED");
        const mandate = votant["mandatRef"];
        if (!isAbsent(mandate) && textOf(mandate) === null) return reject("VOTANT_MALFORMED");
        if (seen.has(actor)) return reject("DUPLICATE_ACTOR_IN_SCRUTIN");
        seen.add(actor);
        counts[position] += 1;
        attestations.push({
          scrutinId,
          date,
          legislature,
          officialId: asOfficialActorId(actor),
          publishedOrganRef: asGroupRef(organRef),
          position,
          seatMandateRef: isAbsent(mandate) ? null : textOf(mandate),
        });
      }
    }
    const official = readOfficialCounts(group["vote"]["decompteVoix"]);
    if (official === null) anyUnverifiable = true;
    else if (differs(counts, official, NOMINAL_POSITIONS)) mismatchedGroups += 1;
    breakdown.push({ organRef: asGroupRef(organRef), nominal: counts, official });
  }

  const summary = isRecord(scrutin["syntheseVote"]) ? scrutin["syntheseVote"]["decompte"] : null;
  const synthese = readOfficialCounts(summary);
  const totals = zeroCounts();
  for (const group of breakdown) {
    for (const position of NOMINAL_POSITIONS) totals[position] += group.nominal[position];
  }
  const syntheseMismatch = synthese !== null && differs(totals, synthese, NOMINAL_POSITIONS);
  const syntheseMismatchPCA =
    synthese !== null && differs(totals, synthese, ["pour", "contre", "abstention"]);

  const unverifiable = anyUnverifiable || synthese === null;
  const mismatch = mismatchedGroups > 0 || syntheseMismatch;
  const countCoherence: CountCoherence = mismatch
    ? "COUNT_MISMATCH"
    : unverifiable
      ? "UNVERIFIABLE"
      : "COHERENT";

  return {
    status: "AN",
    scrutin: {
      scrutinId,
      number: textOf(scrutin["numero"]),
      date,
      legislature,
      attestations,
      groups: breakdown,
      synthese,
      countCoherence,
      mismatchedGroups,
      syntheseMismatch,
      syntheseMismatchPCA,
      miseAuPoint: readMiseAuPoint(scrutin["miseAuPoint"]),
      rawConserved: true,
      publicationAdmissible: countCoherence === "COHERENT",
    },
  };
}
