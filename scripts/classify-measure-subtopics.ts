import { db } from "../src/lib/db";
import {
  getPreviouslyClassifiedMeasureRevisionIds,
  proposeMeasureRevisionSubtopics,
  syncMeasureSubtopicTaxonomy,
} from "../src/lib/measures/subtopics";
import { getMistralTokensUsed } from "../src/lib/api/mistral";
import { parseMeasureSubtopicClassificationOptions } from "../src/lib/measures/subtopic-classification-options";

async function main(): Promise<void> {
  const options = parseMeasureSubtopicClassificationOptions(process.argv.slice(2));
  if (!process.env.MISTRAL_API_KEY) {
    throw new Error("MISTRAL_API_KEY doit être définie dans .env");
  }
  const processedRevisionIds = options.force
    ? []
    : await getPreviouslyClassifiedMeasureRevisionIds();
  const rows = await db.measure.findMany({
    where: {
      election: { slug: options.electionSlug },
      ...(options.candidateSlug
        ? { candidacy: { is: { politician: { is: { slug: options.candidateSlug } } } } }
        : {}),
      publishedRevisionId: {
        not: null,
        ...(processedRevisionIds.length > 0 ? { notIn: processedRevisionIds } : {}),
      },
      ...(!options.force
        ? {
            publishedRevision: {
              is: { subtopics: { none: {} } },
            },
          }
        : {}),
    },
    select: { id: true, publishedRevisionId: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: options.limit,
  });

  console.log(`${rows.length} révisions à traiter${options.dryRun ? " en simulation" : ""}.`);
  if (!options.dryRun) await syncMeasureSubtopicTaxonomy();
  let proposed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (!row.publishedRevisionId) continue;
    try {
      const result = await proposeMeasureRevisionSubtopics(row.publishedRevisionId, {
        dryRun: options.dryRun,
        proposedBy: "cli",
        skipTaxonomySync: true,
      });
      if (result.skipped) {
        skipped += 1;
        console.log(`${row.id}: ignorée, validation humaine déjà présente.`);
      } else {
        proposed += result.suggestions.length;
        const labels = result.suggestions.map((item) => item.slug).join(", ") || "aucune";
        console.log(`${row.id}: ${labels}`);
      }
    } catch (error) {
      failed += 1;
      console.error(`${row.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(
    `${proposed} propositions, ${skipped} ignorées, ${failed} erreurs, ${getMistralTokensUsed()} tokens Mistral.`
  );
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
