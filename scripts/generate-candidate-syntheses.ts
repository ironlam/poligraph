/**
 * Generates the synthesis shown on a presidential candidate's page.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/generate-candidate-syntheses.ts
 *   npx tsx --env-file=.env scripts/generate-candidate-syntheses.ts --apply
 *   npx tsx --env-file=.env scripts/generate-candidate-syntheses.ts --apply --only=jean-luc-melenchon
 *
 * Dry run by default: it prints the text it would store and writes nothing.
 *
 * The generation itself lives in `@/services/candidate-synthesis`, which the admin button calls
 * too. This file is the batch shell around it: which candidacies to walk, and what to print.
 */

import { db } from "@/lib/db";
import {
  generateCandidateSynthesis,
  type SynthesisGenerationResult,
} from "@/services/candidate-synthesis";

const ELECTION_SLUG = "presidentielle-2027";

const apply = process.argv.includes("--apply");
const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];

function describeRefusal(result: Extract<SynthesisGenerationResult, { ok: false }>): string {
  return `${result.reason} — ${result.message}`;
}

async function main(): Promise<void> {
  const election = await db.election.findFirst({
    where: { slug: ELECTION_SLUG },
    select: { id: true },
  });
  if (!election) throw new Error(`élection ${ELECTION_SLUG} introuvable`);

  const candidacies = await db.candidacy.findMany({
    where: {
      electionId: election.id,
      status: "DECLARE",
      ...(only ? { politician: { slug: only } } : {}),
    },
    select: { id: true, candidateName: true },
    orderBy: { candidateName: "asc" },
  });

  // Which syntheses are STALE is not asked here. That question needs the public measure population,
  // which lives behind `server-only` and cannot be imported under tsx, and the admin candidates
  // screen already answers it per row with a button beside the answer. This script stays what it
  // was: the whole field, in one pass.
  console.log(
    `${apply ? "APPLY (écrit en base)" : "dry run"} — ${candidacies.length} candidature(s) déclarée(s)\n`
  );

  let written = 0;
  let rejected = 0;

  for (const candidacy of candidacies) {
    const result = await generateCandidateSynthesis(candidacy.id, { persist: apply });

    if (!result.ok) {
      rejected++;
      console.log(`REFUSÉ ${candidacy.candidateName} : ${describeRefusal(result)}\n`);
      continue;
    }

    console.log(
      `OK ${candidacy.candidateName} (${result.mandateCount} mandats, ${result.measureCount} mesures, ${result.provider})`
    );
    console.log(`${result.text}\n`);
    if (result.persisted) written++;
  }

  console.log(
    apply
      ? `\n${written} synthèses écrites, ${rejected} refusées`
      : `\ndry run — ${rejected} refusées, passer --apply pour écrire`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
