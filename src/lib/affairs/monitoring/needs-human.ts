import type {
  Involvement,
  MonitoringDueReason,
  MonitoringFlag,
  Prisma,
  PublicationStatus,
} from "@/generated/prisma";

export type NeedsHumanReason = "SIGNAL" | "GARDE_FOU" | "DATE_ATTENDUE" | "ECHUE";

/** Due reasons that carry a date announced for the affair, rather than a routine check. */
const DATE_DRIVEN_REASONS: MonitoringDueReason[] = ["DELIBERE", "AUDIENCE"];

export function isInScope(a: {
  publicationStatus: PublicationStatus;
  involvement: Involvement;
}): boolean {
  return a.publicationStatus === "PUBLISHED" && a.involvement === "DIRECT";
}

/** `today` is a Paris day (00:00 UTC). Must stay equivalent to `needsHumanWhere`. */
export function needsHumanReason(
  m: {
    active: boolean;
    nextReviewAt: Date;
    dueReason: MonitoringDueReason;
    flaggedReason: MonitoringFlag | null;
    affair: { publicationStatus: PublicationStatus; involvement: Involvement };
  },
  today: Date
): NeedsHumanReason | null {
  if (!m.active || !isInScope(m.affair)) return null;
  if (m.flaggedReason) return m.flaggedReason;
  // No automatic pass yet: a review is due to a human on its day.
  if (m.nextReviewAt > today) return null;
  return DATE_DRIVEN_REASONS.includes(m.dueReason) ? "DATE_ATTENDUE" : "ECHUE";
}

/** Same predicate as `needsHumanReason`, as a Prisma filter. */
export function needsHumanWhere(today: Date): Prisma.AffairMonitoringWhereInput {
  return {
    active: true,
    affair: { publicationStatus: "PUBLISHED", involvement: "DIRECT" },
    OR: [{ flaggedReason: { not: null } }, { nextReviewAt: { lte: today } }],
  };
}
