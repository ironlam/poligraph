import { Prisma } from "@/generated/prisma";
import { db, type DbTransactionClient } from "@/lib/db";
import {
  computeCadenceReview,
  parisDay,
  TERMINAL_STATUSES,
} from "@/lib/affairs/monitoring/cadence";
import { isInScope } from "@/lib/affairs/monitoring/needs-human";

export type MonitoringActionResult =
  | { ok: true; deduped: boolean }
  | { ok: false; reason: "not_found" | "no_monitoring" | "date_not_future" | "key_conflict" };

const AFFAIR_SELECT = {
  status: true,
  publicationStatus: true,
  involvement: true,
  monitoring: { select: { id: true, dueReason: true } },
} as const;

/**
 * Same lock order as the reconcile pass: affair row first, then monitoring row.
 * Returns null when the affair does not exist.
 */
async function lockAndLoad(tx: DbTransactionClient, affairId: string) {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Affair" WHERE id = ${affairId} FOR NO KEY UPDATE
  `;
  if (locked.length === 0) return null;
  await tx.$queryRaw`SELECT id FROM "AffairMonitoring" WHERE "affairId" = ${affairId} FOR UPDATE`;
  return tx.affair.findUnique({ where: { id: affairId }, select: AFFAIR_SELECT });
}

class DuplicateCheck extends Error {}
class KeyConflict extends Error {}

function targetsCheckKey(error: Prisma.PrismaClientKnownRequestError): boolean {
  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.includes("checkKey")
    : String(target ?? "").includes("checkKey");
}

/** Runs the writes in one transaction; a duplicate check key rolls everything back. */
async function runIdempotent(
  work: (tx: DbTransactionClient) => Promise<MonitoringActionResult>
): Promise<MonitoringActionResult> {
  try {
    return await db.$transaction(work);
  } catch (error) {
    if (error instanceof DuplicateCheck) return { ok: true, deduped: true };
    if (error instanceof KeyConflict) return { ok: false, reason: "key_conflict" };
    // Requests on one affair are serialized by its lock, so a unique violation on the
    // key can only come from a concurrent request on another affair.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      targetsCheckKey(error)
    ) {
      return { ok: false, reason: "key_conflict" };
    }
    throw error;
  }
}

/** Under the affair lock, so no second write can slip in after a duplicate is seen. */
async function assertNewCheck(tx: DbTransactionClient, checkKey: string, affairId: string) {
  const existing = await tx.affairMonitoringCheck.findUnique({
    where: { checkKey },
    select: { monitoring: { select: { affairId: true } } },
  });
  if (!existing) return;
  throw existing.monitoring.affairId === affairId ? new DuplicateCheck() : new KeyConflict();
}

export async function markReviewedNoChange(input: {
  affairId: string;
  requestKey: string;
  actorId: string;
  now?: Date;
}): Promise<MonitoringActionResult> {
  const now = input.now ?? new Date();
  const checkKey = `human:${input.requestKey}`;
  return runIdempotent(async (tx) => {
    const affair = await lockAndLoad(tx, input.affairId);
    if (!affair) return { ok: false, reason: "not_found" };
    if (!affair.monitoring) return { ok: false, reason: "no_monitoring" };
    await assertNewCheck(tx, checkKey, input.affairId);

    // A terminal affair past its appeal window leaves the follow-up for good.
    const deactivate =
      affair.monitoring.dueReason === "DELAI_RECOURS" && TERMINAL_STATUSES.has(affair.status);
    const next = deactivate ? null : computeCadenceReview(affair.status, parisDay(now));

    await tx.affairMonitoringCheck.create({
      data: {
        monitoringId: affair.monitoring.id,
        checkKey,
        actor: "HUMAN",
        actorId: input.actorId,
        outcome: "NO_CHANGE",
        nextReviewAtAfter: next?.nextReviewAt ?? null,
      },
    });
    await tx.affairMonitoring.update({
      where: { affairId: input.affairId },
      data: {
        ...(next
          ? { nextReviewAt: next.nextReviewAt, dueReason: next.dueReason }
          : { active: false }),
        dateOrigin: "CADENCE",
        statusAtSchedule: affair.status,
        flaggedReason: null,
        consecutiveAutoDeferrals: 0,
        lastCheckedAt: now,
        version: { increment: 1 },
      },
    });
    return { ok: true, deduped: false };
  });
}

export async function deferReview(input: {
  affairId: string;
  requestKey: string;
  actorId: string;
  nextReviewAt: Date;
  dueReason: "DELIBERE" | "AUDIENCE" | "MANUEL";
  dueNote?: string | null;
  now?: Date;
}): Promise<MonitoringActionResult> {
  const now = input.now ?? new Date();
  const checkKey = `human:${input.requestKey}`;
  if (input.nextReviewAt.getTime() <= parisDay(now).getTime()) {
    return { ok: false, reason: "date_not_future" };
  }
  return runIdempotent(async (tx) => {
    const affair = await lockAndLoad(tx, input.affairId);
    if (!affair) return { ok: false, reason: "not_found" };
    await assertNewCheck(tx, checkKey, input.affairId);

    const state = {
      nextReviewAt: input.nextReviewAt,
      dueReason: input.dueReason,
      dueNote: input.dueNote ?? null,
      dateOrigin: "HUMAN" as const,
      statusAtSchedule: affair.status,
      flaggedReason: null,
      consecutiveAutoDeferrals: 0,
      lastCheckedAt: now,
    };
    const monitoring = affair.monitoring
      ? await tx.affairMonitoring.update({
          where: { affairId: input.affairId },
          data: { ...state, active: isInScope(affair), version: { increment: 1 } },
          select: { id: true },
        })
      : await tx.affairMonitoring.create({
          data: { affairId: input.affairId, active: isInScope(affair), ...state, version: 1 },
          select: { id: true },
        });

    await tx.affairMonitoringCheck.create({
      data: {
        monitoringId: monitoring.id,
        checkKey,
        actor: "HUMAN",
        actorId: input.actorId,
        outcome: "DEFERRED",
        note: input.dueNote ?? null,
        nextReviewAtAfter: input.nextReviewAt,
      },
    });
    return { ok: true, deduped: false };
  });
}
