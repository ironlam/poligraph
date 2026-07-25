/**
 * Affair reconciliation service.
 *
 * Detects potential duplicate affairs and folds the ones automation is allowed to
 * fold: draft pairs, and nothing else. Since detection was widened to published
 * affairs (issue #525), the queue mixes those with pairs that must never move
 * without a human, so every pair goes through decideMergeAction() first.
 *
 * Nothing crosses the published boundary here. Absorbing a draft into a published
 * fiche is still supported, by `absorbDraftIntoPublished()`, but only from a
 * confirmed admin action.
 */

import {
  findPotentialDuplicates,
  mergeAffairs,
  type PotentialDuplicate,
} from "@/services/affairs/reconciliation";
import { decideMergeAction, type MergeDecision } from "@/services/affairs/merge-decision";
import { db } from "@/lib/db";
import { invalidateEntity, invalidateAffectedPoliticians } from "@/lib/cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReconcileAffairsOptions {
  dryRun?: boolean;
  autoMerge?: boolean;
}

export interface ReconcileAffairsStats {
  duplicatesFound: number;
  /** Draft pairs folded together. The only merge this path performs. */
  merged: number;
  /** Pairs left for a human, by reason. */
  reviewRequired: number;
  notEligible: number;
  /** Proposals opened because a draft stated something the published fiche did not. */
  proposalsCreated: number;
  errors: number;
  remainingPossible: number;
}

/**
 * Refreshes what a merge made stale.
 *
 * The admin routes already do this; the cron path did not, so an automatic merge
 * left the deleted affair's page and the person's profile served from cache.
 * Runs once after all merges rather than per merge, and only when at least one
 * landed.
 */
async function invalidateAfterMerges(survivorIds: string[]): Promise<void> {
  if (survivorIds.length === 0) return;

  invalidateEntity("affair");

  const survivors = await db.affair.findMany({
    where: { id: { in: [...new Set(survivorIds)] } },
    select: { politician: { select: { slug: true } } },
  });
  invalidateAffectedPoliticians(survivors.map((a) => a.politician?.slug));
}

interface PlannedPair {
  pair: PotentialDuplicate;
  decision: MergeDecision;
  keepId?: string;
  removeId?: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Main service
// ---------------------------------------------------------------------------

export async function reconcileAffairs(
  options: ReconcileAffairsOptions = {}
): Promise<ReconcileAffairsStats> {
  const { dryRun = false, autoMerge = false } = options;

  const duplicates = await findPotentialDuplicates();

  const empty: ReconcileAffairsStats = {
    duplicatesFound: 0,
    merged: 0,
    reviewRequired: 0,
    notEligible: 0,
    proposalsCreated: 0,
    errors: 0,
    remainingPossible: 0,
  };
  if (duplicates.length === 0) return empty;

  const planned: PlannedPair[] = duplicates.map((pair) => {
    const plan = decideMergeAction(pair);
    return { pair, ...plan };
  });

  const stats: ReconcileAffairsStats = {
    ...empty,
    duplicatesFound: duplicates.length,
    reviewRequired: planned.filter((p) => p.decision === "REVIEW_REQUIRED").length,
    notEligible: planned.filter((p) => p.decision === "NOT_ELIGIBLE").length,
    remainingPossible: duplicates.filter((d) => d.confidence === "POSSIBLE").length,
  };

  if (!autoMerge) return stats;

  const draftMerges = planned.filter((p) => p.decision === "AUTO_MERGE_DRAFTS");

  // Survivors of every merge that actually landed, for one invalidation pass.
  const survivors: string[] = [];

  for (const plan of draftMerges) {
    if (dryRun) {
      stats.merged++;
      continue;
    }
    try {
      await mergeAffairs(plan.keepId!, plan.removeId!, {
        auditNotes: { decision: plan.decision, reason: plan.reason },
      });
      stats.merged++;
      survivors.push(plan.keepId!);
    } catch {
      stats.errors++;
    }
  }

  // After every merge committed, never during.
  if (!dryRun) await invalidateAfterMerges(survivors);

  return stats;
}
