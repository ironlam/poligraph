import type { Prisma } from "@/generated/prisma";

/**
 * Snapshot of an affair about to be absorbed, written to the audit trail in the
 * same transaction as the merge.
 *
 * A merge deletes the absorbed row. Sources, events and article links are moved
 * to the survivor, so they survive; the editorial fields do not. Description,
 * procedural state, dates and sentence data disappeared for good, which is why
 * merges used to be decided by which row was richer rather than by which one was
 * right (#534).
 *
 * That trade-off got worse when merging became a two-click action from the affair
 * page (#623): the panel fixes the direction, so the survivor can no longer be
 * chosen to preserve the fuller description.
 *
 * Not a bin: nothing restores from this. The point is that a mistake stays
 * traceable, not that it can be undone.
 */

/** Bumped whenever a field is added or removed, so a reader knows what they hold. */
export const ABSORBED_SNAPSHOT_VERSION = 1;

/**
 * Exactly what the snapshot needs, and nothing more.
 *
 * Relations are excluded on purpose: they are transferred row by row to the
 * survivor, so copying them here would duplicate live data and inflate the audit
 * table. `originalDescription` is left out too — it is a pre-enrichment rollback
 * artefact, not something the fiche asserted.
 */
export const absorbedAffairSelect = {
  id: true,
  publicId: true,
  slug: true,
  oldSlugs: true,
  title: true,
  description: true,
  category: true,
  status: true,
  involvement: true,
  involvementNote: true,
  subjectLabel: true,
  subjectKind: true,
  subjectNote: true,
  severity: true,
  isRelatedToMandate: true,
  publicationStatus: true,
  factsDate: true,
  startDate: true,
  verdictDate: true,
  court: true,
  caseNumber: true,
  sentence: true,
  prisonMonths: true,
  prisonFirmMonths: true,
  fineAmount: true,
  ineligibilityMonths: true,
  ineligibilityFirmMonths: true,
  communityService: true,
  otherSentence: true,
  confidenceScore: true,
  rejectionReason: true,
  linkedAffairId: true,
} as const satisfies Prisma.AffairSelect;

/** The row shape `absorbedAffairSelect` produces. */
export type AbsorbedAffairRow = Prisma.AffairGetPayload<{
  select: typeof absorbedAffairSelect;
}>;

export interface AbsorbedAffairSnapshot {
  version: number;
  [key: string]: unknown;
}

/**
 * Turns the row into something an audit `changes` column can hold.
 *
 * Dates become ISO strings and the fine becomes a string rather than a number:
 * `fineAmount` is a Postgres decimal, and routing it through a float would lose
 * cents on the exact figures this project exists to state precisely.
 */
export function buildAbsorbedSnapshot(affair: AbsorbedAffairRow): AbsorbedAffairSnapshot {
  const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
  // `?? null` on every optional field rather than trusting the row shape: a stray
  // `undefined` in a Json column vanishes on write, and a snapshot that silently
  // drops the field it was meant to preserve is worse than no snapshot.
  const or = <T>(v: T | null | undefined): T | null => v ?? null;

  return {
    version: ABSORBED_SNAPSHOT_VERSION,
    id: affair.id,
    publicId: or(affair.publicId),
    slug: affair.slug,
    oldSlugs: or(affair.oldSlugs),
    title: affair.title,
    description: affair.description,
    category: affair.category,
    status: affair.status,
    involvement: or(affair.involvement),
    involvementNote: or(affair.involvementNote),
    subjectLabel: or(affair.subjectLabel),
    subjectKind: or(affair.subjectKind),
    subjectNote: or(affair.subjectNote),
    severity: or(affair.severity),
    isRelatedToMandate: or(affair.isRelatedToMandate),
    publicationStatus: or(affair.publicationStatus),
    factsDate: iso(affair.factsDate),
    startDate: iso(affair.startDate),
    verdictDate: iso(affair.verdictDate),
    court: or(affair.court),
    caseNumber: or(affair.caseNumber),
    sentence: or(affair.sentence),
    prisonMonths: or(affair.prisonMonths),
    prisonFirmMonths: or(affair.prisonFirmMonths),
    fineAmount: affair.fineAmount == null ? null : affair.fineAmount.toString(),
    ineligibilityMonths: or(affair.ineligibilityMonths),
    ineligibilityFirmMonths: or(affair.ineligibilityFirmMonths),
    communityService: or(affair.communityService),
    otherSentence: or(affair.otherSentence),
    confidenceScore: or(affair.confidenceScore),
    rejectionReason: or(affair.rejectionReason),
    linkedAffairId: or(affair.linkedAffairId),
  };
}
