/**
 * Full sync orchestrator
 *
 * Runs ALL sync scripts in dependency order for a complete data rebuild.
 * Unlike sync:daily (incremental), this does a full import from all sources.
 *
 * Usage:
 *   npm run sync:full              # Run everything
 *   npm run sync:full -- --dry-run # Preview without writing to DB
 *   npm run sync:full -- --skip-ai # Skip AI-powered steps (summaries, embeddings, biographies)
 *   npm run sync:full -- --from=5  # Resume from step 5
 *
 * Estimated duration: 30-60 minutes depending on API rate limits.
 */

import "dotenv/config";
import { execSync } from "child_process";

const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_AI = process.argv.includes("--skip-ai");
const fromArg = process.argv.find((a) => a.startsWith("--from="));
const FROM_STEP = fromArg ? parseInt(fromArg.split("=")[1]!, 10) : 1;

const dryRunFlag = DRY_RUN ? " --dry-run" : "";

interface SyncStep {
  name: string;
  command: string;
  ai?: boolean; // Skipped with --skip-ai
  timeout?: number; // Override default timeout (ms)
}

const steps: SyncStep[] = [
  // ── Phase 1: Core data sources ──────────────────────────────
  {
    name: "Assemblée nationale",
    command: `npx tsx scripts/sync-assemblee.ts${dryRunFlag}`,
  },
  {
    name: "Sénat",
    command: `npx tsx scripts/sync-senat.ts${dryRunFlag}`,
  },
  {
    name: "Gouvernement",
    command: `npx tsx scripts/sync-gouvernement.ts${dryRunFlag}`,
  },
  {
    name: "Président de la République",
    command: `npx tsx scripts/sync-president.ts${dryRunFlag}`,
  },
  {
    name: "Parlement européen",
    command: `npx tsx scripts/sync-europarl.ts${dryRunFlag}`,
  },

  // ── Phase 2: Wikidata enrichment ────────────────────────────
  {
    name: "Wikidata IDs",
    command: `npx tsx scripts/sync-wikidata-ids.ts${dryRunFlag}`,
  },
  {
    name: "Partis (Wikidata)",
    command: `npx tsx scripts/sync-partis.ts${dryRunFlag}`,
  },
  {
    name: "Carrières (Wikidata P39 + P488 + P112)",
    command: `npx tsx scripts/sync-careers.ts${dryRunFlag}`,
    timeout: 20 * 60 * 1000,
  },
  {
    name: "Dirigeants de parti historiques (Wikidata P488)",
    command: `npx tsx scripts/populate-party-leaders.ts${dryRunFlag}`,
  },

  // ── Phase 3: Additional data sources ────────────────────────
  {
    name: "HATVP (déclarations)",
    command: `npx tsx scripts/sync-hatvp.ts${dryRunFlag}`,
  },
  {
    name: "Partis des eurodéputés",
    command: `npx tsx scripts/sync-mep-parties.ts${dryRunFlag}`,
  },
  {
    name: "Dates de naissance",
    command: `npx tsx scripts/sync-birthdates.ts${dryRunFlag}`,
  },
  {
    name: "Personnes décédées",
    command: `npx tsx scripts/sync-deceased.ts${dryRunFlag}`,
  },
  {
    name: "Photos",
    command: `npx tsx scripts/sync-photos.ts${dryRunFlag}`,
  },

  // ── Phase 4: Votes & Legislation ───────────────────────────
  {
    name: "Votes AN (complet)",
    command: `npx tsx scripts/sync-scrutins-an.ts${dryRunFlag}`,
    timeout: 20 * 60 * 1000,
  },
  {
    name: "Votes Sénat (complet)",
    command: `npx tsx scripts/sync-scrutins-senat.ts --all${dryRunFlag}`,
    timeout: 20 * 60 * 1000,
  },
  {
    name: "Dossiers législatifs",
    command: `npx tsx scripts/sync-legislation.ts${dryRunFlag}`,
    timeout: 15 * 60 * 1000,
  },
  {
    name: "Contenu des dossiers (exposés des motifs)",
    command: `npx tsx scripts/sync-legislation-content.ts${dryRunFlag}`,
    timeout: 15 * 60 * 1000,
  },

  // ── Phase 5: Press & Fact-checks ───────────────────────────
  {
    name: "Presse (RSS)",
    command: `npx tsx scripts/sync-press.ts${dryRunFlag}`,
  },
  {
    name: "Fact-checks",
    command: `npx tsx scripts/sync-factchecks.ts${dryRunFlag}`,
  },

  // ── Phase 6: Elections ─────────────────────────────────────
  {
    name: "RNE (maires)",
    command: `npx tsx scripts/sync-rne.ts${dryRunFlag}`,
  },
  {
    name: "Candidatures municipales",
    command: `npx tsx scripts/sync-candidatures.ts${dryRunFlag}`,
  },

  // ── Phase 7: Enrichment (optional) ─────────────────────────
  {
    name: "Classification thématique",
    command: `npx tsx scripts/classify-themes.ts${dryRunFlag}`,
    ai: true,
  },
  {
    name: "Embeddings (tous types)",
    command: `npx tsx scripts/index-embeddings.ts${dryRunFlag}`,
    ai: true,
    timeout: 20 * 60 * 1000,
  },
];

const DEFAULT_TIMEOUT = 10 * 60 * 1000; // 10 minutes

async function main() {
  const startTime = Date.now();
  const today = new Date().toISOString().split("T")[0];

  const activeSteps = steps
    .map((s, i) => ({ ...s, index: i + 1 }))
    .filter((s) => s.index >= FROM_STEP)
    .filter((s) => !(SKIP_AI && s.ai));

  console.log("=".repeat(60));
  console.log(`Full Sync — ${today}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  if (SKIP_AI) console.log("AI steps: SKIPPED");
  if (FROM_STEP > 1) console.log(`Resuming from step ${FROM_STEP}`);
  console.log(`Steps: ${activeSteps.length} / ${steps.length}`);
  console.log("=".repeat(60));
  console.log("");

  const results: {
    name: string;
    step: number;
    success: boolean;
    duration: number;
    error?: string;
  }[] = [];

  for (const step of activeSteps) {
    const stepStart = Date.now();
    console.log(`\n${"─".repeat(50)}`);
    console.log(`▶ [${step.index}/${steps.length}] ${step.name}`);
    console.log(`  ${step.command}`);
    console.log("─".repeat(50));

    try {
      execSync(step.command, {
        stdio: "inherit",
        env: { ...process.env },
        timeout: step.timeout || DEFAULT_TIMEOUT,
      });

      const duration = (Date.now() - stepStart) / 1000;
      results.push({ name: step.name, step: step.index, success: true, duration });
      console.log(`\n✓ [${step.index}] ${step.name} completed in ${duration.toFixed(1)}s`);
    } catch (err) {
      const duration = (Date.now() - stepStart) / 1000;
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({
        name: step.name,
        step: step.index,
        success: false,
        duration,
        error: errorMsg,
      });
      console.error(`\n✗ [${step.index}] ${step.name} failed after ${duration.toFixed(1)}s`);
      // Continue to next step even on failure
    }
  }

  // Summary
  const totalDuration = (Date.now() - startTime) / 1000;
  const minutes = Math.floor(totalDuration / 60);
  const seconds = Math.round(totalDuration % 60);
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log("\n" + "=".repeat(60));
  console.log("Full Sync Summary");
  console.log("=".repeat(60));
  console.log(`Total duration: ${minutes}m ${seconds}s`);
  console.log(`Steps: ${succeeded} succeeded, ${failed} failed\n`);

  for (const r of results) {
    const icon = r.success ? "✓" : "✗";
    const time =
      r.duration >= 60
        ? `${Math.floor(r.duration / 60)}m ${Math.round(r.duration % 60)}s`
        : `${r.duration.toFixed(1)}s`;
    console.log(`  ${icon} [${r.step}] ${r.name} (${time})`);
  }

  if (failed > 0) {
    console.log(
      `\nTo resume from first failure: npm run sync:full -- --from=${results.find((r) => !r.success)?.step}`
    );
    process.exit(1);
  }

  console.log("\nFull sync completed successfully!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
