import { getMistralTokensUsed } from "../src/lib/api/mistral";
import { db } from "../src/lib/db";
import {
  findMeasureContextCandidateIds,
  generateMeasureContextDraft,
} from "../src/lib/measures/context-generation";
import { parseMeasureContextGenerationOptions } from "../src/lib/measures/context-generation-options";

const ALL_ELIGIBLE_CONTEXTS = Number.MAX_SAFE_INTEGER;

async function main(): Promise<void> {
  const options = parseMeasureContextGenerationOptions(process.argv.slice(2));
  const eligibleIds = await findMeasureContextCandidateIds(
    options.electionSlug,
    options.all ? ALL_ELIGIBLE_CONTEXTS : options.limit
  );

  console.log(
    `${eligibleIds.length} mesure(s) éligible(s) ${options.all ? "dans la file complète" : "dans ce lot"}.`
  );
  if (!options.apply) {
    console.log("Simulation uniquement. Ajouter --apply pour créer les brouillons.");
    return;
  }
  if (!process.env.MISTRAL_API_KEY) throw new Error("MISTRAL_API_KEY doit être définie dans .env");

  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const measureId of eligibleIds) {
    try {
      const result = await generateMeasureContextDraft(measureId, { generatedBy: "cli" });
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
