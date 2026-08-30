#!/usr/bin/env tsx
import { getMistralTokensUsed } from "@/lib/api/mistral";
import { parseSearchEmbeddingCLIOptions } from "@/lib/search/embedding-options";
import { db } from "@/lib/db";
import { embedPresidentialSearchDocuments } from "@/services/presidentielle/search-embeddings";

async function main(): Promise<void> {
  const options = parseSearchEmbeddingCLIOptions(process.argv.slice(2));
  if (!options.dryRun && !process.env.MISTRAL_API_KEY) {
    throw new Error("MISTRAL_API_KEY doit être définie dans .env");
  }

  const result = await embedPresidentialSearchDocuments({
    ...options,
    onBatch: (progress) => {
      console.log(
        `[search:embed] ${progress.dryRun ? "simulation" : "écriture"} ` +
          `type=${progress.entityType} scanned=${progress.scanned} stale=${progress.embedded} ` +
          `fresh=${progress.skippedFresh} batches=${progress.batches} lastId=${progress.lastId}`
      );
    },
  });

  console.log(
    `[search:embed] terminé type=${result.entityType} scanned=${result.scanned} ` +
      `${result.dryRun ? "wouldEmbed" : "embedded"}=${result.embedded} ` +
      `fresh=${result.skippedFresh} lastId=${result.lastId ?? "none"} ` +
      `tokens=${getMistralTokensUsed()}`
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
