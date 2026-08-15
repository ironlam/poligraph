#!/usr/bin/env tsx
import { db } from "@/lib/db";
import { runProgramImport } from "@/services/measures/program-import/pipeline";

function value(name: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const limitValue = value("limit");
  const concurrencyValue = value("concurrency");
  const segmentConcurrency = concurrencyValue ? Number(concurrencyValue) : undefined;
  if (
    segmentConcurrency !== undefined &&
    (!Number.isInteger(segmentConcurrency) || segmentConcurrency < 1 || segmentConcurrency > 8)
  ) {
    throw new Error("--concurrency doit être un entier compris entre 1 et 8");
  }

  const report = await runProgramImport({
    apply,
    candidate: value("candidate"),
    party: value("party"),
    source: value("source"),
    limit: limitValue ? Number(limitValue) : undefined,
    forceRefetch: process.argv.includes("--force-refetch"),
    segmentConcurrency,
    onProgress: (event) => {
      if (event.kind === "document") {
        console.log(
          `[program-import] ${event.label}: ${event.segmentsTotal} segment(s) à extraire (${event.editionId})`
        );
        return;
      }
      console.log(
        `[program-import] ${event.label}: ${event.completed}/${event.total} segments, ${event.proposals} propositions, ${event.failed} échec(s)`
      );
    },
  });
  console.log(
    `[program-import] ${report.mode}, ${report.documents.parsed}/${report.documents.known} documents parsés`
  );
  console.log(
    `  segments ${report.extraction.segmentsSucceeded}/${report.extraction.segmentsTotal}, échecs ${report.extraction.segmentsFailed}`
  );
  console.log(
    `  propositions ${report.propositions.detected}, mesures ${report.propositions.measures}, objectifs ${report.propositions.objectives}`
  );
  console.log(
    `  ambiguës ${report.propositions.ambiguous}, rejetées ${report.propositions.rejected}, doublons ${report.propositions.duplicates}`
  );
  console.log(
    `  fallbacks citation ${report.extraction.normalizationFallbacks}, thèmes invalides ${report.extraction.invalidThemes}`
  );
  console.log(
    `  drafts créés ${report.database.draftsCreated}, déjà présents ${report.database.alreadyPresent}`
  );
  console.log("  rapport .tmp/program-import/reports/presidentielle-2027-program-import.md");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
