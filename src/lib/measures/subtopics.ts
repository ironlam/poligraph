import {
  Prisma,
  type MeasureSubtopicAssignmentStatus,
  type ThemeCategory,
} from "@/generated/prisma";
import {
  getMeasureSubtopicsForTheme,
  MAX_SUBTOPICS_PER_REVISION,
  MEASURE_SUBTOPIC_TAXONOMY_VERSION,
  MEASURE_SUBTOPICS,
} from "@/config/measure-subtopics";
import { callMistral, extractMistralText, parseMistralJSON } from "@/lib/api/mistral";
import { db } from "@/lib/db";
import { invalidateMeasureTags } from "@/lib/measures/cache";
import { MeasureValidationError } from "@/lib/measures/errors";
import { syncSearchDocument } from "@/lib/measures/search-sync";
import { createSubtopicDeltaSourceFingerprint } from "@/lib/measures/subtopic-delta-fingerprint";
import { PUBLIC_PRESIDENTIAL_MEASURE_WHERE } from "@/lib/presidentielle/publication";

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

export type MeasureRevisionSubtopicDeltaProposal = {
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
};

export type MeasureRevisionSubtopicDeltaOutcome = {
  revisionId: string;
  created: boolean;
  status: string;
};

export async function proposeMeasureRevisionSubtopicDeltaBatch(
  proposals: MeasureRevisionSubtopicDeltaProposal[]
): Promise<MeasureRevisionSubtopicDeltaOutcome[]> {
  if (proposals.length === 0) return [];
  if (new Set(proposals.map((proposal) => proposal.measureId)).size !== proposals.length) {
    throw new MeasureValidationError("Le lot contient plusieurs propositions pour une mesure");
  }
  const subtopicSlugs = new Set(proposals.map((proposal) => proposal.subtopicSlug));
  if (subtopicSlugs.size !== 1) {
    throw new MeasureValidationError("Le lot doit viser un seul sous-thème");
  }

  return db.$transaction(
    async (tx) => {
      const measureIds = proposals.map((proposal) => proposal.measureId).sort();
      const currentRows = await tx.$queryRaw<
        Array<{
          measureId: string;
          revisionId: string;
          candidacyId: string | null;
          theme: ThemeCategory;
          text: string;
          details: string | null;
          updatedAt: Date;
        }>
      >(Prisma.sql`
      SELECT
        m.id AS "measureId",
        r.id AS "revisionId",
        m."candidacyId",
        m.theme,
        r.text,
        r.details,
        r."updatedAt"
      FROM "Measure" m
      JOIN "MeasureRevision" r ON r.id = m."publishedRevisionId"
      WHERE m.id IN (${Prisma.join(measureIds)})
      ORDER BY m.id
      FOR UPDATE OF m
    `);
      const candidacyIds = [
        ...new Set(currentRows.flatMap((row) => (row.candidacyId ? [row.candidacyId] : []))),
      ].sort();
      if (candidacyIds.length > 0) {
        await tx.$queryRaw(Prisma.sql`
        SELECT id
        FROM "Candidacy"
        WHERE id IN (${Prisma.join(candidacyIds)})
        ORDER BY id
        FOR UPDATE
      `);
      }
      const eligibleMeasures = await tx.measure.findMany({
        where: {
          id: { in: measureIds },
          ...PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
        },
        select: { id: true },
      });
      const eligibleMeasureIds = new Set(eligibleMeasures.map((measure) => measure.id));

      const subtopic = await tx.measureSubtopic.findUnique({
        where: { slug: proposals[0]!.subtopicSlug },
        select: { id: true, active: true, theme: true },
      });
      if (!subtopic?.active) throw new MeasureValidationError("Sous-thème introuvable ou inactif");

      const currentByMeasureId = new Map(currentRows.map((row) => [row.measureId, row]));
      for (const proposal of proposals) {
        const current = currentByMeasureId.get(proposal.measureId);
        if (!eligibleMeasureIds.has(proposal.measureId)) {
          throw new MeasureValidationError(
            `La mesure ${proposal.measureId} ne fait plus partie du corpus public`
          );
        }
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
          current.revisionId !== proposal.revisionId ||
          currentFingerprint !== proposal.sourceFingerprint
        ) {
          throw new MeasureValidationError(
            `La mesure ${proposal.measureId} a changé depuis le dry-run`
          );
        }
        if (current.theme !== subtopic.theme) {
          throw new MeasureValidationError(
            `Le thème de la mesure ${proposal.measureId} ne correspond plus au sous-thème`
          );
        }
      }

      const outcomes: MeasureRevisionSubtopicDeltaOutcome[] = [];
      for (const proposal of proposals) {
        const existing = await tx.measureRevisionSubtopic.findUnique({
          where: {
            revisionId_subtopicId: {
              revisionId: proposal.revisionId,
              subtopicId: subtopic.id,
            },
          },
          select: { status: true },
        });
        if (existing) {
          outcomes.push({
            revisionId: proposal.revisionId,
            created: false,
            status: existing.status,
          });
          continue;
        }

        const activeAssignmentCount = await tx.measureRevisionSubtopic.count({
          where: { revisionId: proposal.revisionId, status: { not: "REJECTED" } },
        });
        if (activeAssignmentCount >= MAX_SUBTOPICS_PER_REVISION) {
          outcomes.push({
            revisionId: proposal.revisionId,
            created: false,
            status: "SUBTOPIC_LIMIT_REACHED",
          });
          continue;
        }

        const inserted = await tx.measureRevisionSubtopic.createMany({
          data: [
            {
              revisionId: proposal.revisionId,
              subtopicId: subtopic.id,
              status: "SUGGESTED",
              confidence: proposal.confidence,
              method: "AI_ASSISTED",
              classifierVersion: proposal.classifierVersion,
              taxonomyVersion: proposal.taxonomyVersion,
            },
          ],
          skipDuplicates: true,
        });
        if (inserted.count === 0) {
          outcomes.push({
            revisionId: proposal.revisionId,
            created: false,
            status: "CONCURRENT_ASSIGNMENT",
          });
          continue;
        }

        await tx.auditLog.create({
          data: {
            action: "PROPOSE_SUBTOPIC_DELTA",
            entityType: "MeasureRevision",
            entityId: proposal.revisionId,
            changes: {
              runId: proposal.runId,
              subtopic: proposal.subtopicSlug,
              taxonomyVersion: proposal.taxonomyVersion,
              classifierVersion: proposal.classifierVersion,
              confidence: proposal.confidence,
              decision: proposal.decision,
              justification: proposal.justification,
              evidenceExcerpt: proposal.evidenceExcerpt,
              selectionReasons: proposal.selectionReasons,
              sourceFingerprint: proposal.sourceFingerprint,
            },
            userId: proposal.proposedBy ?? "system",
          },
        });
        outcomes.push({ revisionId: proposal.revisionId, created: true, status: "SUGGESTED" });
      }
      return outcomes;
    },
    { maxWait: 10_000, timeout: 120_000 }
  );
}

export async function proposeMeasureRevisionSubtopicDelta(
  input: MeasureRevisionSubtopicDeltaProposal
): Promise<{ created: boolean; status: string }> {
  const [outcome] = await proposeMeasureRevisionSubtopicDeltaBatch([input]);
  return { created: outcome!.created, status: outcome!.status };
}

export async function proposeMeasureRevisionSubtopics(
  revisionId: string,
  options: {
    dryRun?: boolean;
    proposedBy?: string;
    skipTaxonomySync?: boolean;
    /** The admin keeps proposing after a validation; the CLI keeps the old freeze. */
    allowWhenApproved?: boolean;
  } = {}
): Promise<ProposeSubtopicsResult> {
  const revision = await db.measureRevision.findUnique({
    where: { id: revisionId },
    select: {
      id: true,
      text: true,
      measure: { select: { id: true, theme: true } },
      subtopics: { select: { subtopic: { select: { slug: true } }, status: true } },
    },
  });
  if (!revision) throw new MeasureValidationError("Révision introuvable");

  const fixedSlugs = new Set(
    revision.subtopics
      .filter((item) => item.status !== "SUGGESTED")
      .map((item) => item.subtopic.slug)
  );
  const approvedCount = revision.subtopics.filter((item) => item.status === "APPROVED").length;
  // By default one approved subtopic freezes the automatic pass. The admin opts out: approved
  // ones stay untouched and the suggestions only fill the places left under the maximum.
  if (approvedCount > 0 && !options.allowWhenApproved) {
    return { revisionId, suggestions: [], skipped: true };
  }
  if (approvedCount >= MAX_SUBTOPICS_PER_REVISION) {
    return { revisionId, suggestions: [], skipped: true };
  }

  const classification = await classifySubtopics(revision.text, revision.measure.theme);
  const suggestions = classification.suggestions
    .filter((item) => !fixedSlugs.has(item.slug))
    .slice(0, MAX_SUBTOPICS_PER_REVISION - approvedCount);
  if (options.dryRun) return { revisionId, suggestions, skipped: false };

  if (!options.skipTaxonomySync) await syncMeasureSubtopicTaxonomy();
  const rows = await db.measureSubtopic.findMany({
    where: { slug: { in: suggestions.map((item) => item.slug) }, active: true },
    select: { id: true, slug: true },
  });
  const ids = new Map(rows.map((row) => [row.slug, row.id]));

  const created = await db.$transaction(async (tx) => {
    // Same lock as a validation and a manual add: without it a proposal can land after a third
    // subtopic was approved and leave a suggestion nobody can validate.
    await tx.$queryRaw(Prisma.sql`
      SELECT id
      FROM "Measure"
      WHERE id = ${revision.measure.id}
      FOR UPDATE
    `);
    const approvedNow = await tx.measureRevisionSubtopic.count({
      where: { revisionId, status: "APPROVED" },
    });
    const toCreate = suggestions.slice(0, Math.max(0, MAX_SUBTOPICS_PER_REVISION - approvedNow));
    await tx.measureRevisionSubtopic.deleteMany({
      where: { revisionId, status: "SUGGESTED" },
    });
    if (toCreate.length > 0) {
      await tx.measureRevisionSubtopic.createMany({
        data: toCreate.flatMap((suggestion) => {
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
          slugs: toCreate.map((suggestion) => suggestion.slug),
          classifierVersion: classification.classifierVersion,
          taxonomyVersion: MEASURE_SUBTOPIC_TAXONOMY_VERSION,
        },
        userId: options.proposedBy ?? "system",
      },
    });
    return toCreate;
  });

  return { revisionId, suggestions: created, skipped: false };
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

/**
 * A human adds a subtopic of the measure's own theme straight to APPROVED, for the cases where
 * the automatic pass proposes nothing or only one. The same rules as a validation apply: at most
 * MAX_SUBTOPICS_PER_REVISION approved, one row per (revision, subtopic), and the search document
 * is resynchronised. A refused or pending row for that subtopic is replaced by the decision.
 */
export async function addMeasureRevisionSubtopic(input: {
  measureId: string;
  revisionId: string;
  subtopicId: string;
  addedBy: string;
}): Promise<void> {
  const measure = await db.$transaction(async (tx) => {
    const revision = await tx.measureRevision.findUnique({
      where: { id: input.revisionId },
      select: {
        id: true,
        discardedAt: true,
        supersededAt: true,
        rejectedAt: true,
        measure: { select: { id: true, electionId: true, theme: true } },
      },
    });
    if (!revision) throw new MeasureValidationError("Révision introuvable");
    if (revision.measure.id !== input.measureId) {
      throw new MeasureValidationError("Cette révision n’appartient pas à cette mesure");
    }
    if (revision.discardedAt || revision.supersededAt || revision.rejectedAt) {
      throw new MeasureValidationError("Cette révision n’est plus active");
    }

    const subtopic = await tx.measureSubtopic.findUnique({
      where: { id: input.subtopicId },
      select: { id: true, slug: true, theme: true, active: true },
    });
    if (!subtopic || !subtopic.active) {
      throw new MeasureValidationError("Sous-thème introuvable ou inactif");
    }
    if (subtopic.theme !== revision.measure.theme) {
      throw new MeasureValidationError("Ce sous-thème n’appartient pas au thème de la mesure");
    }

    await tx.$queryRaw(Prisma.sql`
      SELECT id
      FROM "Measure"
      WHERE id = ${revision.measure.id}
      FOR UPDATE
    `);
    const approvedCount = await tx.measureRevisionSubtopic.count({
      where: { revisionId: input.revisionId, status: "APPROVED" },
    });
    if (approvedCount >= MAX_SUBTOPICS_PER_REVISION) {
      throw new MeasureValidationError("Cette révision possède déjà trois sous-thèmes approuvés");
    }

    const key = {
      revisionId_subtopicId: { revisionId: input.revisionId, subtopicId: subtopic.id },
    };
    const existing = await tx.measureRevisionSubtopic.findUnique({
      where: key,
      select: { status: true },
    });
    if (existing?.status === "APPROVED") {
      throw new MeasureValidationError("Ce sous-thème est déjà validé");
    }

    const now = new Date();
    if (existing) {
      await tx.measureRevisionSubtopic.update({
        where: key,
        data: { status: "APPROVED", reviewedAt: now, reviewedBy: input.addedBy },
      });
    } else {
      await tx.measureRevisionSubtopic.create({
        data: {
          revisionId: input.revisionId,
          subtopicId: subtopic.id,
          status: "APPROVED",
          confidence: null,
          method: "MANUAL",
          classifierVersion: "manual",
          taxonomyVersion: MEASURE_SUBTOPIC_TAXONOMY_VERSION,
          reviewedAt: now,
          reviewedBy: input.addedBy,
        },
      });
    }
    await tx.auditLog.create({
      data: {
        action: "ADD_SUBTOPIC",
        entityType: "MeasureRevision",
        entityId: input.revisionId,
        changes: {
          subtopicId: subtopic.id,
          slug: subtopic.slug,
          replacedStatus: existing?.status ?? null,
        },
        userId: input.addedBy,
      },
    });
    await syncSearchDocument(tx, revision.measure.id);

    return revision.measure;
  });

  invalidateMeasureTags(measure.id, measure.electionId);
}
