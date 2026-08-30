import { z } from "zod";
import { MEASURE_SUBTOPICS, MEASURE_SUBTOPIC_TAXONOMY_VERSION } from "@/config/measure-subtopics";
import { db } from "@/lib/db";
import {
  createSubtopicDeltaSourceFingerprint,
  type SubtopicDeltaReport,
} from "@/lib/measures/subtopic-delta-report";
import { syncMeasureSubtopicTaxonomy } from "@/lib/measures/subtopics";
import { PUBLIC_PRESIDENTIAL_MEASURE_WHERE } from "@/lib/presidentielle/publication";

const selectionReasonSchema = z
  .object({
    signal: z.enum(["LEXICAL", "NEIGHBOR_SUBTOPIC", "SEARCH_INDEX", "CONTROL"]),
    values: z.array(z.string()),
  })
  .strict();

const decisionRecordSchema = z
  .object({
    measureId: z.string().min(1),
    revisionId: z.string().min(1),
    sourceUpdatedAt: z.string().datetime(),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    candidateName: z.string().min(1),
    theme: z.string().min(1),
    control: z.boolean(),
    selectionReasons: z.array(selectionReasonSchema).min(1),
    decision: z.enum(["APPLIES", "DOES_NOT_APPLY", "UNCERTAIN"]),
    confidence: z.number().min(0).max(1),
    justification: z.string().min(1).max(500),
    evidenceExcerpt: z.string().min(1).max(300),
    classifierVersion: z.string().min(1),
  })
  .strict();

const ignoredExistingSchema = z
  .object({
    measureId: z.string(),
    revisionId: z.string(),
    status: z.enum(["SUGGESTED", "APPROVED", "REJECTED"]),
  })
  .strict();

export const subtopicDeltaReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string().min(1),
    createdAt: z.string().datetime(),
    taxonomy: z.object({ previousVersion: z.string(), currentVersion: z.string() }).strict(),
    subtopic: z.object({ slug: z.string(), label: z.string(), theme: z.string() }).strict(),
    election: z.object({ id: z.string(), slug: z.string() }).strict(),
    parameters: z
      .object({
        subtopic: z.string(),
        election: z.string(),
        limit: z.number().int().positive(),
        after: z.string().nullable(),
        dryRun: z.literal(true),
      })
      .strict(),
    totalEligibleMeasures: z.number().int().nonnegative(),
    scannedMeasures: z.number().int().nonnegative(),
    nextAfter: z.string().nullable(),
    selectedCandidates: z.number().int().nonnegative(),
    selectionBySignal: z
      .object({
        LEXICAL: z.number().int().nonnegative(),
        NEIGHBOR_SUBTOPIC: z.number().int().nonnegative(),
        SEARCH_INDEX: z.number().int().nonnegative(),
        CONTROL: z.number().int().nonnegative(),
      })
      .strict(),
    decisions: z
      .object({
        APPLIES: z.number().int().nonnegative(),
        DOES_NOT_APPLY: z.number().int().nonnegative(),
        UNCERTAIN: z.number().int().nonnegative(),
      })
      .strict(),
    distribution: z
      .object({
        byCandidate: z.record(z.string(), z.number().int().nonnegative()),
        byTheme: z.record(z.string(), z.number().int().nonnegative()),
      })
      .strict(),
    suggestionsThatWouldBeCreated: z.array(decisionRecordSchema),
    ignoredExisting: z.array(ignoredExistingSchema),
    controlSample: z.array(decisionRecordSchema),
    results: z.array(decisionRecordSchema),
    errors: z.array(
      z
        .object({
          measureId: z.string(),
          revisionId: z.string(),
          message: z.string(),
          control: z.boolean(),
        })
        .strict()
    ),
  })
  .strict();

export type ApplySubtopicDeltaResult = {
  runId: string;
  created: number;
  ignored: Array<{ revisionId: string; status: string }>;
};

function assertReportCoherence(report: SubtopicDeltaReport): void {
  if (report.taxonomy.currentVersion !== MEASURE_SUBTOPIC_TAXONOMY_VERSION) {
    throw new Error("La version de taxonomie du rapport n’est plus la version courante");
  }
  const configured = MEASURE_SUBTOPICS.find((item) => item.slug === report.subtopic.slug);
  if (
    !configured ||
    configured.label !== report.subtopic.label ||
    configured.theme !== report.subtopic.theme
  ) {
    throw new Error("Le sous-thème du rapport ne correspond plus à la taxonomie");
  }
  if (
    report.parameters.subtopic !== report.subtopic.slug ||
    report.parameters.election !== report.election.slug
  ) {
    throw new Error("Les paramètres du rapport sont incohérents");
  }

  const expected = report.results.filter((result) => result.decision === "APPLIES");
  if (JSON.stringify(expected) !== JSON.stringify(report.suggestionsThatWouldBeCreated)) {
    throw new Error("La liste des suggestions ne correspond pas aux décisions APPLIES");
  }
  if (new Set(expected.map((result) => result.revisionId)).size !== expected.length) {
    throw new Error("Le rapport contient des suggestions dupliquées");
  }
}

export function parseSubtopicDeltaReport(value: unknown): SubtopicDeltaReport {
  const report = subtopicDeltaReportSchema.parse(value) as SubtopicDeltaReport;
  assertReportCoherence(report);
  return report;
}

export async function applySubtopicDeltaReport(value: unknown): Promise<ApplySubtopicDeltaResult> {
  const report = parseSubtopicDeltaReport(value);
  const suggestions = report.suggestionsThatWouldBeCreated;
  const configuredSubtopic = MEASURE_SUBTOPICS.find((item) => item.slug === report.subtopic.slug)!;
  const measures = await db.measure.findMany({
    where: {
      id: { in: suggestions.map((suggestion) => suggestion.measureId) },
      electionId: report.election.id,
      theme: configuredSubtopic.theme,
      ...PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
    },
    select: {
      id: true,
      publishedRevision: {
        select: { id: true, text: true, details: true, updatedAt: true },
      },
    },
  });
  const measuresById = new Map(measures.map((measure) => [measure.id, measure]));

  for (const suggestion of suggestions) {
    const measure = measuresById.get(suggestion.measureId);
    const revision = measure?.publishedRevision;
    if (!revision || revision.id !== suggestion.revisionId) {
      throw new Error(`La mesure ${suggestion.measureId} n’a plus la révision analysée`);
    }
    const fingerprint = createSubtopicDeltaSourceFingerprint({
      revisionId: revision.id,
      sourceUpdatedAt: revision.updatedAt.toISOString(),
      text: revision.text,
      details: revision.details,
    });
    if (
      revision.updatedAt.toISOString() !== suggestion.sourceUpdatedAt ||
      fingerprint !== suggestion.sourceFingerprint
    ) {
      throw new Error(`La mesure ${suggestion.measureId} a changé depuis le dry-run`);
    }
  }

  await syncMeasureSubtopicTaxonomy();
  const subtopic = await db.measureSubtopic.findUniqueOrThrow({
    where: { slug: report.subtopic.slug },
    select: { id: true, active: true },
  });
  if (!subtopic.active) throw new Error("Le sous-thème est inactif");

  let created = 0;
  const ignored: ApplySubtopicDeltaResult["ignored"] = [];
  for (const suggestion of suggestions) {
    const outcome = await db.$transaction(async (tx) => {
      const existing = await tx.measureRevisionSubtopic.findUnique({
        where: {
          revisionId_subtopicId: {
            revisionId: suggestion.revisionId,
            subtopicId: subtopic.id,
          },
        },
        select: { status: true },
      });
      if (existing) return { created: false, status: existing.status };

      const inserted = await tx.measureRevisionSubtopic.createMany({
        data: [
          {
            revisionId: suggestion.revisionId,
            subtopicId: subtopic.id,
            status: "SUGGESTED",
            confidence: suggestion.confidence,
            method: "AI_ASSISTED",
            classifierVersion: suggestion.classifierVersion,
            taxonomyVersion: report.taxonomy.currentVersion,
          },
        ],
        skipDuplicates: true,
      });
      if (inserted.count === 0) return { created: false, status: "CONCURRENT_ASSIGNMENT" };

      await tx.auditLog.create({
        data: {
          action: "PROPOSE_SUBTOPIC_DELTA",
          entityType: "MeasureRevision",
          entityId: suggestion.revisionId,
          changes: {
            runId: report.runId,
            subtopic: report.subtopic.slug,
            taxonomyVersion: report.taxonomy.currentVersion,
            classifierVersion: suggestion.classifierVersion,
            confidence: suggestion.confidence,
            decision: suggestion.decision,
            justification: suggestion.justification,
            evidenceExcerpt: suggestion.evidenceExcerpt,
            selectionReasons: suggestion.selectionReasons,
            sourceFingerprint: suggestion.sourceFingerprint,
          },
          userId: "cli",
        },
      });
      return { created: true, status: "SUGGESTED" };
    });
    if (outcome.created) created += 1;
    else ignored.push({ revisionId: suggestion.revisionId, status: outcome.status });
  }

  return { runId: report.runId, created, ignored };
}
