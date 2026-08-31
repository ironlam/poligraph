import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseReaderGuideFinalizationOptions } from "../src/lib/measures/reader-guide-finalization-options";
import {
  applyReaderGuideFinalization,
  prepareReaderGuideFinalization,
} from "../src/lib/measures/reader-guide-finalization";

async function main(): Promise<void> {
  const options = parseReaderGuideFinalizationOptions(process.argv.slice(2));
  const runId = randomUUID();
  const actor = `cli:reader-guides:${runId}`;
  const plan = await prepareReaderGuideFinalization({
    electionSlug: options.electionSlug,
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
    ...(options.after ? { after: options.after } : {}),
  });
  const applied = options.apply
    ? await applyReaderGuideFinalization(plan, actor)
    : { publishedGuides: 0, approvedMentions: 0, errors: [] };

  const reportDir = join(process.cwd(), "scripts", ".local");
  await mkdir(reportDir, { recursive: true });
  const reportPath = join(reportDir, `reader-guide-finalization-${runId}.json`);
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        runId,
        createdAt: new Date().toISOString(),
        mode: options.apply ? "apply" : "dry-run",
        parameters: options,
        plan,
        applied,
      },
      null,
      2
    )
  );

  console.log(`${plan.scanned} proposition(s) relue(s) par la commande.`);
  console.log(`${plan.ready} rattachement(s) prêt(s).`);
  console.log(`${plan.guidesToPublish.length} repère(s) sourcé(s) à publier.`);
  console.log(`${plan.unresolved} terme(s) sans repère sourcé.`);
  if (plan.unresolvedTerms.length > 0) {
    console.log(
      `Termes uniques à documenter : ${plan.unresolvedTerms
        .slice(0, 20)
        .map((term) => `${term.example} (${term.occurrences})`)
        .join(", ")}`
    );
  }
  console.log(`${plan.invalidGuides} brouillon(s) incomplet(s) ou invalide(s).`);
  console.log(`${plan.duplicates} rattachement(s) déjà couvert(s).`);
  if (options.apply) {
    console.log(`${applied.publishedGuides} repère(s) publié(s).`);
    console.log(`${applied.approvedMentions} rattachement(s) approuvé(s).`);
    console.log(`${applied.errors.length} erreur(s) individuelle(s).`);
  } else {
    console.log("Simulation uniquement. Aucune écriture effectuée.");
  }
  console.log(`Rapport : ${reportPath}`);
  if (plan.nextAfter && options.limit !== undefined && plan.scanned === options.limit) {
    console.log(`Lot suivant : --after ${plan.nextAfter}`);
  }
  if (applied.errors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
