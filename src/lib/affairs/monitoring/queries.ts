import type {
  AffairStatus,
  MonitoringActor,
  MonitoringCheckOutcome,
  MonitoringDateOrigin,
  MonitoringDueReason,
  Prisma,
} from "@/generated/prisma";
import { db } from "@/lib/db";
import { parisDay } from "./cadence";
import { isInScope, needsHumanReason, needsHumanWhere, type NeedsHumanReason } from "./needs-human";

const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_DAYS = 14;
/** Safety bound: the queue is meant to stay far below this. */
export const QUEUE_LIMIT = 200;
const CHECKS_SHOWN = 5;

export type MonitoringQueueRow = {
  affairId: string;
  publicId: string | null;
  title: string;
  politicianName: string;
  status: AffairStatus;
  nextReviewAt: Date;
  dueReason: MonitoringDueReason;
  dueNote: string | null;
  dateOrigin: MonitoringDateOrigin;
  reason: NeedsHumanReason | null;
  pendingProposalId: string | null;
};

const ROW_SELECT = {
  affairId: true,
  nextReviewAt: true,
  dueReason: true,
  dueNote: true,
  dateOrigin: true,
  active: true,
  flaggedReason: true,
  affair: {
    select: {
      publicId: true,
      title: true,
      status: true,
      publicationStatus: true,
      involvement: true,
      politician: { select: { fullName: true } },
    },
  },
} as const;

export async function getMonitoringQueue(now: Date = new Date()): Promise<{
  toHandle: MonitoringQueueRow[];
  upcoming: MonitoringQueueRow[];
  toHandleTotal: number;
  upcomingTotal: number;
}> {
  const today = parisDay(now);
  const horizon = new Date(today.getTime() + UPCOMING_DAYS * DAY_MS);
  const tomorrow = new Date(today.getTime() + DAY_MS);

  const upcomingWhere = {
    active: true,
    affair: { publicationStatus: "PUBLISHED", involvement: "DIRECT" },
    nextReviewAt: { gte: tomorrow, lte: horizon },
    NOT: needsHumanWhere(today),
  } satisfies Prisma.AffairMonitoringWhereInput;

  const [handleRows, upcomingRows, toHandleTotal, upcomingTotal] = await Promise.all([
    db.affairMonitoring.findMany({
      where: needsHumanWhere(today),
      select: ROW_SELECT,
      orderBy: { nextReviewAt: "asc" },
      take: QUEUE_LIMIT,
    }),
    db.affairMonitoring.findMany({
      where: upcomingWhere,
      select: ROW_SELECT,
      orderBy: { nextReviewAt: "asc" },
      take: QUEUE_LIMIT,
    }),
    db.affairMonitoring.count({ where: needsHumanWhere(today) }),
    db.affairMonitoring.count({ where: upcomingWhere }),
  ]);

  const affairIds = handleRows.map((r) => r.affairId);
  const proposals = affairIds.length
    ? await db.affairUpdateProposal.findMany({
        where: { affairId: { in: affairIds }, status: "PENDING" },
        select: { id: true, affairId: true },
        orderBy: { createdAt: "desc" },
        distinct: ["affairId"],
      })
    : [];
  const pendingByAffair = new Map<string, string>();
  for (const p of proposals) {
    if (p.affairId && !pendingByAffair.has(p.affairId)) pendingByAffair.set(p.affairId, p.id);
  }

  const toRow = (r: (typeof handleRows)[number]): MonitoringQueueRow => ({
    affairId: r.affairId,
    publicId: r.affair.publicId,
    title: r.affair.title,
    politicianName: r.affair.politician.fullName,
    status: r.affair.status,
    nextReviewAt: r.nextReviewAt,
    dueReason: r.dueReason,
    dueNote: r.dueNote,
    dateOrigin: r.dateOrigin,
    reason: needsHumanReason(
      {
        active: r.active,
        nextReviewAt: r.nextReviewAt,
        dueReason: r.dueReason,
        flaggedReason: r.flaggedReason,
        affair: r.affair,
      },
      today
    ),
    pendingProposalId: pendingByAffair.get(r.affairId) ?? null,
  });

  return {
    toHandle: handleRows.map(toRow),
    upcoming: upcomingRows.map(toRow),
    toHandleTotal,
    upcomingTotal,
  };
}

export async function countMonitoringToHandle(now: Date = new Date()): Promise<number> {
  return db.affairMonitoring.count({ where: needsHumanWhere(parisDay(now)) });
}

export type AffairMonitoringPanel = {
  monitoring: {
    affairId: string;
    active: boolean;
    nextReviewAt: Date;
    dueReason: MonitoringDueReason;
    dueNote: string | null;
    dateOrigin: MonitoringDateOrigin;
  };
  checks: {
    id: string;
    checkedAt: Date;
    actor: MonitoringActor;
    outcome: MonitoringCheckOutcome;
    note: string | null;
    nextReviewAtAfter: Date | null;
  }[];
  reason: NeedsHumanReason | null;
  /** Publiée et DIRECT : un suivi inactif hors de ce périmètre reprend à la publication. */
  inScope: boolean;
};

export async function getAffairMonitoringPanel(
  affairId: string,
  now: Date = new Date()
): Promise<AffairMonitoringPanel | null> {
  const row = await db.affairMonitoring.findUnique({
    where: { affairId },
    select: {
      affairId: true,
      active: true,
      nextReviewAt: true,
      dueReason: true,
      dueNote: true,
      dateOrigin: true,
      flaggedReason: true,
      affair: { select: { publicationStatus: true, involvement: true } },
      checks: {
        select: {
          id: true,
          checkedAt: true,
          actor: true,
          outcome: true,
          note: true,
          nextReviewAtAfter: true,
        },
        orderBy: { checkedAt: "desc" },
        take: CHECKS_SHOWN,
      },
    },
  });
  if (!row) return null;
  const { affair, checks, flaggedReason, ...monitoring } = row;
  return {
    monitoring,
    checks,
    reason: needsHumanReason({ ...monitoring, flaggedReason, affair }, parisDay(now)),
    inScope: isInScope(affair),
  };
}
