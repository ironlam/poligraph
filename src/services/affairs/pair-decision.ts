/**
 * Human rulings on detected duplicate pairs (issue #525).
 *
 * Detection was widened to published affairs, so most pairs now need a person
 * rather than a cron. Without a memory of what that person decided, the same
 * pairs would be re-proposed at every run and the queue would never drain.
 *
 * A ruling is not permanent truth. "Not the same affair" was judged against the
 * two rows as they stood; if either is later edited, the ruling is stale and the
 * pair may be worth another look. That is what the two stored `updatedAt` are for.
 */

import { db } from "@/lib/db";
import type { AffairPairClassification, Prisma } from "@/generated/prisma";
import { canonicalPair } from "./affair-pair";

/**
 * Rulings that keep a pair out of the duplicate queue.
 *
 * UNCERTAIN is absent on purpose: it defers a decision, it does not settle one, so
 * the pair stays visible. DUPLICATE excludes because the merge already happened.
 */
const EXCLUDING_CLASSIFICATIONS: readonly AffairPairClassification[] = [
  "DUPLICATE",
  "LINKED",
  "DISTINCT",
];

/** Rulings a later edit on either affair can reopen. */
const STALEABLE_CLASSIFICATIONS: readonly AffairPairClassification[] = ["DISTINCT", "UNCERTAIN"];

export interface RecordPairDecisionInput {
  affairIdA: string;
  affairIdB: string;
  classification: AffairPairClassification;
  reviewedBy: string;
  notes?: string | null;
  /** The signal that proposed the pair, kept so the ruling can be re-read. */
  signal: { confidence: string; matchedBy: string; score: number };
  /** Both rows as of the ruling; a later edit makes DISTINCT/UNCERTAIN stale. */
  affairAUpdatedAt: Date;
  affairBUpdatedAt: Date;
  mergedIntoAffairId?: string | null;
}

/**
 * The upsert a ruling amounts to, canonical ordering included.
 *
 * Pure and exported so both callers share one implementation: the standalone path
 * below, and the merge transaction, which must write a DUPLICATE ruling and the
 * merge together. Returning args rather than performing the write avoids handing
 * a transaction client across a module boundary.
 */
export function buildPairDecisionUpsert(
  input: RecordPairDecisionInput
): Prisma.AffairPairDecisionUpsertArgs {
  const { a, b, key } = canonicalPair(input.affairIdA, input.affairIdB);
  // Timestamps follow the ids through the canonical sort, or a later staleness
  // check would compare affair A against affair B's recorded time.
  const swapped = a !== input.affairIdA;
  const affairAUpdatedAt = swapped ? input.affairBUpdatedAt : input.affairAUpdatedAt;
  const affairBUpdatedAt = swapped ? input.affairAUpdatedAt : input.affairBUpdatedAt;

  const data = {
    classification: input.classification,
    confidence: input.signal.confidence,
    matchedBy: input.signal.matchedBy,
    score: input.signal.score,
    affairAUpdatedAt,
    affairBUpdatedAt,
    mergedIntoAffairId: input.mergedIntoAffairId ?? null,
    reviewedBy: input.reviewedBy,
    reviewedAt: new Date(),
    notes: input.notes ?? null,
  };

  return {
    where: { pairKey: key },
    create: { pairKey: key, affairIdA: a, affairIdB: b, ...data },
    update: data,
  };
}

/** Store a ruling outside any merge, replacing an earlier one for the same pair. */
export async function recordPairDecision(input: RecordPairDecisionInput): Promise<string> {
  const decision = await db.affairPairDecision.upsert(buildPairDecisionUpsert(input));
  return decision.id;
}

export interface PairExclusions {
  /** Canonical keys detection must skip. */
  excluded: Set<string>;
  /** Canonical keys ruled DISTINCT or UNCERTAIN whose rows have since changed. */
  stale: Set<string>;
  /** Canonical keys deferred as UNCERTAIN, for the re-examination filter. */
  uncertain: Set<string>;
  /** Ruling stored per pair, so a re-proposed pair can show what was decided. */
  classifications: Map<string, AffairPairClassification>;
}

/**
 * Which pairs a detection run must skip, and which rulings have gone stale.
 *
 * Reads the legacy DismissedDuplicate table as well. Those rows mean exactly
 * "false positive", so they are honoured as DISTINCT until they are backfilled
 * into this model and the dual read is removed.
 */
export async function loadPairExclusions(
  affairUpdatedAt: Map<string, Date>
): Promise<PairExclusions> {
  const [decisions, dismissed] = await Promise.all([
    db.affairPairDecision.findMany({
      select: {
        pairKey: true,
        affairIdA: true,
        affairIdB: true,
        classification: true,
        affairAUpdatedAt: true,
        affairBUpdatedAt: true,
      },
    }),
    db.dismissedDuplicate.findMany({ select: { affairIdA: true, affairIdB: true } }),
  ]);

  const excluded = new Set<string>();
  const stale = new Set<string>();
  const uncertain = new Set<string>();
  const classifications = new Map<string, AffairPairClassification>();

  for (const decision of decisions) {
    classifications.set(decision.pairKey, decision.classification);
    if (decision.classification === "UNCERTAIN") uncertain.add(decision.pairKey);

    if (STALEABLE_CLASSIFICATIONS.includes(decision.classification)) {
      const liveA = affairUpdatedAt.get(decision.affairIdA);
      const liveB = affairUpdatedAt.get(decision.affairIdB);
      const changed =
        (liveA !== undefined && liveA.getTime() > decision.affairAUpdatedAt.getTime()) ||
        (liveB !== undefined && liveB.getTime() > decision.affairBUpdatedAt.getTime());
      if (changed) {
        stale.add(decision.pairKey);
        // A stale ruling stops excluding: the pair is worth another look.
        continue;
      }
    }

    if (EXCLUDING_CLASSIFICATIONS.includes(decision.classification)) {
      excluded.add(decision.pairKey);
    }
  }

  // Legacy table, read until the backfill lands.
  for (const row of dismissed) {
    excluded.add(canonicalPair(row.affairIdA, row.affairIdB).key);
  }

  return { excluded, stale, uncertain, classifications };
}

export interface PairMetrics {
  /** Pairs a run proposed, whatever the ruling. */
  candidatePairs: number;
  /** Every ruling stored, UNCERTAIN included. */
  ruled: number;
  /** Rulings that settled something. The denominator of every rate below. */
  decided: number;
  byClassification: Record<AffairPairClassification, number>;
  /** Share of settled pairs that were one affair recorded twice. */
  duplicateRate: number | null;
  /** Share worth surfacing at all: duplicates plus genuinely related affairs. */
  usefulMatchRate: number | null;
  /** Share that turned out to relate nothing. */
  falsePositiveRate: number | null;
}

/**
 * How the detection signal actually performs, from rulings alone.
 *
 * Three rates rather than one "precision", because the first real triage showed a
 * single number hides the answer (issue #525). Of 7 settled pairs, 3 were
 * duplicates and 3 were correct but misnamed — two counts of one decision, two
 * strands of one case, two episodes of one campaign. Reporting 43 % and calling it
 * precision would suggest the other 57 % was noise; only 1 pair related nothing.
 *
 * Computed over every ruling rather than over the top of the ranking: scoring only
 * the most confident pairs would measure the ranking, not the signal (§7).
 *
 * UNCERTAIN is excluded from the denominator. Deferring is not deciding, and
 * counting it either way would move the numbers without new information.
 */
export async function computePairMetrics(candidatePairs: number): Promise<PairMetrics> {
  const grouped = await db.affairPairDecision.groupBy({
    by: ["classification"],
    _count: { _all: true },
  });

  const byClassification = {
    DUPLICATE: 0,
    LINKED: 0,
    DISTINCT: 0,
    UNCERTAIN: 0,
  } as Record<AffairPairClassification, number>;
  for (const row of grouped) {
    byClassification[row.classification] = row._count._all;
  }

  const decided = byClassification.DUPLICATE + byClassification.LINKED + byClassification.DISTINCT;
  const rate = (numerator: number) => (decided === 0 ? null : numerator / decided);

  return {
    candidatePairs,
    ruled: decided + byClassification.UNCERTAIN,
    decided,
    byClassification,
    duplicateRate: rate(byClassification.DUPLICATE),
    usefulMatchRate: rate(byClassification.DUPLICATE + byClassification.LINKED),
    falsePositiveRate: rate(byClassification.DISTINCT),
  };
}
