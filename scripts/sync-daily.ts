/**
 * Daily sync orchestrator
 *
 * Runs incremental syncs for votes (AN + Sénat) and legislation,
 * then downloads new exposés des motifs and generates AI summaries.
 *
 * Usage:
 *   npm run sync:daily              # Run all daily sync steps
 *   npm run sync:daily -- --dry-run # Preview without writing to DB
 *
 * Designed to run 3x/day via GitHub Actions (6h, 12h, 20h Paris time).
 * Each step uses --today to only process new items from the current day.
 */

import "dotenv/config";
import { execSync } from "child_process";
import { revalidateRemoteCache } from "./lib/revalidate-cache";

const DRY_RUN = process.argv.includes("--dry-run");
const dryRunFlag = DRY_RUN ? " --dry-run" : "";

// Pause between retry attempts so a still-ongoing transient blip (e.g. a
// Supabase connection drop) has time to clear instead of the retry hitting it
// back-to-back.
const RETRY_BACKOFF_MS = 20 * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface SyncStep {
  name: string;
  command: string;
  run?: () => Promise<void>;
  /**
   * When true, a failure on this step is recorded but does not mark the whole
   * run as failed. Use sparingly — reserved for steps that depend on unreliable
   * third-party APIs (AN legislation endpoints) where transient outages would
   * otherwise page every cron.
   */
  allowFailure?: boolean;
  /**
   * Extra attempts after a failure (default 0). For blocking steps that hit
   * transient infra errors (Supabase dropping a connection mid-query, issue
   * #442) where a plain re-run succeeds.
   */
  retries?: number;
}

const steps: SyncStep[] = [
  {
    name: "Votes AN (today)",
    command: `npx tsx scripts/sync-scrutins-an.ts --today${dryRunFlag}`,
  },
  {
    name: "Votes Sénat (today)",
    command: `npx tsx scripts/sync-scrutins-senat.ts --today${dryRunFlag}`,
  },
  ...(!DRY_RUN
    ? [
        {
          name: "Votes cache revalidation",
          command: "POST /api/cron/revalidate (votes)",
          run: () => revalidateRemoteCache(["votes"]),
        },
      ]
    : []),
  {
    name: "Législation (active, 3j)",
    command: `npx tsx scripts/sync-legislation.ts --active --since-days=3${dryRunFlag}`,
    allowFailure: true,
  },
  {
    name: "Exposés des motifs (limit 20)",
    command: `npx tsx scripts/sync-legislation-content.ts --limit=20${dryRunFlag}`,
    allowFailure: true,
  },
  {
    name: "Résumés IA dossiers (limit 10)",
    command: `npx tsx scripts/generate-summaries.ts --limit=10${dryRunFlag}`,
  },
  {
    name: "Résumés IA scrutins (limit 20)",
    command: `npx tsx scripts/generate-scrutin-summaries.ts --limit=20${dryRunFlag}`,
  },
  {
    name: "Presse (RSS)",
    command: `npx tsx scripts/sync-press.ts${dryRunFlag}`,
  },
  {
    // --force bypasses the 6h self-throttle in syncPressAnalysis. That guard
    // exists for an operator running the script by hand twice in a row; it
    // used to also arbitrate between schedulers, since the Inngest sync-daily
    // function ran this same step on the same 0 5,11,19 cron and shared its
    // syncMetadata row. Whichever fired first took the window and the other
    // returned in 2s having analyzed nothing, while still reporting success.
    // Cron drift (15 to 45 min here) decided the winner, so the skips
    // alternated: the backlog grew from 167 to 321 articles in 34h that way.
    // The Inngest step is removed (see src/inngest/functions/sync-daily.ts)
    // so this workflow is now the sole scheduler for press analysis: --force
    // is safe because there is no longer a second process to race against.
    name: "Analyse presse IA (limit 100)",
    command: `npx tsx scripts/sync-press-analysis.ts --limit=100 --force${dryRunFlag}`,
  },
  // Judilibre step disabled 2026-05-15 (Option C, audit:
  // docs/superpowers/audits/2026-05-15-judilibre-no-match-audit.md).
  // The Cassation chambre criminelle corpus is structurally anonymized;
  // pipeline produced 0 affairs over 156 decisions. Re-enabling tracked
  // as Option D (enrichment for existing affairs) in follow-up issue.
  // {
  //   name: "Judilibre (limit 20)",
  //   command: `npx tsx scripts/sync-judilibre.ts --limit=20${dryRunFlag}`,
  // },
  {
    name: "Réconciliation affaires",
    command: `npx tsx scripts/reconcile-affairs.ts --auto-merge${dryRunFlag}`,
  },
  {
    name: "Fact-checks (Google API)",
    command: `npx tsx scripts/sync-factchecks.ts --limit=50${dryRunFlag}`,
  },
  {
    name: "Classification thématique (limit 30)",
    command: `npx tsx scripts/classify-themes.ts --limit=30${dryRunFlag}`,
  },
  {
    name: "Embeddings fact-checks (delta)",
    command: `npx tsx scripts/index-embeddings.ts --type=FACTCHECK --limit=200`,
  },
  {
    name: "Embeddings presse (delta)",
    command: `npx tsx scripts/index-embeddings.ts --type=PRESS_ARTICLE --limit=200`,
  },
  {
    name: "Prominence scores",
    command: `npx tsx scripts/recalculate-prominence.ts${dryRunFlag}`,
  },
  {
    name: "Publication status",
    command: `npx tsx scripts/assign-publication-status.ts${dryRunFlag}`,
  },
  {
    name: "Compute participation stats",
    command: `npx tsx scripts/compute-stats.ts${dryRunFlag}`,
    // Blocking step recurrently killed by transient Supabase connection drops
    // (#442). One retry (6587772) was not enough on 2026-07-16: both back-to-back
    // attempts hit the same ongoing drop. Two retries + the RETRY_BACKOFF_MS pause
    // between attempts give the blip time to clear.
    retries: 2,
  },
  {
    name: "IndexNow",
    command: `npx tsx scripts/submit-indexnow.ts`,
  },
  {
    // Non-blocking: emails a catch-up nudge when press articles pile up
    // unanalyzed (dry credits, upstream slowness, volume). The manual
    // /analyse-presse skill drains the backlog without spending API credits.
    name: "Notification backlog presse",
    command: `npx tsx scripts/notify-press-backlog.ts${dryRunFlag}`,
    allowFailure: true,
  },
  ...(!DRY_RUN
    ? [
        {
          // Scoped tags only — never use { all: true }. See Phase 4 of
          // docs/superpowers/plans/2026-04-07-supabase-perf-improvements.md.
          // The four tags below match the remaining data domains touched by
          // the daily sync. Votes are invalidated immediately after both vote
          // syncs, before the longer steps below can time out the workflow.
          // Adding "elections" here would purge caches that the daily sync did
          // NOT update. "factchecks" is not one of those: the Google API step
          // above imports fact-checks on every run, and the listing that shows
          // them holds its cache for 24h, so leaving the tag out kept a new
          // fact-check off the site for a day after it was stored.
          name: "Cache revalidation",
          command: "POST /api/cron/revalidate (dossiers, stats, politicians, factchecks)",
          run: () => revalidateRemoteCache(["dossiers", "stats", "politicians", "factchecks"]),
        },
      ]
    : []),
];

async function main() {
  const startTime = Date.now();
  const today = new Date().toISOString().split("T")[0];

  console.log("=".repeat(60));
  console.log(`Daily Sync — ${today}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log("=".repeat(60));
  console.log("");

  const results: {
    name: string;
    success: boolean;
    duration: number;
    error?: string;
    allowFailure: boolean;
  }[] = [];

  for (const step of steps) {
    const stepStart = Date.now();
    console.log(`\n${"─".repeat(50)}`);
    console.log(`▶ ${step.name}${step.allowFailure ? " (non-blocking)" : ""}`);
    console.log(`  ${step.command}`);
    console.log("─".repeat(50));

    const maxAttempts = 1 + (step.retries ?? 0);
    // Only retry fast failures (transient blips like a dropped DB connection).
    // A slow failure (hang killed by the 10 min timeout) would just burn
    // another 10 min of the 30 min job budget on the same non-transient cause.
    const retryIfFailedUnderMs = 5 * 60 * 1000;
    let lastError: string | undefined;
    let success = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        console.log(`\n↻ ${step.name}: retry ${attempt - 1}/${maxAttempts - 1}`);
      }
      const attemptStart = Date.now();
      try {
        if (step.run) {
          await step.run();
        } else {
          execSync(step.command, {
            stdio: "inherit",
            env: { ...process.env },
            timeout: 10 * 60 * 1000, // 10 minutes max per step
          });
        }
        success = true;
        break;
      } catch (err) {
        const attemptDuration = Date.now() - attemptStart;
        lastError = err instanceof Error ? err.message : String(err);
        console.error(`\n✗ ${step.name} attempt ${attempt}/${maxAttempts} failed: ${lastError}`);
        if (attempt < maxAttempts && attemptDuration >= retryIfFailedUnderMs) {
          console.error(
            `  skipping retry: attempt ran ${(attemptDuration / 1000).toFixed(0)}s (not a transient blip)`
          );
          break;
        }
        if (attempt < maxAttempts) {
          console.error(`  ↻ backing off ${(RETRY_BACKOFF_MS / 1000).toFixed(0)}s before retry`);
          await sleep(RETRY_BACKOFF_MS);
        }
      }
    }

    const duration = (Date.now() - stepStart) / 1000;
    if (success) {
      results.push({
        name: step.name,
        success: true,
        duration,
        allowFailure: step.allowFailure === true,
      });
      console.log(`\n✓ ${step.name} completed in ${duration.toFixed(1)}s`);
    } else {
      results.push({
        name: step.name,
        success: false,
        duration,
        error: lastError,
        allowFailure: step.allowFailure === true,
      });
      const icon = step.allowFailure ? "⚠" : "✗";
      const suffix = step.allowFailure ? " (non-blocking)" : "";
      console.error(
        `\n${icon} ${step.name} failed after ${duration.toFixed(1)}s${suffix}: ${lastError}`
      );
      // Continue to next step even on failure
    }
  }

  // Summary
  const totalDuration = (Date.now() - startTime) / 1000;
  const succeeded = results.filter((r) => r.success).length;
  const hardFailed = results.filter((r) => !r.success && !r.allowFailure).length;
  const softFailed = results.filter((r) => !r.success && r.allowFailure).length;

  console.log("\n" + "=".repeat(60));
  console.log("Daily Sync Summary");
  console.log("=".repeat(60));
  console.log(`Total duration: ${totalDuration.toFixed(1)}s`);
  console.log(
    `Steps: ${succeeded} succeeded, ${hardFailed} failed, ${softFailed} non-blocking failures\n`
  );

  for (const r of results) {
    const icon = r.success ? "✓" : r.allowFailure ? "⚠" : "✗";
    const time = `${r.duration.toFixed(1)}s`;
    const suffix = r.error ? ` — ${r.error}` : "";
    console.log(`  ${icon} ${r.name} (${time})${suffix}`);
  }

  console.log("");

  if (hardFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
