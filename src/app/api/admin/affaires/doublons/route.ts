import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { findPotentialDuplicates } from "@/services/affairs/reconciliation";
import { decideMergeAction } from "@/services/affairs/merge-decision";
import { computePairPrecision } from "@/services/affairs/pair-decision";
import { canonicalPair } from "@/services/affairs/affair-pair";

/**
 * The duplicate review queue, grouped by politician (issue #525).
 *
 * Grouped because a person's affairs only make sense read together: a pair that
 * looks like a duplicate in isolation is often two counts of one case, which is
 * only visible next to the others.
 */
export const GET = withAdminAuth(async () => {
  const pairs = await findPotentialDuplicates();

  const politicianIds = [...new Set(pairs.map((p) => p.affairA.politicianId))];
  const politicians = await db.politician.findMany({
    where: { id: { in: politicianIds } },
    select: { id: true, firstName: true, lastName: true, slug: true },
  });
  const byPolitician = new Map(politicians.map((p) => [p.id, p]));

  const affairIds = pairs.flatMap((p) => [p.affairA.id, p.affairB.id]);
  const affairs = await db.affair.findMany({
    where: { id: { in: [...new Set(affairIds)] } },
    select: {
      id: true,
      publicId: true,
      slug: true,
      category: true,
      status: true,
      involvement: true,
      verdictDate: true,
      factsDate: true,
      linkedAffairId: true,
    },
  });
  const detail = new Map(affairs.map((a) => [a.id, a]));

  const groups = new Map<
    string,
    { politician: (typeof politicians)[number] | null; pairs: unknown[] }
  >();

  for (const pair of pairs) {
    const politicianId = pair.affairA.politicianId;
    const group = groups.get(politicianId) ?? {
      politician: byPolitician.get(politicianId) ?? null,
      pairs: [],
    };
    const plan = decideMergeAction(pair);
    group.pairs.push({
      pairKey: canonicalPair(pair.affairA.id, pair.affairB.id).key,
      confidence: pair.confidence,
      matchedBy: pair.matchedBy,
      score: pair.score,
      contradictions: pair.contradictions,
      unpropagatableDifferences: pair.unpropagatableDifferences,
      previousClassification: pair.previousClassification,
      rulingStale: pair.rulingStale,
      plan,
      affairA: { ...pair.affairA, ...detail.get(pair.affairA.id) },
      affairB: { ...pair.affairB, ...detail.get(pair.affairB.id) },
    });
    groups.set(politicianId, group);
  }

  const metrics = await computePairPrecision(pairs.length);

  return NextResponse.json({
    total: pairs.length,
    metrics,
    groups: [...groups.values()].sort((a, b) => b.pairs.length - a.pairs.length),
  });
});
