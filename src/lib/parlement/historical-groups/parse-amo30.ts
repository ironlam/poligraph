/**
 * Parser of the AMO30 referential (lot 5, phase 5A-2): group organs, group memberships, seat
 * mandates.
 *
 * Pure: it receives the content of one JSON file already read, never a path. Every record gets an
 * explicit outcome (accepted, rejected with a typed reason, or out of scope), so a caller can check
 * that nothing disappeared: accepted + rejected + out of scope = records read.
 *
 * What it does not do:
 * - read a name: identities are not this parser's concern, and a name has no use here;
 * - decide what a date means: it keeps the published days and the end state, `date-semantics.ts`
 *   interprets them;
 * - apply a correction or fill a gap. An unreadable record is rejected and listed, never repaired.
 */
import { parseCivilDate } from "./civil-date";
import { integerOf, isAbsent, isRecord, listOf, textOf } from "./source-shape";
import {
  asGroupRef,
  asOfficialActorId,
  type CivilDate,
  type EndState,
  type GroupMembershipEvidence,
  type GroupRef,
  type OfficialActorId,
  type OrganKind,
  type StartState,
} from "./types";

export const AMO30_ORGAN_REJECTIONS = [
  "ROOT_MISSING",
  "UID_MISSING",
  "CODE_TYPE_MISSING",
  "LEGISLATURE_MALFORMED",
  "START_DATE_INVALID",
  "END_DATE_INVALID",
  "START_AFTER_END",
] as const;
export type OrganRejection = (typeof AMO30_ORGAN_REJECTIONS)[number];

export const AMO30_MANDATE_REJECTIONS = [
  "NOT_A_RECORD",
  "UID_MISSING",
  "TYPE_ORGANE_MISSING",
  "ACTOR_MISMATCH",
  "ORGAN_REF_MISSING",
  "ORGAN_REF_NOT_SINGLE",
  "LEGISLATURE_MALFORMED",
  "START_DATE_INVALID",
  "END_DATE_INVALID",
  "START_AFTER_END",
] as const;
export type MandateRejection = (typeof AMO30_MANDATE_REJECTIONS)[number];

export const AMO30_ACTOR_REJECTIONS = [
  "ROOT_MISSING",
  "UID_MISSING",
  "MANDATES_MALFORMED",
] as const;
export type ActorRejection = (typeof AMO30_ACTOR_REJECTIONS)[number];

// ---------------------------------------------------------------------------
// Organs
// ---------------------------------------------------------------------------

/** A group organ as published. Its kind is decided later, from two independent signals. */
export interface GroupOrganRecord {
  groupRef: GroupRef;
  legislature: number | null;
  label: string;
  abbreviation: string | null;
  startDate: CivilDate | null;
  endDate: CivilDate | null;
}

export type OrganParse =
  | { status: "ACCEPTED"; organ: GroupOrganRecord }
  | { status: "OUT_OF_SCOPE"; codeType: string; sourceRecordId: string }
  | { status: "REJECTED"; reason: OrganRejection; sourceRecordId: string | null };

type DateRead = { ok: true; value: CivilDate | null } | { ok: false };

function readDate(value: unknown): DateRead {
  if (isAbsent(value)) return { ok: true, value: null };
  const parsed = parseCivilDate(value);
  return parsed === null ? { ok: false } : { ok: true, value: parsed };
}

function readLegislature(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (isAbsent(value)) return { ok: true, value: null };
  const parsed = integerOf(value);
  return parsed === null || parsed === 0 ? { ok: false } : { ok: true, value: parsed };
}

/** `raw` is the content of one organ file: `{ "organe": { ... } }`. */
export function parseOrgane(raw: unknown): OrganParse {
  const organ = isRecord(raw) ? raw["organe"] : undefined;
  if (!isRecord(organ)) return { status: "REJECTED", reason: "ROOT_MISSING", sourceRecordId: null };
  const uid = textOf(organ["uid"]);
  if (uid === null) return { status: "REJECTED", reason: "UID_MISSING", sourceRecordId: null };
  const codeType = textOf(organ["codeType"]);
  if (codeType === null) {
    return { status: "REJECTED", reason: "CODE_TYPE_MISSING", sourceRecordId: uid };
  }
  if (codeType !== "GP") return { status: "OUT_OF_SCOPE", codeType, sourceRecordId: uid };

  const legislature = readLegislature(organ["legislature"]);
  if (!legislature.ok) {
    return { status: "REJECTED", reason: "LEGISLATURE_MALFORMED", sourceRecordId: uid };
  }
  const life = isRecord(organ["viMoDe"]) ? organ["viMoDe"] : {};
  const start = readDate(life["dateDebut"]);
  if (!start.ok) return { status: "REJECTED", reason: "START_DATE_INVALID", sourceRecordId: uid };
  const end = readDate(life["dateFin"]);
  if (!end.ok) return { status: "REJECTED", reason: "END_DATE_INVALID", sourceRecordId: uid };
  if (start.value !== null && end.value !== null && start.value > end.value) {
    return { status: "REJECTED", reason: "START_AFTER_END", sourceRecordId: uid };
  }
  return {
    status: "ACCEPTED",
    organ: {
      groupRef: asGroupRef(uid),
      legislature: legislature.value,
      label: textOf(organ["libelle"]) ?? "",
      abbreviation: textOf(organ["libelleAbrege"]),
      startDate: start.value,
      endDate: end.value,
    },
  };
}

// ---------------------------------------------------------------------------
// Actors and their mandates
// ---------------------------------------------------------------------------

/** The seat mandate of a deputy. Only what the vote link and the coverage check need. */
export interface SeatMandateRecord {
  sourceRecordId: string;
  officialId: OfficialActorId;
  legislature: number | null;
  startDate: CivilDate | null;
  endDate: CivilDate | null;
}

export type MandateParse =
  | { status: "GROUP"; membership: GroupMembershipEvidence }
  | { status: "SEAT"; seat: SeatMandateRecord }
  | { status: "OUT_OF_SCOPE"; typeOrgane: string }
  | {
      status: "REJECTED";
      reason: MandateRejection;
      typeOrgane: string | null;
      sourceRecordId: string | null;
    };

export interface MandateReject {
  reason: MandateRejection;
  typeOrgane: string | null;
  sourceRecordId: string | null;
}

export type ActorParse =
  | {
      status: "ACCEPTED";
      officialId: OfficialActorId;
      memberships: GroupMembershipEvidence[];
      seats: SeatMandateRecord[];
      rejectedMandates: MandateReject[];
      outOfScopeMandates: number;
      mandateTotal: number;
    }
  | { status: "REJECTED"; reason: ActorRejection; sourceRecordId: string | null };

function parseMandate(raw: unknown, actor: OfficialActorId): MandateParse {
  if (!isRecord(raw)) {
    return { status: "REJECTED", reason: "NOT_A_RECORD", typeOrgane: null, sourceRecordId: null };
  }
  const uid = textOf(raw["uid"]);
  const typeOrgane = textOf(raw["typeOrgane"]);
  const reject = (reason: MandateRejection): MandateParse => ({
    status: "REJECTED",
    reason,
    typeOrgane,
    sourceRecordId: uid,
  });
  if (uid === null) return reject("UID_MISSING");
  if (typeOrgane === null) return reject("TYPE_ORGANE_MISSING");
  if (typeOrgane !== "GP" && typeOrgane !== "ASSEMBLEE") {
    return { status: "OUT_OF_SCOPE", typeOrgane };
  }
  if (textOf(raw["acteurRef"]) !== actor) return reject("ACTOR_MISMATCH");

  const legislature = readLegislature(raw["legislature"]);
  if (!legislature.ok) return reject("LEGISLATURE_MALFORMED");
  const start = readDate(raw["dateDebut"]);
  if (!start.ok) return reject("START_DATE_INVALID");
  const end = readDate(raw["dateFin"]);
  if (!end.ok) return reject("END_DATE_INVALID");
  if (start.value !== null && end.value !== null && start.value > end.value) {
    return reject("START_AFTER_END");
  }

  if (typeOrgane === "ASSEMBLEE") {
    return {
      status: "SEAT",
      seat: {
        sourceRecordId: uid,
        officialId: actor,
        legislature: legislature.value,
        startDate: start.value,
        endDate: end.value,
      },
    };
  }

  // A group membership names exactly one organ. A list is never resolved by picking an element.
  const organs = raw["organes"];
  if (!isRecord(organs) || isAbsent(organs["organeRef"])) return reject("ORGAN_REF_MISSING");
  const organRef = textOf(organs["organeRef"]);
  if (organRef === null) {
    return reject(
      Array.isArray(organs["organeRef"]) ? "ORGAN_REF_NOT_SINGLE" : "ORGAN_REF_MISSING"
    );
  }
  const quality = isRecord(raw["infosQualite"]) ? textOf(raw["infosQualite"]["codeQualite"]) : null;
  const principal = raw["nominPrincipale"];
  const startState: StartState = start.value === null ? "UNKNOWN" : "DATED";
  const endState: EndState = end.value === null ? "OPEN_AT_SNAPSHOT" : "DATED";
  return {
    status: "GROUP",
    membership: {
      sourceRecordId: uid,
      officialId: actor,
      chamber: "AN",
      groupRef: asGroupRef(organRef),
      legislature: legislature.value,
      qualityCode: quality,
      isPrincipal: principal === "1" ? true : principal === "0" ? false : null,
      startDate: start.value,
      startState,
      endDate: end.value,
      endState,
    },
  };
}

/** `raw` is the content of one actor file: `{ "acteur": { ... } }`. */
export function parseActeur(raw: unknown): ActorParse {
  const actor = isRecord(raw) ? raw["acteur"] : undefined;
  if (!isRecord(actor)) return { status: "REJECTED", reason: "ROOT_MISSING", sourceRecordId: null };
  const uid = textOf(actor["uid"]);
  if (uid === null) return { status: "REJECTED", reason: "UID_MISSING", sourceRecordId: null };

  // `mandats` is `null`, or an object whose `mandat` is `null`, one object or a list.
  const container = actor["mandats"];
  let rawMandates: unknown[];
  if (isAbsent(container)) {
    rawMandates = [];
  } else if (isRecord(container)) {
    rawMandates = listOf(container["mandat"]);
  } else {
    return { status: "REJECTED", reason: "MANDATES_MALFORMED", sourceRecordId: uid };
  }

  const officialId = asOfficialActorId(uid);
  const memberships: GroupMembershipEvidence[] = [];
  const seats: SeatMandateRecord[] = [];
  const rejectedMandates: MandateReject[] = [];
  let outOfScopeMandates = 0;
  for (const rawMandate of rawMandates) {
    const parsed = parseMandate(rawMandate, officialId);
    if (parsed.status === "GROUP") memberships.push(parsed.membership);
    else if (parsed.status === "SEAT") seats.push(parsed.seat);
    else if (parsed.status === "OUT_OF_SCOPE") outOfScopeMandates += 1;
    else {
      rejectedMandates.push({
        reason: parsed.reason,
        typeOrgane: parsed.typeOrgane,
        sourceRecordId: parsed.sourceRecordId,
      });
    }
  }
  return {
    status: "ACCEPTED",
    officialId,
    memberships,
    seats,
    rejectedMandates,
    outOfScopeMandates,
    mandateTotal: rawMandates.length,
  };
}

// ---------------------------------------------------------------------------
// Organ kind: two independent signals, or no conclusion
// ---------------------------------------------------------------------------

/** What the mandates of an organ say about non-registration. */
export type QualitySignal = "NON_INSCRIT" | "GROUP_MEMBER" | "MIXED" | "NO_MANDATES";
/** What the abbreviation and the label of an organ say. They must agree to count as a signal. */
export type NameSignal = "NON_INSCRIT" | "GROUP" | "DISAGREE";

export const NON_INSCRIT_QUALITY = "Député non-inscrit";
const NON_INSCRIT_LABEL =
  /non[ -]inscrits?|n'appartenant à aucun groupe|n’appartenant à aucun groupe/i;

export interface ClassifiedOrgan {
  organ: GroupOrganRecord;
  nameSignal: NameSignal;
  qualitySignal: QualitySignal;
  /** `null` when the two signals do not allow a conclusion. The source values stay in `organ`. */
  kind: OrganKind | null;
  /** Set exactly when `kind` is `null`. */
  diagnostic: "NI_SIGNALS_CONFLICT" | "NI_SIGNAL_UNCONFIRMED" | null;
}

function nameSignalOf(organ: GroupOrganRecord): NameSignal {
  const byAbbreviation = organ.abbreviation === "NI";
  const byLabel = NON_INSCRIT_LABEL.test(organ.label);
  if (byAbbreviation && byLabel) return "NON_INSCRIT";
  if (!byAbbreviation && !byLabel) return "GROUP";
  return "DISAGREE";
}

function qualitySignalOf(qualities: readonly (string | null)[]): QualitySignal {
  if (qualities.length === 0) return "NO_MANDATES";
  const nonInscrit = qualities.filter((q) => q === NON_INSCRIT_QUALITY).length;
  if (nonInscrit === qualities.length) return "NON_INSCRIT";
  return nonInscrit === 0 ? "GROUP_MEMBER" : "MIXED";
}

/**
 * A non-registration is attested only when the name of the organ and the quality of every mandate
 * in it both say so. Two group signals make a group; a group organ with no mandates stays a group
 * because nothing contradicts its name. Anything else is a conflict or an unconfirmed signal, and
 * the organ is kept unclassified instead of being given a kind.
 */
export function classifyGroupOrgans(
  organs: readonly GroupOrganRecord[],
  memberships: readonly GroupMembershipEvidence[]
): ClassifiedOrgan[] {
  const qualities = new Map<GroupRef, (string | null)[]>();
  for (const membership of memberships) {
    const list = qualities.get(membership.groupRef);
    if (list) list.push(membership.qualityCode);
    else qualities.set(membership.groupRef, [membership.qualityCode]);
  }
  return organs.map((organ): ClassifiedOrgan => {
    const nameSignal = nameSignalOf(organ);
    const qualitySignal = qualitySignalOf(qualities.get(organ.groupRef) ?? []);
    const done = (kind: OrganKind): ClassifiedOrgan => ({
      organ,
      nameSignal,
      qualitySignal,
      kind,
      diagnostic: null,
    });
    const open = (
      diagnostic: "NI_SIGNALS_CONFLICT" | "NI_SIGNAL_UNCONFIRMED"
    ): ClassifiedOrgan => ({
      organ,
      nameSignal,
      qualitySignal,
      kind: null,
      diagnostic,
    });
    if (nameSignal === "NON_INSCRIT" && qualitySignal === "NON_INSCRIT") return done("NON_INSCRIT");
    if (nameSignal === "NON_INSCRIT" && qualitySignal === "NO_MANDATES") {
      return open("NI_SIGNAL_UNCONFIRMED");
    }
    if (
      nameSignal === "GROUP" &&
      (qualitySignal === "GROUP_MEMBER" || qualitySignal === "NO_MANDATES")
    ) {
      return done("GROUP");
    }
    return open("NI_SIGNALS_CONFLICT");
  });
}
