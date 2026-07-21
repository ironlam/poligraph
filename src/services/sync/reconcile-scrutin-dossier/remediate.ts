/**
 * Remediation Phase A: per-scrutin DB repair applied to a reconciler transition
 * (see ./types ScrutinDossierTransition, produced by Task 4's reconcileScrutinDossier).
 *
 * Unpublish-first: resolvePublicTitle (src/lib/votes/resolve-public-title.ts) only
 * shows a policy title publicly when status === "APPROVED". Setting the row to
 * STALE therefore unpublishes it immediately, before anything about the dossier
 * link is touched. Every code path below (repaired, linkless, or blocked) leaves
 * an APPROVED title STALE, because the officialTitleSnapshot/policyTitle were
 * generated against the wrong dossier's amendments and can no longer be trusted.
 *
 * Two transaction boundaries:
 * - A1 (this file, tx client): idempotent invalidation snapshot + STALE + the
 *   Scrutin.dossierLegislatifId write + TITLE_REGEX link cleanup + the MANUAL
 *   link compatibility check. All-or-nothing.
 * - Between A1 and A2: linkScrutinsToAmendments runs OUTSIDE any transaction,
 *   because it uses the global `db` client internally (see
 *   @/services/sync/link-scrutins-to-amendments) and has no way to accept a
 *   transaction client. Re-linking after a dossier repoint can touch many rows
 *   and is idempotent on its own (composite PK + skipDuplicates), so it does not
 *   need A1's atomicity.
 * - A2 (this file, global db client): a single write deciding the title's
 *   regenerationStatus from the links that resulted from the re-link.
 */
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import { linkScrutinsToAmendments } from "@/services/sync/link-scrutins-to-amendments";
import { generateScrutinPolicyTitle } from "@/services/scrutin-policy-title";
import type { ScrutinDossierTransition } from "./types";

export const LINKLESS_WARNING = "DOSSIER_RECONCILIATION_LINKLESS";

export type RepairStatus =
  | "PENDING"
  | "DB_REPAIRED"
  | "BLOCKED_MANUAL_LINK"
  | "REGENERATED"
  | "REGEN_FAILED";

const INVALIDATION_ACTION = "dossier_reconciliation_invalidated";

/**
 * Merges a warning code into a currentWarnings JSON array without duplicating
 * it and without dropping any other warning already present. Only the code is
 * stored: unlike the richer { code, severity, message } GenerationWarning shape
 * used by the title generator (src/services/scrutin-policy-title/types.ts), the
 * reconciliation warning carries no severity/message here. Existing consumers
 * (WarningsPanel, approve-guard, the admin queue filters) tolerate a missing
 * severity/message (they render/compare as undefined, they do not throw), but a
 * maintainer may want to enrich this to the full shape in a follow-up.
 */
function mergeWarning(current: unknown, code: string): Prisma.InputJsonValue {
  const arr = Array.isArray(current) ? (current as { code?: string }[]) : [];
  if (arr.some((w) => w?.code === code)) return arr as unknown as Prisma.InputJsonValue;
  return [...arr, { code }] as unknown as Prisma.InputJsonValue;
}

export async function repairScrutinDossier(
  t: ScrutinDossierTransition,
  repairRunId: string
): Promise<{ scrutinId: string; repairStatus: RepairStatus; linkless: boolean }> {
  // --- Transaction A1: unpublish-first + dossier write + delete TITLE_REGEX links ---
  let blocked = false;
  await db.$transaction(async (tx) => {
    const title = await tx.scrutinPolicyTitle.findUnique({ where: { scrutinId: t.scrutinId } });
    if (title) {
      // Idempotency check: was a "dossier_reconciliation_invalidated" revision for
      // this exact repairRunId already written for this title? We check this in
      // JS rather than with a Postgres JSON-path WHERE filter
      // (snapshot: { path: ["repairRunId"], equals: repairRunId }). That filter
      // type-checks fine against Prisma's JsonFilterBase for the postgresql
      // provider, but there is no DATABASE_URL available in this environment to
      // confirm it actually executes as expected through the Prisma 7
      // driver-adapter (adapter-pg) query compiler, and this codebase has no
      // prior usage of JSON-path filtering to fall back on. The revision count
      // per title is small (one invalidation per repair run at most), so loading
      // them and comparing repairRunId in JS is simple and has no such risk.
      const priorInvalidations = await tx.scrutinPolicyTitleRevision.findMany({
        where: { policyTitleId: title.id, action: INVALIDATION_ACTION },
        select: { snapshot: true },
      });
      const already = priorInvalidations.some(
        (r) => (r.snapshot as { repairRunId?: string } | null)?.repairRunId === repairRunId
      );
      if (!already) {
        await tx.scrutinPolicyTitleRevision.create({
          data: {
            policyTitleId: title.id,
            action: INVALIDATION_ACTION,
            snapshot: {
              ...(title as unknown as object),
              repairRunId,
              transitionAction: t.action,
              previousDossierId: t.previousDossierId,
              appliedDossierId: t.appliedDossierId,
            } as Prisma.InputJsonValue,
          },
        });
      }
      if (title.status !== "STALE") {
        await tx.scrutinPolicyTitle.update({ where: { id: title.id }, data: { status: "STALE" } });
      }
    }

    // Incompatible MANUAL link check: a human curated this link, so a dossier
    // change that no longer matches it must block rather than silently drop it.
    const manual = await tx.scrutinAmendment.findMany({
      where: { scrutinId: t.scrutinId, source: "MANUAL" },
      select: { amendmentId: true, amendment: { select: { dossierId: true } } },
    });
    const incompatible = manual.some((m) => m.amendment.dossierId !== t.appliedDossierId);
    if (incompatible) {
      blocked = true;
      return; // Leave the title STALE (already applied above); no dossier/link mutation.
    }

    await tx.scrutin.update({
      where: { id: t.scrutinId },
      data: { dossierLegislatifId: t.appliedDossierId },
    });
    await tx.scrutinAmendment.deleteMany({
      where: { scrutinId: t.scrutinId, source: "TITLE_REGEX" },
    });
  });

  if (blocked)
    return { scrutinId: t.scrutinId, repairStatus: "BLOCKED_MANUAL_LINK", linkless: false };

  // --- Re-link OUTSIDE the transaction: linkScrutinsToAmendments uses the global
  //     `db` client internally and cannot be handed a transaction client. Guarded:
  //     if it throws, A2 below must still run so a failed re-link (0 links) is
  //     converted into the self-healing linkless case instead of leaving the
  //     title STALE + idle with no LINKLESS_WARNING (invisible to the requeue scan). ---
  if (t.appliedDossierId !== null) {
    try {
      await linkScrutinsToAmendments({ scrutinIds: [t.scrutinId] });
    } catch (err) {
      console.error(`repairScrutinDossier: re-link failed for ${t.externalId}`, err);
    }
  }

  // --- Transaction A2: title lifecycle from the links that resulted from the re-link ---
  const linkCount = await db.scrutinAmendment.count({ where: { scrutinId: t.scrutinId } });
  const title = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId: t.scrutinId } });
  if (title) {
    if (linkCount > 0) {
      await db.scrutinPolicyTitle.update({
        where: { id: title.id },
        data: { status: "STALE", regenerationStatus: "queued" },
      });
    } else {
      await db.scrutinPolicyTitle.update({
        where: { id: title.id },
        data: {
          status: "STALE",
          regenerationStatus: "idle",
          currentWarnings: mergeWarning(title.currentWarnings, LINKLESS_WARNING),
        },
      });
    }
  }
  return { scrutinId: t.scrutinId, repairStatus: "DB_REPAIRED", linkless: linkCount === 0 };
}

/**
 * Durable recovery for the linkless case above: a scrutin repaired while its
 * amendment was not yet imported is left STALE + idle + LINKLESS_WARNING,
 * with no link. When the normal amendment linker later creates that link,
 * dossier reconciliation returns NOOP for this scrutin (nothing changed on
 * its dossier pointer), so nothing requeues the title on its own. This scan
 * finds those now-linked titles, queues regeneration, and prunes the warning.
 *
 * Same JS-filter choice as repairScrutinDossier's idempotency check above: we
 * select on { status, regenerationStatus, scrutin.amendmentLinks.some } only
 * and filter/prune the LINKLESS_WARNING code in JS, rather than a Postgres
 * JSON-path WHERE filter (currentWarnings: { array_contains: [...] }). That
 * filter is unverified against this codebase's Prisma 7 driver-adapter
 * (adapter-pg) without a DATABASE_URL to confirm it, and there is no prior
 * usage of JSON-path filtering here to fall back on. The candidate set
 * (STALE + idle titles) is bounded by `limit`, so loading currentWarnings and
 * checking/pruning the code in JS carries no meaningful cost.
 *
 * `scrutinIds` is optional scoping for the #477 staged backfill (see
 * scripts/backfill-scrutin-dossier-477.ts): when provided, only titles for
 * those scrutins are considered. The daily sync caller never passes it, so
 * its behavior (global scan) is unchanged.
 */
export async function requeueLinklessTitlesWithLinks(
  limit = 500,
  scrutinIds?: string[]
): Promise<number> {
  const candidates = await db.scrutinPolicyTitle.findMany({
    where: {
      status: "STALE",
      regenerationStatus: "idle",
      scrutin: { amendmentLinks: { some: {} } },
      ...(scrutinIds ? { scrutinId: { in: scrutinIds } } : {}),
    },
    select: { id: true, currentWarnings: true },
    take: limit,
  });

  let n = 0;
  for (const c of candidates) {
    const warnings = Array.isArray(c.currentWarnings)
      ? (c.currentWarnings as { code?: string }[])
      : [];
    if (!warnings.some((w) => w?.code === LINKLESS_WARNING)) continue;

    const pruned = warnings.filter((w) => w?.code !== LINKLESS_WARNING);
    await db.scrutinPolicyTitle.update({
      where: { id: c.id },
      data: {
        regenerationStatus: "queued",
        currentWarnings: pruned as unknown as Prisma.InputJsonValue,
      },
    });
    n++;
  }
  return n;
}

/**
 * Phase B: regeneration drain for the STALE ∧ queued rows Phase A produces
 * (repairScrutinDossier, requeueLinklessTitlesWithLinks). "STALE" is what tells
 * this drain apart from the substance-drift regeneration queue: that queue only
 * ever moves DRAFT/NEEDS_REVIEW rows to "queued" (see
 * policy-title-substance-drift-plan.ts), never STALE, so the two selectors can
 * never pick up the same row. No extra guard is needed for that.
 *
 * A worker can crash or be killed mid-regeneration, leaving a row stuck at
 * regenerationStatus "running" forever. reclaimAbandonedRegen resets any such
 * row back to "queued" once it has been running longer than the timeout, so
 * the next drain pass picks it up again. It only ever touches rows that are
 * still STALE: a row that finished regenerating is no longer STALE (the
 * generator's write moves status to DRAFT/NEEDS_REVIEW), so a successful run
 * can never be clobbered by this reclaim.
 */
export const REGEN_RUNNING_TIMEOUT_MS = 15 * 60 * 1000;

/** Bound on the daily sync's regen drain step, so one cron run cannot burn
 *  through the whole backlog of Mistral calls in one pass. */
export const DAILY_DOSSIER_REGEN_LIMIT = 10;

export async function reclaimAbandonedRegen(): Promise<number> {
  const cutoff = new Date(Date.now() - REGEN_RUNNING_TIMEOUT_MS);
  const { count } = await db.scrutinPolicyTitle.updateMany({
    where: { status: "STALE", regenerationStatus: "running", updatedAt: { lt: cutoff } },
    data: { regenerationStatus: "queued" },
  });
  return count;
}

/**
 * Marks a claimed row "failed" so reclaimAbandonedRegen (which only requeues
 * rows still "running") does not loop it forever. Guarded on its own: a
 * transient DB error here must not abort the rest of the drain pass, so it
 * try/catches and logs rather than throwing.
 */
async function markRegenFailed(policyTitleId: string, message: string): Promise<void> {
  try {
    await db.scrutinPolicyTitle.update({
      where: { id: policyTitleId },
      data: { regenerationStatus: "failed", regenerationError: message },
    });
  } catch (err) {
    console.error(
      `drainDossierRepointRegen: failed to mark policy title ${policyTitleId} as failed`,
      err
    );
  }
}

/**
 * Drains up to `limit` STALE ∧ queued ∧ has-links rows through the real
 * generator, oldest first. The daily drain and a manual backfill run can
 * overlap, so each row is claimed atomically before being processed: the
 * claim update's WHERE re-checks { id, status: "STALE", regenerationStatus:
 * "queued" }, and if `updateMany`'s count comes back 0 another worker already
 * flipped it to "running" between the select above and this claim, so this
 * worker skips it rather than double-processing it. `claimed` only counts rows
 * this worker actually won.
 *
 * Uses the SINGULAR generator (@/services/scrutin-policy-title), not the batch
 * wrapper (@/services/sync/generate-scrutin-policy-titles): the batch wrapper
 * ANDs an unconditional `legislature: 17, chamber: "AN"` into its own query, so
 * a SENAT or non-legislature-17 row would silently match zero scrutins and
 * never reach the generator at all. The singular generator does a plain
 * findUnique by id, with no such filter.
 *
 * A clean (non-throwing) return from the generator is not proof a write
 * happened: the link gate can return `outcome: "skipped", written: false` if
 * the links vanished between the select above and this call. Only a truthy
 * `result.written` counts as regenerated; on success the row's
 * regenerationStatus is NOT re-set here, because force + the generator's own
 * write already sets it to "idle" atomically as part of the same persist that
 * writes the new DRAFT/NEEDS_REVIEW row (see writePolicyTitleRow in
 * @/services/scrutin-policy-title). A no-write outcome is treated the same as
 * a throw: the row is marked "failed" so it does not stay stuck at "running"
 * forever. createRevision is false because Phase A already snapshotted the
 * prior APPROVED state as a "dossier_reconciliation_invalidated" revision; a
 * second "regenerated" revision here would be redundant.
 *
 * `opts.scrutinIds` is optional scoping for the #477 staged backfill (see
 * scripts/backfill-scrutin-dossier-477.ts): when provided, only rows for
 * those scrutins are drained, so a scoped Stage-1 run never touches
 * out-of-scope rows. The daily sync caller never passes it, so its behavior
 * (global drain) is unchanged.
 */
export async function drainDossierRepointRegen(
  opts: { limit?: number; scrutinIds?: string[] } = {}
): Promise<{ claimed: number; regenerated: number; failed: number }> {
  const limit = opts.limit ?? 10;
  const queue = await db.scrutinPolicyTitle.findMany({
    where: {
      status: "STALE",
      regenerationStatus: "queued",
      scrutin: { amendmentLinks: { some: {} } },
      ...(opts.scrutinIds ? { scrutinId: { in: opts.scrutinIds } } : {}),
    },
    select: { id: true, scrutinId: true },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  let claimed = 0;
  let regenerated = 0;
  let failed = 0;
  for (const row of queue) {
    const claim = await db.scrutinPolicyTitle.updateMany({
      where: { id: row.id, status: "STALE", regenerationStatus: "queued" },
      data: { regenerationStatus: "running", regenerationError: null },
    });
    if (claim.count === 0) continue; // another worker already claimed this row
    claimed++;

    try {
      const result = await generateScrutinPolicyTitle(row.scrutinId, {
        force: true,
        createRevision: false,
      });
      if (result.written) {
        regenerated++;
      } else {
        failed++;
        await markRegenFailed(
          row.id,
          `regeneration produced no write (outcome=${result.outcome}${
            result.skipReason ? `, ${result.skipReason}` : ""
          })`
        );
      }
    } catch (err) {
      failed++;
      await markRegenFailed(row.id, String(err));
    }
  }
  return { claimed, regenerated, failed };
}
