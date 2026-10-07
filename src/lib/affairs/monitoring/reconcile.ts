import { db, type DbTransactionClient } from "@/lib/db";
import { OPEN_STATUSES, parisDay } from "./cadence";
import { planReconcile, type MonitoringState, type ReconcilePlan } from "./reconcile-plan";

const MONITORING_STATE_SELECT = {
  active: true,
  nextReviewAt: true,
  dueReason: true,
  dueNote: true,
  dateOrigin: true,
  statusAtSchedule: true,
  flaggedReason: true,
  consecutiveAutoDeferrals: true,
} as const;

async function applyReconcile(
  tx: DbTransactionClient,
  affairId: string,
  now: Date
): Promise<ReconcilePlan> {
  // Serializes with any concurrent writer of this affair: the daily sweep must not
  // plan from a status that an admin edit is about to replace. Inside the four
  // doors the row is already locked by their own write, so this costs nothing.
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Affair" WHERE id = ${affairId} FOR UPDATE
  `;
  if (locked.length === 0) return { kind: "noop" };

  const affair = await tx.affair.findUnique({
    where: { id: affairId },
    select: {
      status: true,
      publicationStatus: true,
      involvement: true,
      monitoring: { select: MONITORING_STATE_SELECT },
    },
  });
  if (!affair) return { kind: "noop" };

  const plan = planReconcile(affair, affair.monitoring, parisDay(now));
  if (plan.kind === "create") {
    // A create plan always carries the full state (see planReconcile).
    await tx.affairMonitoring.create({
      data: { affairId, ...(plan.data as MonitoringState) },
    });
  } else if (plan.kind === "update") {
    await tx.affairMonitoring.update({
      where: { affairId },
      data: { ...plan.data, version: { increment: 1 } },
    });
  }
  return plan;
}

/** Brings the monitoring row of one affair in line with its status and publication. */
export async function reconcileAffairMonitoring(
  tx: DbTransactionClient,
  affairId: string,
  now: Date = new Date()
): Promise<"noop" | "create" | "update"> {
  return (await applyReconcile(tx, affairId, now)).kind;
}

/**
 * Daily catch-up for the write paths that do not reconcile themselves (bulk,
 * moderation, merge, workbench...). One transaction per affair.
 */
export async function reconcileAllAffairMonitoring(
  now: Date = new Date()
): Promise<{ created: number; updated: number; deactivated: number; failed: number }> {
  const openStatuses = [...OPEN_STATUSES];

  // Sequential on purpose: four concurrent reads cost pool connections (EMAXCONN, 2026-10-01).
  const unmonitored = await db.affair.findMany({
    where: {
      publicationStatus: "PUBLISHED",
      involvement: "DIRECT",
      status: { in: openStatuses },
      monitoring: null,
    },
    select: { id: true },
  });
  const statusDrift = await db.$queryRaw<{ affairId: string }[]>`
    SELECT m."affairId"
    FROM "AffairMonitoring" m
    JOIN "Affair" a ON a.id = m."affairId"
    WHERE m.active = true AND m."statusAtSchedule" <> a.status
  `;
  const outOfScope = await db.affairMonitoring.findMany({
    where: {
      active: true,
      affair: {
        OR: [{ publicationStatus: { not: "PUBLISHED" } }, { involvement: { not: "DIRECT" } }],
      },
    },
    select: { affairId: true },
  });
  const revivable = await db.affairMonitoring.findMany({
    where: {
      active: false,
      affair: {
        publicationStatus: "PUBLISHED",
        involvement: "DIRECT",
        status: { in: openStatuses },
      },
    },
    select: { affairId: true },
  });

  const affairIds = new Set<string>([
    ...unmonitored.map((a) => a.id),
    ...[...statusDrift, ...outOfScope, ...revivable].map((m) => m.affairId),
  ]);

  const counts = { created: 0, updated: 0, deactivated: 0, failed: 0 };
  for (const affairId of affairIds) {
    let plan: ReconcilePlan;
    try {
      plan = await db.$transaction((tx) => applyReconcile(tx, affairId, now));
    } catch (error) {
      // Id only: no title, no name. The next daily run retries this affair.
      counts.failed++;
      console.error("[affair-monitoring] reconcile failed", {
        affairId,
        error: error instanceof Error ? error.name : "unknown",
        // Prisma code (e.g. P2002) when present; never the message.
        code:
          typeof (error as { code?: unknown })?.code === "string"
            ? (error as { code: string }).code
            : undefined,
      });
      continue;
    }
    if (plan.kind === "create") counts.created++;
    else if (plan.kind === "update") {
      if (plan.data.active === false) counts.deactivated++;
      else counts.updated++;
    }
  }
  return counts;
}
