import { db } from "../src/lib/db";
import { parseCLIOptions } from "../src/lib/cli/parse-options";
import { findMeasureContextCandidateIds } from "../src/lib/measures/context-generation";
import { MEASURE_CONTEXT_PROMPT_VERSION } from "../src/lib/measures/context-provenance";
import { readEvidenceSnapshot } from "../src/lib/measures/evidence-snapshot";
import { PUBLIC_PRESIDENTIAL_MEASURE_WHERE } from "../src/lib/presidentielle/publication";

const ALL_CANDIDATES = Number.MAX_SAFE_INTEGER;

async function main() {
  const parsed = parseCLIOptions(process.argv.slice(2), [
    { name: "--election", type: "string" },
  ] as const);
  const electionSlug =
    typeof parsed.election === "string" ? parsed.election : "presidentielle-2027";

  const [measures, queuedIds] = await Promise.all([
    db.measure.findMany({
      where: {
        election: { slug: electionSlug },
        ...PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
      },
      select: {
        latestRevisionId: true,
        publishedRevisionId: true,
        publishedRevision: { select: { details: true, evidenceSnapshot: true } },
        latestRevision: { select: { details: true, extractorVersion: true } },
      },
    }),
    findMeasureContextCandidateIds(electionSlug, ALL_CANDIDATES),
  ]);

  const report = {
    election: electionSlug,
    promptVersion: MEASURE_CONTEXT_PROMPT_VERSION,
    totalPublicMeasures: measures.length,
    publishedContexts: 0,
    pendingContextDrafts: 0,
    pendingDraftsByExtractorVersion: {} as Record<string, number>,
    activeDraftWithoutContext: 0,
    missingEvidenceSnapshot: 0,
    invalidEvidenceSnapshot: 0,
    sourceWithoutDistinctContext: 0,
    evidenceEligible: 0,
    queuedForGeneration: queuedIds.length,
    previousAttemptOrTerminalResult: 0,
  };

  for (const measure of measures) {
    if (measure.publishedRevision?.details?.trim()) {
      report.publishedContexts += 1;
      continue;
    }
    if (measure.latestRevisionId !== measure.publishedRevisionId) {
      if (measure.latestRevision?.details?.trim()) {
        report.pendingContextDrafts += 1;
        const version = measure.latestRevision.extractorVersion ?? "unknown";
        report.pendingDraftsByExtractorVersion[version] =
          (report.pendingDraftsByExtractorVersion[version] ?? 0) + 1;
      } else report.activeDraftWithoutContext += 1;
      continue;
    }

    const evidence = readEvidenceSnapshot(measure.publishedRevision?.evidenceSnapshot);
    if (evidence.status === "ABSENT") report.missingEvidenceSnapshot += 1;
    else if (evidence.status === "INVALID") report.invalidEvidenceSnapshot += 1;
    else if (evidence.snapshot.supportingIds.length === 0) {
      report.sourceWithoutDistinctContext += 1;
    } else report.evidenceEligible += 1;
  }
  report.previousAttemptOrTerminalResult = Math.max(
    0,
    report.evidenceEligible - report.queuedForGeneration
  );

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
