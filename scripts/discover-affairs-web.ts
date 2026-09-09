/**
 * Découverte d'affaires par recherche web.
 *
 * Usage :
 *   npx tsx --env-file=.env scripts/discover-affairs-web.ts --limit=200 --dry-run
 *   npx tsx --env-file=.env scripts/discover-affairs-web.ts --limit=200
 *
 * Chaque politicien coûte un crédit Brave. Le mode --dry-run interroge Brave et
 * l'IA mais n'écrit aucun brouillon : c'est le mode de mesure.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { discoverAffairsWeb } from "@/services/sync/discover-affairs-web";
import { getAnthropicUsage } from "@/lib/api/anthropic";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]!, 10) : 50;
const tierArg = args.find((a) => a.startsWith("--tier="));
const onlyTier = tierArg ? parseInt(tierArg.split("=")[1]!, 10) : undefined;

async function main() {
  console.log(
    `Découverte web : ${limit} politiciens${dryRun ? " [DRY-RUN, aucune écriture]" : ""}`
  );
  console.log("");

  const started = Date.now();
  const stats = await discoverAffairsWeb({ limit, dryRun, onlyTier });
  const seconds = ((Date.now() - started) / 1000).toFixed(0);

  console.log("");
  console.log("=== Résultat ===");
  console.log(`  politiciens cherchés     : ${stats.politiciansSearched}`);
  console.log(`  résultats renvoyés       : ${stats.resultsReturned}`);
  console.log(`  écartés par le filtre    : ${stats.resultsScreenedOut}`);
  console.log(`  jugés par l'IA           : ${stats.resultsJudged}`);
  // Sans le détail des rejets, une chute du rendement est indistinguable d'une
  // garde trop stricte : c'est la question que la mesure doit trancher.
  console.log(`    dont « ne vise pas »   : ${stats.notSubject}`);
  console.log(`    dont identité rejetée  : ${stats.identityRejected}`);
  console.log(`    dont source non datée  : ${stats.undatedSkipped}`);
  console.log(`    dont doublon           : ${stats.duplicatesSkipped}`);
  console.log(`    dont stade non attesté : ${stats.statusUnknown}`);
  console.log(`    dont citation absente  : ${stats.statusUnsupported}`);
  console.log(`    dont élu déjà documenté: ${stats.alreadyDocumented}`);
  console.log(
    `  brouillons ${dryRun ? "qui seraient créés" : "créés          "} : ${stats.affairsCreated}`
  );
  console.log(`  durée                    : ${seconds} s`);

  if (stats.quotaExhausted) {
    console.log("");
    console.log("  ATTENTION : solde Brave épuisé, la passe s'est arrêtée avant la fin.");
  }

  const usage = getAnthropicUsage();
  const totals = Object.values(usage).reduce(
    (a, t) => ({
      calls: a.calls + t.calls,
      in: a.in + t.inputTokens,
      out: a.out + t.outputTokens,
      read: a.read + t.cacheReadTokens,
      write: a.write + t.cacheCreationTokens,
    }),
    { calls: 0, in: 0, out: 0, read: 0, write: 0 }
  );
  console.log("");
  console.log("=== Coût ===");
  console.log(`  crédits Brave consommés  : ${stats.politiciansSearched}`);
  console.log(
    `  appels IA : ${totals.calls} | in ${totals.in} | out ${totals.out} | cache lu ${totals.read} | cache écrit ${totals.write}`
  );
  // Sonnet 5 : 2 $/MTok entrée, 10 $/MTok sortie, lecture de cache à 0,20 $/MTok.
  const cout =
    (totals.in * 2 + totals.out * 10 + totals.read * 0.2 + totals.write * 2.5) / 1_000_000;
  console.log(`  coût IA estimé           : ${cout.toFixed(4)} $`);

  if (stats.errors.length > 0) {
    console.log("");
    console.log(`=== ${stats.errors.length} erreur(s) ===`);
    for (const e of stats.errors.slice(0, 10)) console.log(`  ${e}`);
  }
}

main()
  .catch((e) => {
    console.error("ERREUR", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
