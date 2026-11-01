import { inngest } from "../client";

/** Impacts regenerated per run when the environment does not say otherwise. */
const DEFAULT_PER_RUN = 50;
/** Impacts per step. */
const CHUNK = 10;
/**
 * No new vote is started after this long in a step. One call takes about ten seconds and a
 * rate-limit response adds a 30 s wait: with this budget a step ends well under the 270 s the
 * function can run, even when Mistral keeps answering 429. Votes not reached are left for the
 * next run.
 */
const STEP_TIME_BUDGET_MS = 150_000;

/** `IMPACT_REGEN_PER_RUN`: unset gives the default, 0 switches the job off. */
export function readPerRun(raw: string | undefined = process.env.IMPACT_REGEN_PER_RUN): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_PER_RUN;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return DEFAULT_PER_RUN;
  return n;
}

export const regenerateLegacyImpactsFn = inngest.createFunction(
  {
    id: "regenerate-legacy-impacts",
    retries: 0,
    concurrency: { limit: 1, key: '"regenerate-legacy-impacts"' },
  },
  // Off the hours of sync-daily (5, 11, 19 UTC): both call the same model provider.
  [{ cron: "0 2,9,15 * * *" }, { event: "impacts/regenerate" }],
  async ({ step }) => {
    const perRun = readPerRun();
    if (perRun === 0) return { skipped: "IMPACT_REGEN_PER_RUN=0" };

    const total = { selected: 0, written: 0, refused: 0, failed: 0, notEligible: 0 };
    let error: string | undefined;

    for (let i = 0; i * CHUNK < perRun; i++) {
      const limit = Math.min(CHUNK, perRun - i * CHUNK);
      const chunk = await step.run(`chunk-${i}`, async () => {
        try {
          const { regenerateLegacyImpacts } =
            await import("@/services/sync/regenerate-legacy-impacts");
          return await regenerateLegacyImpacts({ limit, timeBudgetMs: STEP_TIME_BUDGET_MS });
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      });
      if ("error" in chunk) {
        error = chunk.error;
        break;
      }
      total.selected += chunk.selected;
      total.written += chunk.written;
      total.refused += chunk.refused;
      total.failed += chunk.failed;
      total.notEligible += chunk.notEligible;
      if (chunk.selected === 0) break; // nothing left to regenerate
    }

    console.log(JSON.stringify({ job: "regenerate-legacy-impacts", perRun, ...total, error }));
    return { ...total, error };
  }
);
