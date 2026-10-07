import type {
  Involvement,
  MonitoringDueReason,
  MonitoringFlag,
  Prisma,
  PublicationStatus,
} from "@/generated/prisma";

export type NeedsHumanReason = "SIGNAL" | "GARDE_FOU" | "DATE_ATTENDUE" | "CONTROLE_IMPOSSIBLE";

/** Days of slack before an overdue review is reported as impossible to run. */
const OVERDUE_GRACE_DAYS = 3;
const DATE_DRIVEN_REASONS: MonitoringDueReason[] = ["DELIBERE", "AUDIENCE"];

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC day arithmetic on a Paris day stored at 00:00 UTC. */
function addDays(day: Date, days: number): Date {
  return new Date(day.getTime() + days * DAY_MS);
}

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
  if (DATE_DRIVEN_REASONS.includes(m.dueReason) && m.nextReviewAt <= today) {
    return "DATE_ATTENDUE";
  }
  if (m.nextReviewAt < addDays(today, -OVERDUE_GRACE_DAYS)) return "CONTROLE_IMPOSSIBLE";
  return null;
}

/** Same predicate as `needsHumanReason`, as a Prisma filter. */
export function needsHumanWhere(today: Date): Prisma.AffairMonitoringWhereInput {
  return {
    active: true,
    affair: { publicationStatus: "PUBLISHED", involvement: "DIRECT" },
    OR: [
      { flaggedReason: { not: null } },
      { dueReason: { in: DATE_DRIVEN_REASONS }, nextReviewAt: { lte: today } },
      { nextReviewAt: { lt: addDays(today, -OVERDUE_GRACE_DAYS) } },
    ],
  };
}
