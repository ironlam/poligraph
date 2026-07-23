/**
 * User-accord-gated: generate the remaining policy-title backlog with Mistral.
 *
 * Resumable + idempotent: generateScrutinPolicyTitles() selects linked + untitled
 * scrutins newest-first, so re-running continues where a prior (possibly killed)
 * run stopped. Loops in bounded batches until the backlog is drained.
 *
 * Cost guard: reads the process-wide Mistral token meter after each batch,
 * projects the full-backlog cost at a conservative blended rate, and STOPS if the
 * projection exceeds HARD_STOP_EUR (default 15). Real token counts are logged so
 * cost can be recomputed with the exact Mistral tariff.
 *
 * Writes DRAFT rows only (never approves). Approval is a separate, HIGH-only step.
 */
import { generateScrutinPolicyTitles } from "@/services/sync/generate-scrutin-policy-titles";
import { getMistralTokensUsed, resetMistralTokensUsed } from "@/lib/api/mistral";
import { db } from "@/lib/db";

const BATCH = Number(process.env.GEN_BATCH ?? "40");
const EUR_PER_1M = Number(process.env.MISTRAL_EUR_PER_1M ?? "3"); // conservative blended large-latest
const HARD_STOP_EUR = Number(process.env.GEN_HARD_STOP_EUR ?? "15");
const MAX_BATCHES = Number(process.env.GEN_MAX_BATCHES ?? "60"); // safety cap

const backlogWhere = {
  legislature: 17,
  chamber: "AN" as const,
  amendmentLinks: { some: {} },
  policyTitle: { is: null },
};

(async () => {
  if (!process.env.MISTRAL_API_KEY) {
    console.log("NO_MISTRAL_KEY");
    await db.$disconnect();
    process.exit(2);
  }
  resetMistralTokensUsed();
  const backlogStart = await db.scrutin.count({ where: backlogWhere });
  console.log(
    `[gen] backlog=${backlogStart} batch=${BATCH} rate=${EUR_PER_1M}EUR/1M hardStop=${HARD_STOP_EUR}EUR`
  );

  let produced = 0;
  let generated = 0;
  let fallbacks = 0;
  const errors: Array<{ scrutinId: string; error: string }> = [];

  for (let b = 1; b <= MAX_BATCHES; b++) {
    const stats = await generateScrutinPolicyTitles({ limit: BATCH });
    const batchProduced = stats.generated + stats.fallbacks;
    produced += batchProduced;
    generated += stats.generated;
    fallbacks += stats.fallbacks;
    errors.push(...stats.errors);

    const tokens = getMistralTokensUsed();
    const eur = (tokens / 1_000_000) * EUR_PER_1M;
    const projectedEur = produced > 0 ? (eur / produced) * backlogStart : eur;
    console.log(
      `[gen] batch ${b}: generated=${stats.generated} fallbacks=${stats.fallbacks} errors=${stats.errors.length} | cumul produced=${produced}/${backlogStart} tokens=${tokens} eur=${eur.toFixed(2)} projected=${projectedEur.toFixed(2)}`
    );

    if (projectedEur > HARD_STOP_EUR) {
      console.log(
        `[gen] STOP: projected cost ${projectedEur.toFixed(2)}EUR exceeds hard stop ${HARD_STOP_EUR}EUR. Halting for review.`
      );
      break;
    }
    if (batchProduced === 0) {
      console.log("[gen] backlog drained (0 produced this batch).");
      break;
    }
  }

  const tokens = getMistralTokensUsed();
  const backlogEnd = await db.scrutin.count({ where: backlogWhere });
  console.log(
    "[gen] DONE " +
      JSON.stringify({
        producedTitles: produced,
        generated,
        fallbacks,
        errorCount: errors.length,
        backlogStart,
        backlogEnd,
        tokensUsed: tokens,
        estEUR: Number(((tokens / 1_000_000) * EUR_PER_1M).toFixed(2)),
        rateEURper1M: EUR_PER_1M,
      })
  );
  if (errors.length) console.log("[gen] first errors:", JSON.stringify(errors.slice(0, 10)));
  await db.$disconnect();
})().catch(async (e) => {
  console.error("[gen] FAILED:", e);
  try {
    await db.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
