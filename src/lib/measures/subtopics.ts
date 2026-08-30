import {
  Prisma,
  type MeasureSubtopicAssignmentStatus,
  type ThemeCategory,
} from "@/generated/prisma";
import {
  getMeasureSubtopicsForTheme,
  MEASURE_SUBTOPIC_TAXONOMY_VERSION,
  MEASURE_SUBTOPICS,
} from "@/config/measure-subtopics";
import { callMistral, extractMistralText, parseMistralJSON } from "@/lib/api/mistral";
import { db } from "@/lib/db";
import { invalidateMeasureTags } from "@/lib/measures/cache";
import { MeasureValidationError } from "@/lib/measures/errors";
import { syncSearchDocument } from "@/lib/measures/search-sync";
import { createSubtopicDeltaSourceFingerprint } from "@/lib/measures/subtopic-delta-fingerprint";

const CLASSIFIER_MODEL = "mistral-small-latest";
const MAX_SUBTOPICS_PER_REVISION = 3;

function sanitizeMeasureText(value: string): string {
  return value
    .replace(/["\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2_000);
}

export async function syncMeasureSubtopicTaxonomy(): Promise<void> {
  for (const subtopic of MEASURE_SUBTOPICS) {
    await db.measureSubtopic.upsert({
      where: { slug: subtopic.slug },
      create: {
        slug: subtopic.slug,
        label: subtopic.label,
        description: subtopic.description,
        theme: subtopic.theme,
        aliases: subtopic.aliases,
        sortOrder: subtopic.sortOrder,
      },
      update: {
        label: subtopic.label,
        description: subtopic.description,
        theme: subtopic.theme,
        aliases: subtopic.aliases,
        sortOrder: subtopic.sortOrder,
        active: true,
      },
    });
  }
}

type SuggestedSubtopic = { slug: string; confidence: number };
type ClassificationResult = {
  suggestions: SuggestedSubtopic[];
  classifierVersion: string;
};

async function classifySubtopics(
  text: string,
  theme: ThemeCategory
): Promise<ClassificationResult> {
  const allowed = getMeasureSubtopicsForTheme(theme);
  if (allowed.length === 0) {
    return { suggestions: [], classifierVersion: `${CLASSIFIER_MODEL}:v1` };
  }

  const vocabulary = allowed
    .map(
      (item) =>
        `${item.slug}: ${item.label}. ${item.description}` +
        (item.aliases.length > 0 ? ` Termes associés : ${item.aliases.join(", ")}.` : "") +
        (item.classifierGuidance ? ` Périmètre : ${item.classifierGuidance}` : "")
    )
    .join("\n");
  const prompt = `Classe uniquement le texte de mesure fourni. N'infère ni parti, ni candidat, ni intention. Utilise zéro à trois sous-sujets parmi la liste fermée. Ne choisis rien si le texte est trop vague.

<taxonomie>
${vocabulary}
</taxonomie>

<mesure>
${sanitizeMeasureText(text)}
</mesure>

Réponds uniquement avec un objet JSON de cette forme :
{"subtopics":[{"slug":"slug-autorisé","confidence":0.95}]}`;

  const response = await callMistral([{ role: "user", content: prompt }], {
    model: CLASSIFIER_MODEL,
    maxTokens: 300,
    temperature: 0,
    responseFormat: { type: "json_object" },
  });
  const input = parseMistralJSON<{ subtopics?: SuggestedSubtopic[] }>(extractMistralText(response));
  const allowedSlugs = new Set(allowed.map((item) => item.slug));
  const candidates = Array.isArray(input.subtopics) ? input.subtopics : [];
  const resolvedModel = response.model?.trim() || CLASSIFIER_MODEL;

  return {
    suggestions: candidates
      .filter(
        (item) =>
          allowedSlugs.has(item.slug) &&
          Number.isFinite(item.confidence) &&
          item.confidence >= 0 &&
          item.confidence <= 1
      )
      .filter((item, index, all) => all.findIndex((other) => other.slug === item.slug) === index)
      .slice(0, MAX_SUBTOPICS_PER_REVISION),
    classifierVersion: `${resolvedModel}:v1`,
  };
}

export type ProposeSubtopicsResult = {
  revisionId: string;
  suggestions: SuggestedSubtopic[];
  skipped: boolean;
};

export async function getPreviouslyClassifiedMeasureRevisionIds(): Promise<string[]> {
  const attempts = await db.auditLog.findMany({
    where: { action: "PROPOSE_SUBTOPICS", entityType: "MeasureRevision" },
    select: { entityId: true },
    distinct: ["entityId"],
  });
  return attempts.map((attempt) => attempt.entityId);
}

export async function proposeMeasureRevisionSubtopicDelta(input: {
  measureId: string;
  revisionId: string;
  subtopicSlug: string;
  confidence: number;
  classifierVersion: string;
  taxonomyVersion: string;
  runId: string;
  decision: "APPLIES";
  justification: string;
  evidenceExcerpt: string;
  selectionReasons: Array<{ signal: string; values: string[] }>;
  sourceFingerprint: string;
  proposedBy?: string;
}): Promise<{ created: boolean; status: string }> {
  return db.$transaction(async (tx) => {
    const currentRows = await tx.$queryRaw<
      Array<{
        measureId: string;
        revisionId: string;
        text: string;
        details: string | null;
        updatedAt: Date;
      }>
    >(Prisma.sql`
      SELECT
        m.id AS "measureId",
        r.id AS "revisionId",
        r.text,
        r.details,
        r."updatedAt"
      FROM "Measure" m
      JOIN "MeasureRevision" r ON r.id = m."publishedRevisionId"
      WHERE m.id = ${input.measureId}
      FOR UPDATE OF m
    `);
    const current = currentRows[0];
    const currentFingerprint = current
      ? createSubtopicDeltaSourceFingerprint({
          revisionId: current.revisionId,
          sourceUpdatedAt: current.updatedAt.toISOString(),
          text: current.text,
          details: current.details,
        })
      : null;
    if (
      !current ||
      current.revisionId !== input.revisionId ||
      currentFingerprint !== input.sourceFingerprint
    ) {
      throw new MeasureValidationError("La mesure a changé depuis le dry-run");
    }

    const subtopic = await tx.measureSubtopic.findUnique({
      where: { slug: input.subtopicSlug },
      select: { id: true, active: true },
    });
    if (!subtopic?.active) throw new MeasureValidationError("Sous-thème introuvable ou inactif");

    const existing = await tx.measureRevisionSubtopic.findUnique({
      where: {
        revisionId_subtopicId: {
          revisionId: input.revisionId,
          subtopicId: subtopic.id,
        },
      },
      select: { status: true },
    });
    if (existing) return { created: false, status: existing.status };

    const activeAssignmentCount = await tx.measureRevisionSubtopic.count({
      where: { revisionId: input.revisionId, status: { not: "REJECTED" } },
    });
    if (activeAssignmentCount >= MAX_SUBTOPICS_PER_REVISION) {
      return { created: false, status: "SUBTOPIC_LIMIT_REACHED" };
    }

    const inserted = await tx.measureRevisionSubtopic.createMany({
      data: [
        {
          revisionId: input.revisionId,
          subtopicId: subtopic.id,
          status: "SUGGESTED",
          confidence: input.confidence,
          method: "AI_ASSISTED",
          classifierVersion: input.classifierVersion,
          taxonomyVersion: input.taxonomyVersion,
        },
      ],
      skipDuplicates: true,
    });
    if (inserted.count === 0) return { created: false, status: "CONCURRENT_ASSIGNMENT" };

    await tx.auditLog.create({
      data: {
        action: "PROPOSE_SUBTOPIC_DELTA",
        entityType: "MeasureRevision",
        entityId: input.revisionId,
        changes: {
          runId: input.runId,
          subtopic: input.subtopicSlug,
          taxonomyVersion: input.taxonomyVersion,
          classifierVersion: input.classifierVersion,
          confidence: input.confidence,
          decision: input.decision,
          justification: input.justification,
          evidenceExcerpt: input.evidenceExcerpt,
          selectionReasons: input.selectionReasons,
          sourceFingerprint: input.sourceFingerprint,
        },
        userId: input.proposedBy ?? "system",
      },
    });
    return { created: true, status: "SUGGESTED" };
  });
}

export async function proposeMeasureRevisionSubtopics(
  revisionId: string,
  options: { dryRun?: boolean; proposedBy?: string; skipTaxonomySync?: boolean } = {}
): Promise<ProposeSubtopicsResult> {
  const revision = await db.measureRevision.findUnique({
    where: { id: revisionId },
    select: {
      id: true,
      text: true,
      measure: { select: { theme: true } },
      subtopics: { select: { subtopic: { select: { slug: true } }, status: true } },
    },
  });
  if (!revision) throw new MeasureValidationError("Révision introuvable");

  const fixedSlugs = new Set(
    revision.subtopics
      .filter((item) => item.status !== "SUGGESTED")
      .map((item) => item.subtopic.slug)
  );
  const hasApproved = revision.subtopics.some((item) => item.status === "APPROVED");
  if (hasApproved) return { revisionId, suggestions: [], skipped: true };

  const classification = await classifySubtopics(revision.text, revision.measure.theme);
  const suggestions = classification.suggestions.filter((item) => !fixedSlugs.has(item.slug));
  if (options.dryRun) return { revisionId, suggestions, skipped: false };

  if (!options.skipTaxonomySync) await syncMeasureSubtopicTaxonomy();
  const rows = await db.measureSubtopic.findMany({
    where: { slug: { in: suggestions.map((item) => item.slug) }, active: true },
    select: { id: true, slug: true },
  });
  const ids = new Map(rows.map((row) => [row.slug, row.id]));

  await db.$transaction(async (tx) => {
    await tx.measureRevisionSubtopic.deleteMany({
      where: { revisionId, status: "SUGGESTED" },
    });
    if (suggestions.length > 0) {
      await tx.measureRevisionSubtopic.createMany({
        data: suggestions.flatMap((suggestion) => {
          const subtopicId = ids.get(suggestion.slug);
          return subtopicId
            ? [
                {
                  revisionId,
                  subtopicId,
                  status: "SUGGESTED" as const,
                  confidence: suggestion.confidence,
                  method: "AI_ASSISTED",
                  classifierVersion: classification.classifierVersion,
                  taxonomyVersion: MEASURE_SUBTOPIC_TAXONOMY_VERSION,
                },
              ]
            : [];
        }),
        skipDuplicates: true,
      });
    }
    await tx.auditLog.create({
      data: {
        action: "PROPOSE_SUBTOPICS",
        entityType: "MeasureRevision",
        entityId: revisionId,
        changes: {
          slugs: suggestions.map((suggestion) => suggestion.slug),
          classifierVersion: classification.classifierVersion,
          taxonomyVersion: MEASURE_SUBTOPIC_TAXONOMY_VERSION,
        },
        userId: options.proposedBy ?? "system",
      },
    });
  });

  return { revisionId, suggestions, skipped: false };
}

export async function reviewMeasureRevisionSubtopic(input: {
  revisionId: string;
  subtopicId: string;
  status: Extract<MeasureSubtopicAssignmentStatus, "APPROVED" | "REJECTED">;
  reviewedBy: string;
}): Promise<void> {
  const measure = await db.$transaction(async (tx) => {
    const assignment = await tx.measureRevisionSubtopic.findUnique({
      where: {
        revisionId_subtopicId: {
          revisionId: input.revisionId,
          subtopicId: input.subtopicId,
        },
      },
      select: {
        status: true,
        revision: { select: { measure: { select: { id: true, electionId: true } } } },
      },
    });
    if (!assignment || assignment.status !== "SUGGESTED") {
      throw new MeasureValidationError("Cette proposition a déjà été traitée");
    }

    if (input.status === "APPROVED") {
      await tx.$queryRaw(Prisma.sql`
        SELECT id
        FROM "Measure"
        WHERE id = ${assignment.revision.measure.id}
        FOR UPDATE
      `);
      const approvedCount = await tx.measureRevisionSubtopic.count({
        where: { revisionId: input.revisionId, status: "APPROVED" },
      });
      if (approvedCount >= MAX_SUBTOPICS_PER_REVISION) {
        throw new MeasureValidationError("Cette révision possède déjà trois sous-thèmes approuvés");
      }
    }

    const updated = await tx.measureRevisionSubtopic.updateMany({
      where: {
        revisionId: input.revisionId,
        subtopicId: input.subtopicId,
        status: "SUGGESTED",
      },
      data: {
        status: input.status,
        reviewedAt: new Date(),
        reviewedBy: input.reviewedBy,
      },
    });
    if (updated.count !== 1) {
      throw new MeasureValidationError("Cette proposition a déjà été traitée");
    }
    await tx.auditLog.create({
      data: {
        action: "REVIEW_SUBTOPIC",
        entityType: "MeasureRevision",
        entityId: input.revisionId,
        changes: { subtopicId: input.subtopicId, status: input.status },
        userId: input.reviewedBy,
      },
    });
    if (input.status === "APPROVED") {
      await syncSearchDocument(tx, assignment.revision.measure.id);
    }

    return assignment.revision.measure;
  });

  invalidateMeasureTags(measure.id, measure.electionId);
}
