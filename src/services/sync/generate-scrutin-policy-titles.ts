/**
 * Batch orchestrator for policy-title generation. Selects linked AN scrutins
 * (legislature 17 by default) without a ScrutinPolicyTitle row, then drives the
 * per-scrutin generator one at a time with AI rate limiting and a single 429
 * retry. Thin wrapper: all per-scrutin logic lives in
 * `@/services/scrutin-policy-title`.
 */

import { db } from "@/lib/db";
import { generateScrutinPolicyTitle } from "@/services/scrutin-policy-title";
import { AI_RATE_LIMIT_MS, AI_429_BACKOFF_MS } from "@/config/rate-limits";
import type { Chamber, Prisma } from "@/generated/prisma";
import type {
  GenerateResult,
  GeneratePolicyTitlesStats,
} from "@/services/scrutin-policy-title/types";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GeneratePolicyTitlesOptions {
  legislature?: number;
  chamber?: "AN" | "SENAT";
  limit?: number;
  force?: boolean;
  createRevision?: boolean;
  scrutinIds?: string[];
  dryRun?: boolean;
  skipLlm?: boolean;
  verbose?: boolean;
  modelVersionDate?: string;
}

export async function generateScrutinPolicyTitles(
  opts: GeneratePolicyTitlesOptions = {}
): Promise<GeneratePolicyTitlesStats & { results: GenerateResult[] }> {
  const startedAt = Date.now();
  const {
    legislature = 17,
    chamber = "AN",
    limit,
    force = false,
    createRevision,
    scrutinIds,
    dryRun = false,
    skipLlm = false,
    verbose = false,
    modelVersionDate,
  } = opts;

  const where: Prisma.ScrutinWhereInput = {
    legislature,
    chamber: chamber as Chamber,
    amendmentLinks: { some: {} },
    ...(force ? {} : { policyTitle: { is: null } }),
    ...(scrutinIds ? { id: { in: scrutinIds } } : {}),
  };

  const scrutins = await db.scrutin.findMany({
    where,
    select: { id: true },
    orderBy: { votingDate: "desc" },
    ...(limit !== undefined ? { take: limit } : {}),
  });

  const stats: GeneratePolicyTitlesStats & { results: GenerateResult[] } = {
    processed: 0,
    generated: 0,
    fallbacks: 0,
    skipped: 0,
    errors: [],
    durationMs: 0,
    results: [],
  };

  for (const { id } of scrutins) {
    const runOnce = (): Promise<GenerateResult> =>
      generateScrutinPolicyTitle(id, {
        force,
        dryRun,
        skipLlm,
        verbose,
        ...(createRevision !== undefined ? { createRevision } : {}),
        ...(modelVersionDate ? { modelVersionDate } : {}),
      });

    let result: GenerateResult;
    try {
      result = await runOnce();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429") || /rate/i.test(msg)) {
        await sleep(AI_429_BACKOFF_MS);
        try {
          result = await runOnce();
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          stats.processed++;
          stats.errors.push({ scrutinId: id, error: retryMsg });
          continue;
        }
      } else {
        stats.processed++;
        stats.errors.push({ scrutinId: id, error: msg });
        continue;
      }
    }

    stats.processed++;
    stats.results.push(result);
    if (result.outcome === "generated") stats.generated++;
    else if (result.outcome === "fallback") stats.fallbacks++;
    else stats.skipped++;

    // Rate-limit only when an LLM call likely happened: a non-skipped iteration
    // on a real run (dryRun and skipped outcomes never hit the model).
    if (!dryRun && result.outcome !== "skipped") {
      await sleep(AI_RATE_LIMIT_MS);
    }
  }

  stats.durationMs = Date.now() - startedAt;
  return stats;
}
