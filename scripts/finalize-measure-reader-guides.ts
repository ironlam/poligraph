import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseReaderGuideFinalizationOptions } from "../src/lib/measures/reader-guide-finalization-options";
import {
  applyReaderGuideFinalization,
  getFinalizedReaderGuideMentionIds,
  hashReaderGuideFinalizationPlan,
  isReaderGuideFinalizationRetryCompatible,
  prepareReaderGuideFinalization,
  type ReaderGuideFinalizationPlan,
} from "../src/services/measures/reader-guide-finalization";

type DryRunReport = {
  mode: "dry-run";
  parameters: {
    electionSlug: string;
    limit?: number;
    after?: string;
    all: boolean;
  };
  plan: ReaderGuideFinalizationPlan;
  planHash: string;
};

async function loadReviewedReport(path: string): Promise<DryRunReport> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("mode" in parsed) ||
    parsed.mode !== "dry-run" ||
    !("parameters" in parsed) ||
    typeof parsed.parameters !== "object" ||
    parsed.parameters === null ||
    !("plan" in parsed) ||
    typeof parsed.plan !== "object" ||
    parsed.plan === null ||
    !("planHash" in parsed) ||
    typeof parsed.planHash !== "string"
  ) {
    throw new Error("Le rapport fourni n'est pas un dry-run de finalisation valide");
  }
  const report = parsed as DryRunReport;
  if (hashReaderGuideFinalizationPlan(report.plan) !== report.planHash) {
    throw new Error("Le rapport de dry-run a été modifié après sa génération");
  }
  return report;
}

async function main(): Promise<void> {
  const options = parseReaderGuideFinalizationOptions(process.argv.slice(2));
  const runId = randomUUID();
  const actor = `cli:reader-guides:${runId}`;
  const reviewedReport = options.apply ? await loadReviewedReport(options.report!) : null;
  const selection = reviewedReport?.parameters ?? options;
  const plan = await prepareReaderGuideFinalization({
    electionSlug: selection.electionSlug,
    ...(reviewedReport
      ? { mentionIds: reviewedReport.plan.items.map((item) => item.mentionId) }
      : {
          ...(selection.limit !== undefined ? { limit: selection.limit } : {}),
          ...(selection.after ? { after: selection.after } : {}),
        }),
  });
  const planHash = hashReaderGuideFinalizationPlan(plan);
  const finalizedMentionIds = reviewedReport
    ? await getFinalizedReaderGuideMentionIds(
        reviewedReport.plan.items.map((item) => item.mentionId)
      )
    : new Set<string>();
  if (
    reviewedReport &&
    planHash !== reviewedReport.planHash &&
    !isReaderGuideFinalizationRetryCompatible(reviewedReport.plan, plan, finalizedMentionIds)
  ) {
    throw new Error(
      "Le lot a changé depuis le dry-run. Générez et relisez un nouveau rapport avant application."
    );
  }
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
        sourceReport: options.report ?? null,
        plan,
        planHash,
        applied,
      },
      null,
      2
    )
  );

  console.log(`${plan.scanned} proposition(s) incluse(s) dans le lot.`);
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
  if (plan.nextAfter && selection.limit !== undefined && plan.scanned === selection.limit) {
    console.log(`Lot suivant : --after ${plan.nextAfter}`);
  }
  if (applied.errors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
