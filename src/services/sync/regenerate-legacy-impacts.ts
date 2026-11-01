import { db } from "@/lib/db";
import { generateScrutinCitizenImpacts } from "@/services/sync/generate-scrutin-citizen-impacts";

/** Votes before this date were published with the "Le débat" section that had no source. */
export const LEGACY_IMPACT_CUTOFF = new Date("2026-10-30T00:00:00Z");

/** The signature of a legacy impact: the section the old prompt required. */
const LEGACY_SIGNATURE = "Le débat";

export interface LegacyImpactRunResult {
  selected: number;
  written: number;
  /** Refused by a guard (coherence, unknown names, low confidence), old text kept. */
  refused: number;
  /** Not retried: model or database failure, picked again by the next run. */
  failed: number;
  /** Not describable by the generator (no amendment text): logged so they are not picked again. */
  notEligible: number;
}

/**
 * Regenerates the next `limit` legacy citizen impacts, most recent vote first, and writes
 * the ones that pass every guard. A vote leaves the queue once logged: written or
 * refused (its old text stays). Failures are not logged, so the next run retries them.
 */
export async function regenerateLegacyImpacts(opts: {
  limit: number;
}): Promise<LegacyImpactRunResult> {
  const result: LegacyImpactRunResult = {
    selected: 0,
    written: 0,
    refused: 0,
    failed: 0,
    notEligible: 0,
  };

  const candidates = await db.scrutin.findMany({
    where: {
      citizenImpact: { contains: LEGACY_SIGNATURE },
      summary: { not: null },
      votingDate: { lt: LEGACY_IMPACT_CUTOFF },
      impactRegeneration: null,
    },
    orderBy: [{ votingDate: "desc" }, { id: "asc" }],
    take: opts.limit,
    select: { id: true },
  });
  result.selected = candidates.length;
  if (candidates.length === 0) return result;

  const generation = await generateScrutinCitizenImpacts({
    scrutinIds: candidates.map((c) => c.id),
    force: true,
  });

  const handled = new Map<string, { outcome: string; detail: string | null }>();
  for (const o of generation.outcomes) {
    if (o.outcome === "error" || o.outcome === "missing") {
      result.failed++;
      continue;
    }
    if (o.outcome === "generated") result.written++;
    else if (o.outcome === "no_substance") result.notEligible++;
    else result.refused++;
    handled.set(o.id, { outcome: o.outcome, detail: o.detail ?? null });
  }
  // The generator skips votes it cannot take at all; they must not come back every run.
  const seen = new Set(generation.outcomes.map((o) => o.id));
  for (const c of candidates) {
    if (seen.has(c.id)) continue;
    result.notEligible++;
    handled.set(c.id, { outcome: "not_eligible", detail: null });
  }

  if (handled.size > 0) {
    await db.impactRegenerationLog.createMany({
      data: [...handled.entries()].map(([scrutinId, h]) => ({ scrutinId, ...h })),
      skipDuplicates: true,
    });
  }
  return result;
}
