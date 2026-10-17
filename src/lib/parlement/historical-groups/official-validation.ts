/**
 * Validation of the official files against each other (lot 5, phase 5A-2).
 *
 * This is a measurement, not a resolution. It classifies every nominal vote into one exclusive
 * category by comparing what the scrutin says (E1) with what the mandates say (E2), with its own
 * small rules, and it does not import the resolver. If the resolver and this classification ever
 * disagree on the same data, one of them is wrong, and that is the point of having both.
 *
 * Everything returned is a number, a count by name or an identifier of a record. No name of a
 * person is read anywhere, so no report built from this can carry one.
 */
import {
  classifyGroupOrgans,
  type ActorParse,
  type ClassifiedOrgan,
  type GroupOrganRecord,
  type OrganParse,
  type SeatMandateRecord,
} from "./parse-amo30";
import type {
  CongresIdentification,
  ParsedAnScrutin,
  ScrutinAttestation,
  ScrutinParse,
} from "./parse-scrutin";
import type { CivilDate, GroupMembershipEvidence } from "./types";

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

export interface Reference {
  organs: ReadonlyMap<string, ClassifiedOrgan>;
  membershipsByActor: ReadonlyMap<string, readonly GroupMembershipEvidence[]>;
  seats: ReadonlyMap<string, SeatMandateRecord>;
  /** Records whose key was already present. The first one is kept, the others are counted. */
  duplicateKeys: { organs: number; memberships: number; seats: number };
}

export function buildReference(
  organs: readonly ClassifiedOrgan[],
  memberships: readonly GroupMembershipEvidence[],
  seats: readonly SeatMandateRecord[]
): Reference {
  const duplicateKeys = { organs: 0, memberships: 0, seats: 0 };
  const organMap = new Map<string, ClassifiedOrgan>();
  for (const organ of organs) {
    if (organMap.has(organ.organ.groupRef)) duplicateKeys.organs += 1;
    else organMap.set(organ.organ.groupRef, organ);
  }
  const seenMemberships = new Set<string>();
  const byActor = new Map<string, GroupMembershipEvidence[]>();
  for (const membership of memberships) {
    if (seenMemberships.has(membership.sourceRecordId)) {
      duplicateKeys.memberships += 1;
      continue;
    }
    seenMemberships.add(membership.sourceRecordId);
    const list = byActor.get(membership.officialId);
    if (list) list.push(membership);
    else byActor.set(membership.officialId, [membership]);
  }
  const seatMap = new Map<string, SeatMandateRecord>();
  for (const seat of seats) {
    if (seatMap.has(seat.sourceRecordId)) duplicateKeys.seats += 1;
    else seatMap.set(seat.sourceRecordId, seat);
  }
  return { organs: organMap, membershipsByActor: byActor, seats: seatMap, duplicateKeys };
}

// ---------------------------------------------------------------------------
// Exclusive categories of a nominal vote
// ---------------------------------------------------------------------------

/**
 * Exclusive, in order of priority. The sum of the categories is the number of nominal votes.
 *
 * `MULTIPLE_DISTINCT_ORGANS` is tested before the agreement categories: with two organs valid the
 * same day, "agreement" with one of them would hide the other. Measured at 0 on the three
 * legislatures, so the order changes no published number.
 */
export const VOTE_CATEGORIES = [
  "ORGAN_ABSENT",
  "NO_GROUP_RECORD",
  "MULTIPLE_DISTINCT_ORGANS",
  "AGREE_SINGLE_RECORD",
  "AGREE_SAME_ORGAN_RECORDS",
  "SAME_SIGLE_OTHER_REF",
  "DIFFERENT_GROUP",
] as const;
export type VoteCategory = (typeof VOTE_CATEGORIES)[number];

export const SEAT_CHECKS = [
  "COVERED",
  "COVERED_ON_END_DAY_ONLY",
  "REF_MISSING",
  "MANDATE_UNKNOWN",
  "OTHER_ACTOR",
  "DATE_OUTSIDE",
] as const;
export type SeatCheck = (typeof SEAT_CHECKS)[number];

/** Closed interval: both bounds included. An open end is valid from the start, without limit. */
function covers(
  record: { startDate: CivilDate | null; endDate: CivilDate | null },
  date: CivilDate,
  inclusiveEnd: boolean
): boolean {
  if (record.startDate === null || record.startDate > date) return false;
  if (record.endDate === null) return true;
  return inclusiveEnd ? date <= record.endDate : date < record.endDate;
}

export interface VoteClassification {
  category: VoteCategory;
  /** The published organ is the literal placeholder `PO0` (only meaningful for `ORGAN_ABSENT`). */
  placeholder: boolean;
  /** The day is the start or the end of a group record of the voter, in the same legislature. */
  edgeDay: boolean;
  seat: SeatCheck;
}

export function classifyVote(
  attestation: ScrutinAttestation,
  reference: Reference
): VoteClassification {
  const { date, legislature } = attestation;
  const records = (reference.membershipsByActor.get(attestation.officialId) ?? []).filter(
    (record) => record.legislature === legislature
  );
  const edgeDay = records.some((record) => record.startDate === date || record.endDate === date);
  const seat = checkSeat(attestation, reference);

  const published = reference.organs.get(attestation.publishedOrganRef);
  if (published === undefined) {
    return {
      category: "ORGAN_ABSENT",
      placeholder: attestation.publishedOrganRef === "PO0",
      edgeDay,
      seat,
    };
  }
  const valid = records.filter((record) => covers(record, date, true));
  const done = (category: VoteCategory): VoteClassification => ({
    category,
    placeholder: false,
    edgeDay,
    seat,
  });
  if (valid.length === 0) return done("NO_GROUP_RECORD");
  const organs = new Set(valid.map((record) => record.groupRef));
  if (organs.size > 1) return done("MULTIPLE_DISTINCT_ORGANS");
  const [only] = [...organs];
  if (only === attestation.publishedOrganRef) {
    return done(valid.length > 1 ? "AGREE_SAME_ORGAN_RECORDS" : "AGREE_SINGLE_RECORD");
  }
  const other = reference.organs.get(only as string);
  const sameSigle =
    other !== undefined &&
    published.organ.abbreviation !== null &&
    published.organ.abbreviation === other.organ.abbreviation;
  return done(sameSigle ? "SAME_SIGLE_OTHER_REF" : "DIFFERENT_GROUP");
}

function checkSeat(attestation: ScrutinAttestation, reference: Reference): SeatCheck {
  if (attestation.seatMandateRef === null) return "REF_MISSING";
  const seat = reference.seats.get(attestation.seatMandateRef);
  if (seat === undefined) return "MANDATE_UNKNOWN";
  if (seat.officialId !== attestation.officialId) return "OTHER_ACTOR";
  if (!covers(seat, attestation.date, true)) return "DATE_OUTSIDE";
  return covers(seat, attestation.date, false) ? "COVERED" : "COVERED_ON_END_DAY_ONLY";
}

// ---------------------------------------------------------------------------
// Aggregates of the scrutin files
// ---------------------------------------------------------------------------

function zeroed<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

export interface LegislatureAggregate {
  anScrutins: number;
  nominalVotes: number;
  distinctActors: number;
  /** Scrutins by agreement between the nominal lists and the published counts. */
  coherence: { COHERENT: number; COUNT_MISMATCH: number; UNVERIFIABLE: number };
  countMismatch: {
    scrutinsWithGroupMismatch: number;
    groupsMismatched: number;
    scrutinsWithSyntheseMismatch: number;
    scrutinsWithSyntheseMismatchPCA: number;
  };
  /** Raw conservation: all attestations kept. Admissibility: counts agree. They are not the same. */
  votesInPublicationAdmissibleScrutins: number;
  votesInScrutinsKeptButNotAdmissible: number;
  miseAuPoint: {
    scrutinsPresent: number;
    scrutinsWithListedVotants: number;
    listedVotants: number;
    malformedBlocks: number;
  };
  /** Exclusive: the values sum to `nominalVotes`. */
  categories: Record<VoteCategory, number>;
  organAbsentPlaceholder: number;
  edgeDayVotes: number;
  edgeDayByCategory: Record<VoteCategory, number>;
  seat: Record<SeatCheck, number>;
}

export interface FileAggregate {
  total: number;
  anScrutins: number;
  congres: number;
  rejected: number;
  rejectedByReason: Record<string, number>;
}

export interface ScrutinsAggregate {
  files: FileAggregate;
  byLegislature: Record<string, LegislatureAggregate>;
  /** Identified separately, never counted in any legislature figure above. */
  congres: CongresIdentification[];
}

const newLegislature = (): LegislatureAggregate => ({
  anScrutins: 0,
  nominalVotes: 0,
  distinctActors: 0,
  coherence: { COHERENT: 0, COUNT_MISMATCH: 0, UNVERIFIABLE: 0 },
  countMismatch: {
    scrutinsWithGroupMismatch: 0,
    groupsMismatched: 0,
    scrutinsWithSyntheseMismatch: 0,
    scrutinsWithSyntheseMismatchPCA: 0,
  },
  votesInPublicationAdmissibleScrutins: 0,
  votesInScrutinsKeptButNotAdmissible: 0,
  miseAuPoint: {
    scrutinsPresent: 0,
    scrutinsWithListedVotants: 0,
    listedVotants: 0,
    malformedBlocks: 0,
  },
  categories: zeroed(VOTE_CATEGORIES),
  organAbsentPlaceholder: 0,
  edgeDayVotes: 0,
  edgeDayByCategory: zeroed(VOTE_CATEGORIES),
  seat: zeroed(SEAT_CHECKS),
});

/** A few record identifiers per category, for whoever has to look. Never part of a baseline. */
export type Examples = Map<string, string[]>;
const EXAMPLES_PER_CATEGORY = 5;

function remember(examples: Examples | undefined, category: string, id: string): void {
  if (!examples) return;
  const list = examples.get(category);
  if (!list) examples.set(category, [id]);
  else if (list.length < EXAMPLES_PER_CATEGORY && !list.includes(id)) list.push(id);
}

export interface ScrutinsAccumulator {
  files: FileAggregate;
  legislatures: Map<number, { aggregate: LegislatureAggregate; actors: Set<string> }>;
  congres: CongresIdentification[];
  examples: Examples;
}

export function createScrutinsAccumulator(): ScrutinsAccumulator {
  return {
    files: { total: 0, anScrutins: 0, congres: 0, rejected: 0, rejectedByReason: {} },
    legislatures: new Map(),
    congres: [],
    examples: new Map(),
  };
}

function addAnScrutin(
  acc: ScrutinsAccumulator,
  scrutin: ParsedAnScrutin,
  reference: Reference
): void {
  let slot = acc.legislatures.get(scrutin.legislature);
  if (!slot) {
    slot = { aggregate: newLegislature(), actors: new Set() };
    acc.legislatures.set(scrutin.legislature, slot);
  }
  const agg = slot.aggregate;
  agg.anScrutins += 1;
  agg.coherence[scrutin.countCoherence] += 1;
  if (scrutin.mismatchedGroups > 0) agg.countMismatch.scrutinsWithGroupMismatch += 1;
  agg.countMismatch.groupsMismatched += scrutin.mismatchedGroups;
  if (scrutin.syntheseMismatch) agg.countMismatch.scrutinsWithSyntheseMismatch += 1;
  if (scrutin.syntheseMismatchPCA) agg.countMismatch.scrutinsWithSyntheseMismatchPCA += 1;
  if (scrutin.countCoherence !== "COHERENT")
    remember(acc.examples, `scrutin:${scrutin.countCoherence}`, scrutin.scrutinId);
  const votes = scrutin.attestations.length;
  agg.nominalVotes += votes;
  if (scrutin.publicationAdmissible) agg.votesInPublicationAdmissibleScrutins += votes;
  else agg.votesInScrutinsKeptButNotAdmissible += votes;
  const correction = scrutin.miseAuPoint;
  if (correction.present) agg.miseAuPoint.scrutinsPresent += 1;
  if (correction.listedVotants > 0) agg.miseAuPoint.scrutinsWithListedVotants += 1;
  agg.miseAuPoint.listedVotants += correction.listedVotants;
  agg.miseAuPoint.malformedBlocks += correction.malformedBlocks;

  for (const attestation of scrutin.attestations) {
    slot.actors.add(attestation.officialId);
    const result = classifyVote(attestation, reference);
    agg.categories[result.category] += 1;
    if (result.placeholder) agg.organAbsentPlaceholder += 1;
    if (result.edgeDay) {
      agg.edgeDayVotes += 1;
      agg.edgeDayByCategory[result.category] += 1;
    }
    agg.seat[result.seat] += 1;
    if (
      result.category !== "AGREE_SINGLE_RECORD" &&
      result.category !== "AGREE_SAME_ORGAN_RECORDS"
    ) {
      remember(acc.examples, `category:${result.category}`, scrutin.scrutinId);
    }
    if (result.seat !== "COVERED" && result.seat !== "COVERED_ON_END_DAY_ONLY") {
      remember(acc.examples, `seat:${result.seat}`, scrutin.scrutinId);
    }
  }
}

/** Feeds one scrutin file outcome into the accumulator. Every file lands in exactly one bucket. */
export function addScrutinParse(
  acc: ScrutinsAccumulator,
  parse: ScrutinParse,
  reference: Reference
): void {
  acc.files.total += 1;
  if (parse.status === "AN") {
    acc.files.anScrutins += 1;
    addAnScrutin(acc, parse.scrutin, reference);
  } else if (parse.status === "CONGRES") {
    acc.files.congres += 1;
    acc.congres.push(parse.congres);
  } else {
    acc.files.rejected += 1;
    acc.files.rejectedByReason[parse.reason] = (acc.files.rejectedByReason[parse.reason] ?? 0) + 1;
    remember(acc.examples, `rejected:${parse.reason}`, parse.sourceRecordId ?? "(no identifier)");
  }
}

export function finalizeScrutins(acc: ScrutinsAccumulator): ScrutinsAggregate {
  const byLegislature: Record<string, LegislatureAggregate> = {};
  for (const legislature of [...acc.legislatures.keys()].sort((a, b) => a - b)) {
    const slot = acc.legislatures.get(legislature);
    if (!slot) continue;
    byLegislature[String(legislature)] = { ...slot.aggregate, distinctActors: slot.actors.size };
  }
  const rejectedByReason = Object.fromEntries(
    Object.entries(acc.files.rejectedByReason).sort(([a], [b]) => (a < b ? -1 : 1))
  );
  const congres = [...acc.congres].sort((a, b) => (a.uid < b.uid ? -1 : 1));
  return { files: { ...acc.files, rejectedByReason }, byLegislature, congres };
}

/**
 * Checks that nothing was lost, from the numbers alone. Returns the broken invariants. An empty
 * list is the only acceptable answer.
 */
export function scrutinsInvariantViolations(aggregate: ScrutinsAggregate): string[] {
  const violations: string[] = [];
  const { files } = aggregate;
  if (files.anScrutins + files.congres + files.rejected !== files.total) {
    violations.push("files: AN + Congrès + rejected != total");
  }
  const rejectedSum = Object.values(files.rejectedByReason).reduce((a, b) => a + b, 0);
  if (rejectedSum !== files.rejected) violations.push("files: rejected by reason != rejected");
  if (aggregate.congres.length !== files.congres)
    violations.push("files: Congrès list != Congrès count");
  const anSum = Object.values(aggregate.byLegislature).reduce((a, l) => a + l.anScrutins, 0);
  if (anSum !== files.anScrutins) violations.push("legislatures: AN scrutins != files");
  for (const [legislature, l] of Object.entries(aggregate.byLegislature)) {
    const sum = (record: Record<string, number>) =>
      Object.values(record).reduce((a, b) => a + b, 0);
    if (sum(l.categories) !== l.nominalVotes)
      violations.push(`L${legislature}: categories != nominal votes`);
    if (sum(l.seat) !== l.nominalVotes)
      violations.push(`L${legislature}: seat checks != nominal votes`);
    if (sum(l.coherence) !== l.anScrutins)
      violations.push(`L${legislature}: coherence != AN scrutins`);
    if (
      l.votesInPublicationAdmissibleScrutins + l.votesInScrutinsKeptButNotAdmissible !==
      l.nominalVotes
    ) {
      violations.push(`L${legislature}: admissible + kept != nominal votes`);
    }
    if (l.edgeDayVotes !== sum(l.edgeDayByCategory))
      violations.push(`L${legislature}: edge days != sum by category`);
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Aggregates of the AMO30 referential
// ---------------------------------------------------------------------------

export interface Amo30Aggregate {
  organFiles: {
    total: number;
    groupOrgans: number;
    outOfScope: number;
    rejected: number;
    rejectedByReason: Record<string, number>;
  };
  actorFiles: {
    total: number;
    accepted: number;
    rejected: number;
    rejectedByReason: Record<string, number>;
  };
  mandates: {
    total: number;
    group: number;
    seat: number;
    outOfScope: number;
    rejected: number;
    rejectedByReason: Record<string, number>;
  };
  organKinds: { GROUP: number; NON_INSCRIT: number; unclassified: Record<string, number> };
  groupOrgansByLegislature: Record<string, number>;
  membershipsByLegislature: Record<string, number>;
  /** Group memberships with no end date in the file. Valid up to the file date, not "current". */
  membershipsWithoutEnd: number;
  /** Blocking structure checks of the import (section 8.2 of the architecture document). */
  structure: {
    duplicateKeys: { organs: number; memberships: number; seats: number };
    membershipsWithAbsentOrgan: number;
    overlapDistinctOrgans: Record<string, number>;
    overlapAcrossLegislatures: number;
    overlapSameOrgan: Record<string, { identicalDates: number; differentDates: number }>;
  };
}

const sortedEntries = (record: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)));

function overlaps(a: GroupMembershipEvidence, b: GroupMembershipEvidence): boolean {
  if (a.startDate === null || b.startDate === null) return false;
  const aEnd = a.endDate ?? ("9999-12-31" as CivilDate);
  const bEnd = b.endDate ?? ("9999-12-31" as CivilDate);
  return a.startDate <= bEnd && b.startDate <= aEnd;
}

export interface Amo30Model {
  reference: Reference;
  organs: ClassifiedOrgan[];
  aggregate: Amo30Aggregate;
}

export function summarizeAmo30(
  organParses: readonly OrganParse[],
  actorParses: readonly ActorParse[]
): Amo30Model {
  const organFiles: Amo30Aggregate["organFiles"] = {
    total: organParses.length,
    groupOrgans: 0,
    outOfScope: 0,
    rejected: 0,
    rejectedByReason: {},
  };
  const groupOrgans: GroupOrganRecord[] = [];
  for (const parse of organParses) {
    if (parse.status === "ACCEPTED") {
      organFiles.groupOrgans += 1;
      groupOrgans.push(parse.organ);
    } else if (parse.status === "OUT_OF_SCOPE") organFiles.outOfScope += 1;
    else {
      organFiles.rejected += 1;
      organFiles.rejectedByReason[parse.reason] =
        (organFiles.rejectedByReason[parse.reason] ?? 0) + 1;
    }
  }

  const actorFiles: Amo30Aggregate["actorFiles"] = {
    total: actorParses.length,
    accepted: 0,
    rejected: 0,
    rejectedByReason: {},
  };
  const mandates: Amo30Aggregate["mandates"] = {
    total: 0,
    group: 0,
    seat: 0,
    outOfScope: 0,
    rejected: 0,
    rejectedByReason: {},
  };
  const memberships: GroupMembershipEvidence[] = [];
  const seats: SeatMandateRecord[] = [];
  for (const parse of actorParses) {
    if (parse.status === "REJECTED") {
      actorFiles.rejected += 1;
      actorFiles.rejectedByReason[parse.reason] =
        (actorFiles.rejectedByReason[parse.reason] ?? 0) + 1;
      continue;
    }
    actorFiles.accepted += 1;
    mandates.total += parse.mandateTotal;
    mandates.group += parse.memberships.length;
    mandates.seat += parse.seats.length;
    mandates.outOfScope += parse.outOfScopeMandates;
    mandates.rejected += parse.rejectedMandates.length;
    for (const rejected of parse.rejectedMandates) {
      mandates.rejectedByReason[rejected.reason] =
        (mandates.rejectedByReason[rejected.reason] ?? 0) + 1;
    }
    memberships.push(...parse.memberships);
    seats.push(...parse.seats);
  }

  const organs = classifyGroupOrgans(groupOrgans, memberships);
  const reference = buildReference(organs, memberships, seats);

  const organKinds: Amo30Aggregate["organKinds"] = { GROUP: 0, NON_INSCRIT: 0, unclassified: {} };
  const groupOrgansByLegislature: Record<string, number> = {};
  for (const organ of organs) {
    if (organ.kind === "GROUP") organKinds.GROUP += 1;
    else if (organ.kind === "NON_INSCRIT") organKinds.NON_INSCRIT += 1;
    else {
      const key = organ.diagnostic ?? "UNCLASSIFIED";
      organKinds.unclassified[key] = (organKinds.unclassified[key] ?? 0) + 1;
    }
    const legislature = String(organ.organ.legislature);
    groupOrgansByLegislature[legislature] = (groupOrgansByLegislature[legislature] ?? 0) + 1;
  }

  const membershipsByLegislature: Record<string, number> = {};
  let membershipsWithoutEnd = 0;
  let membershipsWithAbsentOrgan = 0;
  const overlapDistinctOrgans: Record<string, number> = {};
  const overlapSameOrgan: Record<string, { identicalDates: number; differentDates: number }> = {};
  let overlapAcrossLegislatures = 0;
  for (const records of reference.membershipsByActor.values()) {
    for (let i = 0; i < records.length; i += 1) {
      const a = records[i] as GroupMembershipEvidence;
      const legislature = String(a.legislature);
      membershipsByLegislature[legislature] = (membershipsByLegislature[legislature] ?? 0) + 1;
      if (a.endState === "OPEN_AT_SNAPSHOT") membershipsWithoutEnd += 1;
      if (!reference.organs.has(a.groupRef)) membershipsWithAbsentOrgan += 1;
      for (let j = i + 1; j < records.length; j += 1) {
        const b = records[j] as GroupMembershipEvidence;
        if (!overlaps(a, b)) continue;
        if (a.legislature !== b.legislature) {
          overlapAcrossLegislatures += 1;
        } else if (a.groupRef !== b.groupRef) {
          overlapDistinctOrgans[legislature] = (overlapDistinctOrgans[legislature] ?? 0) + 1;
        } else {
          const slot = (overlapSameOrgan[legislature] ??= { identicalDates: 0, differentDates: 0 });
          if (a.startDate === b.startDate && a.endDate === b.endDate) slot.identicalDates += 1;
          else slot.differentDates += 1;
        }
      }
    }
  }

  return {
    reference,
    organs,
    aggregate: {
      organFiles: { ...organFiles, rejectedByReason: sortedEntries(organFiles.rejectedByReason) },
      actorFiles: { ...actorFiles, rejectedByReason: sortedEntries(actorFiles.rejectedByReason) },
      mandates: { ...mandates, rejectedByReason: sortedEntries(mandates.rejectedByReason) },
      organKinds: { ...organKinds, unclassified: sortedEntries(organKinds.unclassified) },
      groupOrgansByLegislature: sortedEntries(groupOrgansByLegislature),
      membershipsByLegislature: sortedEntries(membershipsByLegislature),
      membershipsWithoutEnd,
      structure: {
        duplicateKeys: reference.duplicateKeys,
        membershipsWithAbsentOrgan,
        overlapDistinctOrgans: sortedEntries(overlapDistinctOrgans),
        overlapAcrossLegislatures,
        overlapSameOrgan: Object.fromEntries(
          Object.entries(overlapSameOrgan).sort(([a], [b]) => (a < b ? -1 : 1))
        ),
      },
    },
  };
}

/** Invariants of the referential counts, from the numbers alone. Empty is the only good answer. */
export function amo30InvariantViolations(aggregate: Amo30Aggregate): string[] {
  const violations: string[] = [];
  const { organFiles, actorFiles, mandates, organKinds } = aggregate;
  if (organFiles.groupOrgans + organFiles.outOfScope + organFiles.rejected !== organFiles.total) {
    violations.push("organ files: accepted + out of scope + rejected != total");
  }
  if (actorFiles.accepted + actorFiles.rejected !== actorFiles.total) {
    violations.push("actor files: accepted + rejected != total");
  }
  if (mandates.group + mandates.seat + mandates.outOfScope + mandates.rejected !== mandates.total) {
    violations.push("mandates: group + seat + out of scope + rejected != total");
  }
  const unclassified = Object.values(organKinds.unclassified).reduce((a, b) => a + b, 0);
  if (organKinds.GROUP + organKinds.NON_INSCRIT + unclassified !== organFiles.groupOrgans) {
    violations.push("organ kinds != group organs");
  }
  return violations;
}

/**
 * Checks that block the import in section 8.2 of the architecture document, as counts. A published
 * `PO0` is not one of them: it is counted and left out, not blocking.
 *
 * The overlap of two distinct organs is blocking only for the legislatures the scrutin archives
 * cover (the votes that will be attested). In the older legislatures of the referential it is
 * reported apart: the cases found there all share one boundary day, an organ ending the day the
 * next one starts, which the closed reading of the dates turns into an overlap.
 */
export function blockingViolations(
  amo: Amo30Aggregate,
  scrutins: readonly ScrutinsAggregate[]
): { blocking: Record<string, number>; informative: Record<string, number> } {
  const covered = new Set(scrutins.flatMap((aggregate) => Object.keys(aggregate.byLegislature)));
  let overlapCovered = 0;
  let overlapOutside = 0;
  for (const [legislature, count] of Object.entries(amo.structure.overlapDistinctOrgans)) {
    if (covered.size === 0 || covered.has(legislature)) overlapCovered += count;
    else overlapOutside += count;
  }
  const blocking: Record<string, number> = {
    startAfterEnd:
      (amo.organFiles.rejectedByReason["START_AFTER_END"] ?? 0) +
      (amo.mandates.rejectedByReason["START_AFTER_END"] ?? 0),
    duplicateKeys:
      amo.structure.duplicateKeys.organs +
      amo.structure.duplicateKeys.memberships +
      amo.structure.duplicateKeys.seats,
    membershipsWithAbsentOrgan: amo.structure.membershipsWithAbsentOrgan,
    mandateOfAnotherActor: amo.mandates.rejectedByReason["ACTOR_MISMATCH"] ?? 0,
    overlapDistinctOrgans: overlapCovered,
    voteSeatMandateNotFoundOrMissing: 0,
    voteSeatMandateOfAnotherActor: 0,
    voteSeatMandateNotCoveringDate: 0,
  };
  for (const aggregate of scrutins) {
    for (const l of Object.values(aggregate.byLegislature)) {
      blocking["voteSeatMandateNotFoundOrMissing"] =
        (blocking["voteSeatMandateNotFoundOrMissing"] ?? 0) +
        l.seat.MANDATE_UNKNOWN +
        l.seat.REF_MISSING;
      blocking["voteSeatMandateOfAnotherActor"] =
        (blocking["voteSeatMandateOfAnotherActor"] ?? 0) + l.seat.OTHER_ACTOR;
      blocking["voteSeatMandateNotCoveringDate"] =
        (blocking["voteSeatMandateNotCoveringDate"] ?? 0) + l.seat.DATE_OUTSIDE;
    }
  }
  return {
    blocking,
    informative: { overlapDistinctOrgansOutsideScrutinLegislatures: overlapOutside },
  };
}
