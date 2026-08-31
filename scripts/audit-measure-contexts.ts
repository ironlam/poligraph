import { db } from "../src/lib/db";
import { parseCLIOptions } from "../src/lib/cli/parse-options";
import { filterMeasureContextCandidateIds } from "../src/lib/measures/context-generation";
import { MEASURE_CONTEXT_PROMPT_VERSION } from "../src/lib/measures/context-provenance";
import { readEvidenceSnapshot } from "../src/lib/measures/evidence-snapshot";
import { PUBLIC_PRESIDENTIAL_MEASURE_WHERE } from "../src/lib/presidentielle/publication";

const PAGE_SIZE = 250;

async function main() {
  const parsed = parseCLIOptions(process.argv.slice(2), [
    { name: "--election", type: "string" },
  ] as const);
  const electionSlug =
    typeof parsed.election === "string" ? parsed.election : "presidentielle-2027";

  const report = {
    election: electionSlug,
    promptVersion: MEASURE_CONTEXT_PROMPT_VERSION,
    totalPublicMeasures: 0,
    publishedContexts: 0,
    pendingContextDrafts: 0,
    pendingDraftsByExtractorVersion: {} as Record<string, number>,
    activeDraftWithoutContext: 0,
    missingEvidenceSnapshot: 0,
    invalidEvidenceSnapshot: 0,
    sourceWithoutDistinctContext: 0,
    evidenceEligible: 0,
    queuedForGeneration: 0,
    terminalNoUsefulContext: 0,
    terminalInvalidContext: 0,
    terminalHistoricalContext: 0,
    retryableInvalidContext: 0,
    generationInProgress: 0,
    unexplainedEligibleExclusions: 0,
  };

  let cursor: string | undefined;
  while (true) {
    const measures = await db.measure.findMany({
      where: {
        election: { slug: electionSlug },
        ...PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
      },
      select: {
        id: true,
        latestRevisionId: true,
        publishedRevisionId: true,
        publishedRevision: { select: { details: true, evidenceSnapshot: true } },
        latestRevision: { select: { details: true, extractorVersion: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (measures.length === 0) break;
    report.totalPublicMeasures += measures.length;
    report.queuedForGeneration += (
      await filterMeasureContextCandidateIds(
        measures.map(({ id }) => id),
        measures.length
      )
    ).length;

    const eligibleRevisionIds: string[] = [];
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
      } else {
        report.evidenceEligible += 1;
        if (measure.publishedRevisionId) eligibleRevisionIds.push(measure.publishedRevisionId);
      }
    }

    const attempts =
      eligibleRevisionIds.length === 0
        ? []
        : await db.auditLog.findMany({
            where: {
              entityType: "MeasureRevision",
              entityId: { in: eligibleRevisionIds },
              action: {
                in: [
                  "GENERATE_CONTEXT_TERMINAL_RESULT",
                  "GENERATE_CONTEXT_INVALID_RESULT",
                  "RESERVE_CONTEXT_GENERATION",
                ],
              },
            },
            select: { action: true, entityId: true, changes: true },
          });
    const states = new Map<
      string,
      { activeReservation: boolean; invalidCount: number; terminal: string | null }
    >();
    for (const attempt of attempts) {
      const changes =
        attempt.changes && typeof attempt.changes === "object" && !Array.isArray(attempt.changes)
          ? (attempt.changes as Record<string, unknown>)
          : {};
      if (
        typeof changes.promptVersion === "string" &&
        changes.promptVersion !== MEASURE_CONTEXT_PROMPT_VERSION
      ) {
        continue;
      }
      const state = states.get(attempt.entityId) ?? {
        activeReservation: false,
        invalidCount: 0,
        terminal: null,
      };
      if (attempt.action === "GENERATE_CONTEXT_TERMINAL_RESULT") {
        state.terminal = typeof changes.outcome === "string" ? changes.outcome : "TERMINAL";
      } else if (attempt.action === "GENERATE_CONTEXT_INVALID_RESULT") {
        state.invalidCount += 1;
      } else if (attempt.action === "RESERVE_CONTEXT_GENERATION") {
        const expiresAt = typeof changes.expiresAt === "string" ? Date.parse(changes.expiresAt) : 0;
        if (Number.isFinite(expiresAt) && expiresAt > Date.now()) state.activeReservation = true;
      }
      states.set(attempt.entityId, state);
    }
    for (const state of states.values()) {
      if (state.terminal === "NO_USEFUL_CONTEXT") report.terminalNoUsefulContext += 1;
      else if (state.terminal === "INVALID_GENERATED_CONTEXT" || state.invalidCount >= 2) {
        report.terminalInvalidContext += 1;
      } else if (state.terminal !== null) report.terminalHistoricalContext += 1;
      else if (state.activeReservation) report.generationInProgress += 1;
      else if (state.invalidCount === 1) report.retryableInvalidContext += 1;
    }

    if (measures.length < PAGE_SIZE) break;
    cursor = measures.at(-1)?.id;
    if (!cursor) break;
  }
  report.unexplainedEligibleExclusions = Math.max(
    0,
    report.evidenceEligible -
      report.queuedForGeneration -
      report.terminalNoUsefulContext -
      report.terminalInvalidContext -
      report.terminalHistoricalContext -
      report.retryableInvalidContext -
      report.generationInProgress
  );

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
