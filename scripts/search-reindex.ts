#!/usr/bin/env tsx
/**
 * npm run search:reindex
 *
 * Rebuilds search documents from their source entities. Idempotent and cursor-paginated.
 *
 * Examples:
 *   npm run search:reindex -- --election=presidentielle-2027
 *   npm run search:reindex -- --election=presidentielle-2027 --entity-type=MEASURE --batch-size=100
 *   npm run search:reindex -- --election=presidentielle-2027 --entity-type=CANDIDACY --after=<last-id>
 */
import { db } from "@/lib/db";
import {
  reindexSearchEntityType,
  type ReindexableSearchEntityType,
} from "@/lib/search/maintenance";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function entityTypes(): ReindexableSearchEntityType[] {
  const raw = argument("entity-type")?.toUpperCase() ?? "ALL";
  if (raw === "ALL") return ["MEASURE", "CANDIDACY"];
  if (raw === "MEASURE" || raw === "CANDIDACY") return [raw];
  throw new Error("--entity-type doit valoir MEASURE, CANDIDACY ou ALL");
}

function batchSize(): number | undefined {
  const raw = argument("batch-size");
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
    throw new Error("--batch-size doit être un entier compris entre 1 et 1000");
  }
  return parsed;
}

async function main(): Promise<void> {
  const types = entityTypes();
  const after = argument("after");
  const electionSlug = argument("election");
  if (!electionSlug) {
    throw new Error("--election est obligatoire pour borner la reconstruction");
  }
  if (after && types.length !== 1) {
    throw new Error("--after exige un seul --entity-type");
  }

  for (const entityType of types) {
    const result = await reindexSearchEntityType(entityType, {
      after,
      batchSize: batchSize(),
      electionSlug,
      onBatch: (progress) => {
        console.log(
          `[search:reindex] ${progress.entityType} processed=${progress.processed} ` +
            `batches=${progress.batches} lastId=${progress.lastId}`
        );
      },
    });
    console.log(
      `[search:reindex] terminé ${result.entityType} processed=${result.processed} ` +
        `lastId=${result.lastId ?? "none"}`
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
