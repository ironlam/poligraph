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
  const report = await runProgramImport({
    apply,
    candidate: value("candidate"),
    party: value("party"),
    source: value("source"),
    limit: limitValue ? Number(limitValue) : undefined,
    forceRefetch: process.argv.includes("--force-refetch"),
  });
  console.log(
    `[program-import] ${report.mode}, ${report.documents.parsed}/${report.documents.known} documents parsés`
  );
  console.log(
    `  propositions ${report.propositions.detected}, mesures ${report.propositions.measures}, objectifs ${report.propositions.objectives}`
  );
  console.log(
    `  ambiguës ${report.propositions.ambiguous}, rejetées ${report.propositions.rejected}, doublons ${report.propositions.duplicates}`
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
