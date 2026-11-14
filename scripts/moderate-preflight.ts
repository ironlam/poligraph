import "dotenv/config";

import { db } from "@/lib/db";
import { runPreflight } from "@/lib/moderation/preflight";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

interface CliArgs {
  limit?: number;
  autoMerge: boolean;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = { autoMerge: false, dryRun: false };
  for (const arg of args) {
    if (arg.startsWith("--limit=")) {
      result.limit = Number(arg.slice("--limit=".length));
      if (Number.isNaN(result.limit) || result.limit <= 0) {
        console.error(`Invalid --limit value: ${arg}`);
        process.exit(2);
      }
    } else if (arg === "--auto-merge") {
      result.autoMerge = true;
    } else if (arg === "--dry-run") {
      result.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: npm run moderate:preflight -- [--limit=N] [--auto-merge] [--dry-run]");
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return result;
}

async function main() {
  const args = parseArgs();
  console.log(
    `🛫 Running moderation preflight (limit=${args.limit ?? "all"}, auto-merge=${args.autoMerge}, dry-run=${args.dryRun})`
  );

  const startedAt = Date.now();
  // Pas de crédit Anthropic : la session /moderate juge elle-même chaque brouillon.
  const report = await runPreflight({ source: "manual", limit: args.limit, skipModeration: true });
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(`\n📊 Stats (${elapsedSec}s):`);
  console.log(`   Total drafts:            ${report.stats.totalDrafts}`);
  console.log(`   Avis IA :                désactivé (la session /moderate juge chaque brouillon)`);
  console.log(`   Attribution issues:      ${report.stats.attributionIssues}`);
  console.log(`   Duplicate groups:        ${report.stats.duplicateGroups}`);

  if (args.autoMerge) {
    const eligible = report.duplicateGroups.filter((g) => g.autoMergeEligible);
    console.log(`\n🔀 Auto-merge: ${eligible.length} groups eligible (score >= 0.95)`);
    for (const group of eligible) {
      console.log(
        `   Would merge ${group.affairIds.length} affairs → keep ${group.recommendedKeep} (score=${group.score})`
      );
    }
    console.log(
      `\n   ⚠️  Auto-merge execution is stubbed for safety. The actual merge will be wired in a follow-up plan.`
    );
  }

  if (!args.dryRun) {
    const outDir = path.join(process.cwd(), "data");
    await mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, "moderation-preflight.json");
    await writeFile(outPath, JSON.stringify(report, null, 2));
    console.log(`\n✅ Report written to ${outPath}`);
  } else {
    console.log(`\n(dry-run: report not written to disk)`);
  }

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
