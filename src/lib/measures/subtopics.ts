import type { MeasureSubtopicAssignmentStatus, ThemeCategory } from "@/generated/prisma";
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

const CLASSIFIER_MODEL = "mistral-small-latest";

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
      .slice(0, 3),
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
