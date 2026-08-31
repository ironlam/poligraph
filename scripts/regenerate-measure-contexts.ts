import { getMistralTokensUsed } from "../src/lib/api/mistral";
import { db } from "../src/lib/db";
import {
  findMeasureContextRegenerationCandidateIds,
  generateMeasureContextDraft,
} from "../src/lib/measures/context-generation";
import { parseMeasureContextRegenerationOptions } from "../src/lib/measures/context-regeneration-options";

async function main(): Promise<void> {
  const options = parseMeasureContextRegenerationOptions(process.argv.slice(2));
  const candidateIds = await findMeasureContextRegenerationCandidateIds({
    electionSlug: options.electionSlug,
    fromPromptVersion: options.fromPromptVersion,
    limit: options.limit,
    scope: options.scope,
  });

  console.log(
    `${candidateIds.length} contexte(s) ${options.fromPromptVersion} éligible(s) à une régénération (${options.scope}).`
  );
  if (options.dryRun) {
    console.log("Simulation uniquement. Ajouter --apply pour créer les nouveaux brouillons.");
    for (const measureId of candidateIds) console.log(measureId);
    return;
  }
  if (!process.env.MISTRAL_API_KEY) throw new Error("MISTRAL_API_KEY doit être définie dans .env");

  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const measureId of candidateIds) {
    try {
      const result = await generateMeasureContextDraft(measureId, {
        generatedBy: "cli",
        regenerateFromPromptVersion: options.fromPromptVersion,
      });
      if (result.status === "CREATED") {
        created += 1;
        console.log(`${measureId}: brouillon ${result.revisionId} créé`);
      } else {
        skipped += 1;
        console.log(`${measureId}: ignorée (${result.reason})`);
      }
    } catch (error) {
      failed += 1;
      console.error(`${measureId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(
    `${created} brouillon(s), ${skipped} ignorée(s), ${failed} erreur(s), ${getMistralTokensUsed()} tokens Mistral.`
  );
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
