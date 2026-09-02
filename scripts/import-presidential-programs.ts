#!/usr/bin/env tsx
import { db } from "@/lib/db";
import {
  formatProgramImportProgress,
  reconcileProgramImportReportFile,
  runProgramImport,
} from "@/services/measures/program-import/pipeline";
import {
  assertV6ShadowReadOnly,
  formatV6ShadowProgress,
  runV6ShadowImport,
} from "@/services/measures/program-import/shadow-v6";
import { runV6DraftImport } from "@/services/measures/program-import/draft-import-v6";

function value(name: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const draftV6 = argv.includes("--draft-v6");
  const partyProgramCandidacyId = value("party-program-candidacy-id");
  if (draftV6 && argv.includes("--shadow-v6")) {
    throw new Error("Options incompatibles: choisir --draft-v6 ou --shadow-v6.");
  }
  if (draftV6 && partyProgramCandidacyId) {
    throw new Error(
      "L'attribution explicite PARTY_PROGRAM est disponible uniquement en shadow V6 lecture seule."
    );
  }
  const shadowV6 = draftV6 ? false : assertV6ShadowReadOnly(argv);
  const reconcileReport = value("reconcile-report");
  if (reconcileReport) {
    if (shadowV6) {
      throw new Error("La réconciliation d'un rapport V5 ne peut pas utiliser le moteur V6.");
    }
    const report = await reconcileProgramImportReportFile(reconcileReport);
    const accepted = report.candidates.reduce(
      (total, candidate) =>
        total + candidate.proposals.filter((proposal) => proposal.accepted).length,
      0
    );
    console.log(
      `[program-import] rapport réconcilié avec ${report.decisionPolicyVersion}: ${accepted} propositions retenues`
    );
    return;
  }
  const apply = process.argv.includes("--apply");
  const limitValue = value("limit");
  if (draftV6) {
    const report = await runV6DraftImport({
      apply,
      confirmDraftWrite: argv.includes("--confirm-draft-write"),
      candidate: value("candidate"),
      party: value("party"),
      source: value("source"),
      limit: limitValue ? Number(limitValue) : undefined,
      forceRefetch: argv.includes("--force-refetch"),
      onProgress: (event) => {
        const message = formatV6ShadowProgress(event);
        if (message) console.log(message);
      },
    });
    console.log(
      `[program-import-v6] ${report.mode}, READY ${report.counts.readyForReview}, WARNING ${report.counts.reviewWithWarning}, BLOCKED ${report.counts.technicallyBlocked}`
    );
    console.log(
      `[program-import-v6] déjà présents ${report.counts.alreadyExisting}, DRAFTs à créer ${report.counts.wouldCreateDrafts}, créés ${report.counts.draftsCreated}`
    );
    return;
  }
  if (shadowV6) {
    const report = await runV6ShadowImport({
      candidate: value("candidate"),
      party: value("party"),
      partyProgramCandidacyId,
      source: value("source"),
      limit: limitValue ? Number(limitValue) : undefined,
      forceRefetch: process.argv.includes("--force-refetch"),
      onProgress: (event) => {
        const message = formatV6ShadowProgress(event);
        if (message) console.log(message);
      },
    });
    console.log(
      `[program-import-v6] shadow READ-ONLY, ${report.documents.parsed}/${report.documents.known} documents parsés`
    );
    console.log(
      `[program-import-v6] ${report.extraction.eligibleForHumanReview} propositions éligibles à la revue, draftsCreated=0, DB writes=NO`
    );
    return;
  }
  const report = await runProgramImport({
    apply,
    candidate: value("candidate"),
    party: value("party"),
    source: value("source"),
    limit: limitValue ? Number(limitValue) : undefined,
    forceRefetch: process.argv.includes("--force-refetch"),
    onProgress: (event) => {
      const message = formatProgramImportProgress(event);
      if (message) console.log(message);
    },
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
