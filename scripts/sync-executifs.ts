/**
 * Présidents de région et de département du RNE reliés à leur fiche (Territoires, D22).
 *
 * Usage :
 *   npx tsx --env-file=.env scripts/sync-executifs.ts            (rapport, aucune écriture)
 *   npx tsx --env-file=.env scripts/sync-executifs.ts --write
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { syncExecutifs } from "@/services/sync/executifs";

async function main() {
  const dryRun = !process.argv.includes("--write");
  console.log(`Exécutifs RNE${dryRun ? " [RAPPORT, aucune écriture]" : ""}`);
  const report = await syncExecutifs({ dryRun });

  const counts = new Map<string, number>();
  for (const l of report.lines) counts.set(l.verdict, (counts.get(l.verdict) ?? 0) + 1);
  console.log(`Présidents lus : ${report.lines.length}`, Object.fromEntries(counts));

  for (const l of [...report.lines].sort((a, b) => a.verdict.localeCompare(b.verdict))) {
    if (l.verdict === "SANS_FICHE") continue;
    console.log(
      `  ${l.verdict.padEnd(9)} ${l.niveau.slice(0, 3)} ${l.territoryCode.padEnd(3)} ${l.name.padEnd(30)} ${(l.slug ?? "").padEnd(28)} ${l.action}`
    );
  }
  const verbe = dryRun ? "à écrire" : "écrits";
  console.log(`Mandats ${verbe} : ${report.mandatesCreated}`);
  console.log(`Décisions d'identité ${verbe} : ${report.decisionsWritten}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
