/**
 * User-accord-gated: regenerate the policy titles of "de suppression" scrutins
 * with the polarity-fixed prompt (policy-title-v3) + the suppression-polarity
 * validator.
 *
 * Why a dedicated driver: the normal backlog generator only picks UNTITLED
 * scrutins, but the suppression population is already titled. This forces an
 * in-place regeneration (force: true → overwrite + "regenerated" revision) for a
 * scoped, id-based selection.
 *
 * Scope: legislature 17 / AN scrutins whose official title carries "de
 * suppression", that are linked, whose policy row is APPROVED / NEEDS_REVIEW /
 * STALE (REJECTED rows are human decisions, left untouched), and whose title was
 * NOT already regenerated at the current prompt version (so re-running is
 * resumable and never double-spends). V4000 is EXCLUDED: it is a mislink (its
 * linked amendment is a DGF revaluation on another article, not a suppression),
 * reported separately, not a polarity case.
 *
 * Cost guard: same Mistral token meter + hard-stop (default €15) as the backlog
 * driver. Regenerates in bounded id-chunks; projects full-scope cost after each
 * chunk and STOPS if it exceeds the ceiling.
 *
 * Writes DRAFT / NEEDS_REVIEW rows only (never approves). Approval is a separate,
 * HIGH-only step (backfill-approve-high.ts).
 */
import { generateScrutinPolicyTitles } from "@/services/sync/generate-scrutin-policy-titles";
import { PROMPT_VERSION } from "@/services/scrutin-policy-title/prompt";
import { getMistralTokensUsed, resetMistralTokensUsed } from "@/lib/api/mistral";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";

const CHUNK = Number(process.env.GEN_CHUNK ?? "25");
const EUR_PER_1M = Number(process.env.MISTRAL_EUR_PER_1M ?? "3"); // conservative blended large-latest
const HARD_STOP_EUR = Number(process.env.GEN_HARD_STOP_EUR ?? "15");
const EXCLUDE_EXTERNAL_SUFFIX = "V4000"; // documented mislink, out of scope

const scopeWhere: Prisma.ScrutinWhereInput = {
  legislature: 17,
  chamber: "AN",
  title: { contains: "suppression", mode: "insensitive" },
  amendmentLinks: { some: {} },
  externalId: { not: { endsWith: EXCLUDE_EXTERNAL_SUFFIX } },
  policyTitle: {
    is: {
      status: { in: ["APPROVED", "NEEDS_REVIEW", "STALE"] },
      // resumable: skip rows already regenerated at the current prompt version
      promptVersion: { not: PROMPT_VERSION },
    },
  },
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

(async () => {
  if (!process.env.MISTRAL_API_KEY) {
    console.log("NO_MISTRAL_KEY");
    await db.$disconnect();
    process.exit(2);
  }
  resetMistralTokensUsed();

  const scope = await db.scrutin.findMany({
    where: scopeWhere,
    select: { id: true },
    orderBy: { votingDate: "desc" },
  });
  const ids = scope.map((s) => s.id);
  console.log(
    `[regen] scope=${ids.length} promptVersion=${PROMPT_VERSION} chunk=${CHUNK} rate=${EUR_PER_1M}EUR/1M hardStop=${HARD_STOP_EUR}EUR`
  );
  if (ids.length === 0) {
    console.log("[regen] nothing to do (scope empty — already regenerated?).");
    await db.$disconnect();
    return;
  }

  let generated = 0;
  let fallbacks = 0;
  let skipped = 0;
  let suppressionBlocked = 0;
  const errors: Array<{ scrutinId: string; error: string }> = [];
  const chunks = chunk(ids, CHUNK);
  let processed = 0;

  for (let c = 0; c < chunks.length; c++) {
    const batch = chunks[c]!;
    const stats = await generateScrutinPolicyTitles({ scrutinIds: batch, force: true });
    generated += stats.generated;
    fallbacks += stats.fallbacks;
    skipped += stats.skipped;
    errors.push(...stats.errors);
    processed += stats.processed;
    for (const r of stats.results) {
      if (r.warnings.some((w) => w.code === "SUPPRESSION_POLARITY")) suppressionBlocked++;
    }

    const tokens = getMistralTokensUsed();
    const eur = (tokens / 1_000_000) * EUR_PER_1M;
    const projectedEur = processed > 0 ? (eur / processed) * ids.length : eur;
    console.log(
      `[regen] chunk ${c + 1}/${chunks.length}: generated=${stats.generated} fallbacks=${stats.fallbacks} errors=${stats.errors.length} suppBlocked+=${stats.results.filter((r) => r.warnings.some((w) => w.code === "SUPPRESSION_POLARITY")).length} | cumul processed=${processed}/${ids.length} tokens=${tokens} eur=${eur.toFixed(2)} projected=${projectedEur.toFixed(2)}`
    );

    if (projectedEur > HARD_STOP_EUR) {
      console.log(
        `[regen] STOP: projected cost ${projectedEur.toFixed(2)}EUR exceeds hard stop ${HARD_STOP_EUR}EUR. Halting for review.`
      );
      break;
    }
  }

  const tokens = getMistralTokensUsed();
  console.log(
    "[regen] DONE " +
      JSON.stringify({
        scope: ids.length,
        processed,
        generated,
        fallbacks,
        skipped,
        suppressionBlocked,
        errorCount: errors.length,
        tokensUsed: tokens,
        estEUR: Number(((tokens / 1_000_000) * EUR_PER_1M).toFixed(2)),
        rateEURper1M: EUR_PER_1M,
      })
  );
  if (errors.length) console.log("[regen] first errors:", JSON.stringify(errors.slice(0, 10)));
  await db.$disconnect();
})().catch(async (e) => {
  console.error("[regen] FAILED:", e);
  try {
    await db.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
