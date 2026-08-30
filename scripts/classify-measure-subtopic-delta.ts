import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { db } from "../src/lib/db";
import {
  applySubtopicDeltaReport,
  parseSubtopicDeltaReport,
} from "../src/services/measures/subtopic-delta-apply";
import { parseSubtopicDeltaCLIOptions } from "../src/lib/measures/subtopic-delta-options";
import { generateSubtopicDeltaDryRun } from "../src/services/measures/subtopic-delta-report";

const REPORT_DIRECTORY = resolve(process.cwd(), ".tmp/measure-subtopic-delta");

function resolveReportPath(rawPath: string): string {
  const resolved = resolve(process.cwd(), rawPath);
  if (!resolved.startsWith(`${REPORT_DIRECTORY}${sep}`)) {
    throw new Error(`Le rapport doit se trouver dans ${REPORT_DIRECTORY}`);
  }
  return resolved;
}

function assertExpectedParameters(
  report: ReturnType<typeof parseSubtopicDeltaReport>,
  options: ReturnType<typeof parseSubtopicDeltaCLIOptions>
): void {
  if (options.mode !== "apply") return;
  if (options.subtopicSlug && options.subtopicSlug !== report.parameters.subtopic) {
    throw new Error("--subtopic ne correspond pas au rapport");
  }
  if (options.electionSlug && options.electionSlug !== report.parameters.election) {
    throw new Error("--election ne correspond pas au rapport");
  }
  if (options.limit && options.limit !== report.parameters.limit) {
    throw new Error("--limit ne correspond pas au rapport");
  }
  if (options.after && options.after !== report.parameters.after) {
    throw new Error("--after ne correspond pas au rapport");
  }
}

async function main(): Promise<void> {
  const options = parseSubtopicDeltaCLIOptions(process.argv.slice(2));
  if (options.mode === "dry-run") {
    if (!process.env.MISTRAL_API_KEY)
      throw new Error("MISTRAL_API_KEY doit être définie dans .env");
    const report = await generateSubtopicDeltaDryRun({
      subtopicSlug: options.subtopicSlug,
      electionSlug: options.electionSlug,
      limit: options.limit,
      after: options.after,
    });
    mkdirSync(REPORT_DIRECTORY, { recursive: true });
    const reportPath = resolve(REPORT_DIRECTORY, `${report.runId}.json`);
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    console.log(`${report.scannedMeasures} mesure(s) parcourue(s).`);
    console.log(
      `${report.selectedMeasureCount} mesure(s) candidate(s) envoyée(s) au classificateur.`
    );
    console.log(
      `${report.decisions.APPLIES} APPLIES, ${report.decisions.DOES_NOT_APPLY} DOES_NOT_APPLY, ${report.decisions.UNCERTAIN} UNCERTAIN, ${report.errors.length} erreur(s).`
    );
    if (report.nextAfter) console.log(`Lot suivant : --after ${report.nextAfter}`);
    console.log(`Rapport : ${reportPath}`);
    return;
  }

  const reportPath = resolveReportPath(options.reportPath);
  const report = parseSubtopicDeltaReport(JSON.parse(readFileSync(reportPath, "utf8")));
  assertExpectedParameters(report, options);
  const result = await applySubtopicDeltaReport(report);
  console.log(`${result.created} suggestion(s) créée(s), ${result.ignored.length} ignorée(s).`);
  console.log(`Identifiant d’exécution : ${result.runId}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
