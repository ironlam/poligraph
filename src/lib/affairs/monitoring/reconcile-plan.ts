import type {
  AffairStatus,
  Involvement,
  MonitoringDateOrigin,
  MonitoringDueReason,
  MonitoringFlag,
  PublicationStatus,
} from "@/generated/prisma";
import { OPEN_STATUSES, computeCadenceReview } from "./cadence";
import { isInScope } from "./needs-human";

export type MonitoringState = {
  active: boolean;
  nextReviewAt: Date;
  dueReason: MonitoringDueReason;
  dueNote: string | null;
  dateOrigin: MonitoringDateOrigin;
  statusAtSchedule: AffairStatus;
  flaggedReason: MonitoringFlag | null;
  consecutiveAutoDeferrals: number;
};

export type ReconcilePlan =
  | { kind: "noop" }
  | { kind: "create" | "update"; data: Partial<MonitoringState> };

/**
 * Pure decision: what to write so the monitoring row matches the affair.
 * `today` is a Paris day (00:00 UTC). The caller bumps `version`.
 */
export function planReconcile(
  affair: { status: AffairStatus; publicationStatus: PublicationStatus; involvement: Involvement },
  current: MonitoringState | null,
  today: Date
): ReconcilePlan {
  if (!isInScope(affair)) {
    if (current?.active) return { kind: "update", data: { active: false } };
    return { kind: "noop" };
  }

  const isOpen = OPEN_STATUSES.has(affair.status);

  if (!current) {
    if (!isOpen) return { kind: "noop" };
    return {
      kind: "create",
      data: {
        active: true,
        ...computeCadenceReview(affair.status, today),
        dueNote: null,
        dateOrigin: "CADENCE",
        statusAtSchedule: affair.status,
        flaggedReason: null,
        consecutiveAutoDeferrals: 0,
      },
    };
  }

  const data: Partial<MonitoringState> = {};

  // A closed affair stays inactive, otherwise the daily sweep would revive it.
  if (!current.active) {
    if (!isOpen) return { kind: "noop" };
    data.active = true;
  }

  if (current.statusAtSchedule !== affair.status) {
    data.statusAtSchedule = affair.status;
    data.flaggedReason = null;
    const humanDateInFuture = current.dateOrigin === "HUMAN" && current.nextReviewAt > today;
    if (!humanDateInFuture) {
      // The note described the human date being replaced.
      Object.assign(data, computeCadenceReview(affair.status, today), {
        dueNote: null,
        dateOrigin: "CADENCE",
        consecutiveAutoDeferrals: 0,
      });
    }
  }

  return Object.keys(data).length === 0 ? { kind: "noop" } : { kind: "update", data };
}
