"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { QUALIFICATION_KIND_LABELS } from "@/config/labels";
import type {
  Chamber,
  MeasureAttribution,
  MeasureExtractionMethod,
  MeasurePrecision,
  MeasureRejectionReason,
  MeasureSourceKind,
  MeasureVoteRelation,
  QualificationKind,
  SimilarityConclusion,
  SourceTier,
  ThemeCategory,
} from "@/generated/prisma";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { createQualification, createSimilarityAssessment } from "@/lib/measures/assessments";
import {
  MAX_MEASURE_REVIEW_BATCH_SIZE,
  reviewMeasureRevisionBatch,
  type MeasureReviewBatchFailure,
} from "@/lib/measures/batch-review";
import {
  MAX_MEASURE_PUBLICATION_BATCH_SIZE,
  publishMeasureRevisionBatch,
  type MeasurePublicationBatchFailure,
} from "@/lib/measures/batch-publication";
import { MeasureConcurrencyError, MeasureValidationError } from "@/lib/measures/errors";
import {
  generateMeasureContextDraft,
  type ContextGenerationSkipReason,
} from "@/lib/measures/context-generation";
import { createMeasureVoteLink } from "@/lib/measures/vote-links";
import {
  proposeMeasureRevisionSubtopics,
  reviewMeasureRevisionSubtopic,
} from "@/lib/measures/subtopics";
import {
  proposeReaderGuidesForRevision,
  publishReaderGuide,
  reviewReaderGuideMention,
  saveReaderGuideDraft,
} from "@/lib/measures/reader-guides";
import {
  createMeasure,
  depublishMeasure,
  discardMeasureRevision,
  draftMeasureRevision,
  publishMeasureRevision,
  reviewMeasureRevision,
  rejectMeasureRevision,
  withdrawMeasure,
} from "@/lib/measures/transitions";
import { assertHubMeasureCandidacy } from "./_data/candidacy-eligibility";

/**
 * The editorial actions of the moderation admin.
 *
 * Every one of them calls a lot 1 transition and adds nothing to it: `transitions.ts` stays the
 * only writer of the pointers and of the three withdrawal fields.
 *
 * A server action is a network endpoint, not a form detail. The page guard does not protect it, so
 * each action re-checks the session as its first statement.
 *
 * Only async functions and types are exported from this module: a `"use server"` file that exports
 * a class or a const is rejected wholesale by the bundler, and neither tsc nor vitest catches it.
 */

/**
 * Business errors are RETURNED, not thrown: a reviewer needs the reason on screen, not an error
 * page. An authentication failure is thrown, because it is not information to display.
 */
export type ActionResult =
  | { ok: true; measureId?: string }
  | { ok: false; message: string; stale?: boolean };

export type BatchActionResult =
  | { ok: true; publishedCount: number }
  | {
      ok: false;
      publishedCount: number;
      failures: MeasurePublicationBatchFailure[];
    };

export type BatchReviewActionResult =
  | { ok: true; reviewedCount: number }
  | { ok: false; reviewedCount: number; failures: MeasureReviewBatchFailure[] };

/**
 * The admin auth of this project is a single signed cookie with no per-user identity (see
 * `src/lib/auth.ts`), so every action attributes its review to a constant actor. Same convention as
 * `src/app/admin/policy-titles/actions.ts`. Inventing a reviewer name in a form would produce an
 * unverifiable attribution, which is worse than no attribution.
 */
const ACTOR = "admin";

const batchPublicationInputSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            measureId: z.string().min(1),
            revisionId: z.string().min(1),
            expectedUpdatedAt: z.string().min(1),
            batchKind: z.enum(["FIRST_PUBLICATION", "CONTEXT_CORRECTION"]),
          })
          .strict()
      )
      .min(1)
      .max(MAX_MEASURE_PUBLICATION_BATCH_SIZE),
  })
  .strict();

const batchReviewInputSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            measureId: z.string().min(1),
            revisionId: z.string().min(1),
            batchKind: z.enum(["FIRST_PUBLICATION", "CONTEXT_CORRECTION"]),
          })
          .strict()
      )
      .min(1)
      .max(MAX_MEASURE_REVIEW_BATCH_SIZE),
  })
  .strict();

const subtopicProposalInputSchema = z
  .object({ measureId: z.string().min(1), revisionId: z.string().min(1) })
  .strict();

const subtopicReviewInputSchema = subtopicProposalInputSchema
  .extend({
    subtopicId: z.string().min(1),
    status: z.enum(["APPROVED", "REJECTED"]),
  })
  .strict();

const contextGenerationInputSchema = z
  .object({ measureId: z.string().min(1), expectedUpdatedAt: z.string().min(1).optional() })
  .strict();

const contextGenerationBatchInputSchema = z
  .object({ measureIds: z.array(z.string().min(1)).min(1).max(10) })
  .strict();

const readerGuideProposalInputSchema = z
  .object({ measureId: z.string().min(1), revisionId: z.string().min(1) })
  .strict();

const readerGuideReviewInputSchema = z
  .object({
    measureId: z.string().min(1),
    mentionId: z.string().min(1),
    guideId: z.string().min(1).optional(),
    status: z.enum(["APPROVED", "REJECTED"]),
  })
  .strict();

const readerGuideDraftInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    slug: z.string().min(1).max(120),
    label: z.string().min(3).max(160),
    definition: z.string().min(40).max(2_000),
    aliases: z.array(z.string().max(160)).max(30),
    sourceKind: z.enum(["OFFICIAL_INSTITUTION", "PROGRAM_SOURCE"]),
    sourceUrl: z.string().url().max(2_000),
    sourceLabel: z.string().min(3).max(300),
    sourcePublisher: z.string().min(3).max(200),
    sourceRevisionId: z.string().min(1).nullable().optional(),
  })
  .strict();

async function assertAuthenticated(): Promise<void> {
  if (!(await isAuthenticated())) throw new Error("Non autorisé");
}

async function getAuditRequestMetadata(): Promise<{
  ipAddress: string;
  userAgent: string;
}> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for");
  return {
    ipAddress: forwarded?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown",
    userAgent: requestHeaders.get("user-agent") || "unknown",
  };
}

function revalidate(measureId: string): void {
  revalidatePath("/admin/mesures");
  revalidatePath(`/admin/mesures/${measureId}`);
}

function parseDate(value: string, label: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new MeasureValidationError(`${label} n'est pas une date valide`);
  }
  return parsed;
}

function contextSkipMessage(reason: ContextGenerationSkipReason): string {
  switch (reason) {
    case "ACTIVE_DRAFT":
      return "Un brouillon est déjà en cours : il n'a pas été remplacé.";
    case "ALREADY_HAS_DETAILS":
      return "Cette mesure possède déjà un contexte documenté.";
    case "NO_PUBLISHED_REVISION":
      return "La mesure doit être publiée avant de proposer un contexte.";
    case "NO_VALID_EVIDENCE":
      return "Cette mesure ne possède pas de preuve V6 valide.";
    case "NO_SUPPORTING_CONTEXT":
      return "La preuve ne contient pas de contexte distinct de la formulation.";
    case "PREVIOUS_CONTEXT_ATTEMPT":
      return "Une génération a déjà conclu que cette révision ne pouvait pas produire de contexte exploitable.";
    case "NO_USEFUL_CONTEXT":
      return "Mistral n'a trouvé aucun contexte utile distinct de la formulation.";
    case "NOT_REGENERATABLE_CONTEXT":
      return "Ce contexte ne correspond pas à une ancienne génération remplaçable.";
  }
}

/**
 * Turns a domain error into something the reviewer can act on, and rethrows anything else: an
 * unexpected error is not ours to render as a business message.
 */
function toFailure(error: unknown): ActionResult {
  if (error instanceof MeasureConcurrencyError) {
    return {
      ok: false,
      stale: true,
      message:
        "La mesure a changé depuis l'affichage de cette page. Recharger, puis vérifier ce qui " +
        "a déjà été fait avant d'agir.",
    };
  }
  if (error instanceof MeasureValidationError) {
    return { ok: false, message: error.message };
  }
  throw error;
}

export type SourceInput = {
  sourceKind: MeasureSourceKind;
  tier: SourceTier;
  url: string;
  page: string | null;
  publishedAt: string;
};

export type RevisionInput = {
  text: string;
  details?: string | null;
  precision: MeasurePrecision | null;
  validFrom: string;
  extractionMethod: MeasureExtractionMethod;
};

function toRevision(input: RevisionInput) {
  return {
    text: input.text,
    details: input.details?.trim() || null,
    precision: input.precision,
    validFrom: parseDate(input.validFrom, "La date d'entrée en vigueur"),
    extractionMethod: input.extractionMethod,
    extractionConfidence: null,
    extractorVersion: null,
  };
}

function toSources(inputs: SourceInput[]) {
  return inputs.map((source) => ({
    sourceKind: source.sourceKind,
    tier: source.tier,
    url: source.url.trim(),
    page: source.page?.trim() === "" ? null : (source.page ?? null),
    publishedAt: parseDate(source.publishedAt, "La date de publication de la source"),
  }));
}

export async function createMeasureAction(input: {
  candidacyId: string;
  politicianId: string;
  electionId: string;
  theme: ThemeCategory;
  attribution: MeasureAttribution;
  revision: RevisionInput;
  sources: SourceInput[];
}): Promise<ActionResult> {
  await assertAuthenticated();

  try {
    // Server-side gate (#660): the candidacy must be 2027 + DECLARE + sourced. The election and
    // politician come FROM the candidacy, not from the payload, so a stale or tampered form cannot
    // bind the measure elsewhere.
    const eligible = await assertHubMeasureCandidacy(input.candidacyId);
    if (eligible.electionId !== input.electionId || eligible.politicianId !== input.politicianId) {
      return {
        ok: false,
        message:
          "La candidature sélectionnée ne correspond plus à cette élection ou ce politicien. Rechargez la page.",
      };
    }
    const { measureId } = await createMeasure({
      politicianId: eligible.politicianId,
      electionId: eligible.electionId,
      candidacyId: input.candidacyId,
      programEditionId: null,
      attribution: input.attribution,
      theme: input.theme,
      precedingMeasureId: null,
      revision: toRevision(input.revision),
      sources: toSources(input.sources),
    });
    revalidate(measureId);
    return { ok: true, measureId };
  } catch (error) {
    return toFailure(error);
  }
}

export async function draftRevisionAction(input: {
  measureId: string;
  revision: RevisionInput;
  sources: SourceInput[];
  /** The `Measure.updatedAt` the page carried, in ISO form. */
  expectedUpdatedAt: string;
  preserveEvidenceFromRevisionId?: string;
}): Promise<ActionResult> {
  await assertAuthenticated();

  try {
    await draftMeasureRevision({
      measureId: input.measureId,
      revision: toRevision(input.revision),
      sources: toSources(input.sources),
      expectedUpdatedAt: parseDate(input.expectedUpdatedAt, "La version attendue"),
      preserveEvidenceFromRevisionId: input.preserveEvidenceFromRevisionId,
      correctedBy: input.preserveEvidenceFromRevisionId ? ACTOR : undefined,
    });
    revalidate(input.measureId);
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

export async function rejectRevisionAction(input: {
  measureId: string;
  revisionId: string;
  reason: MeasureRejectionReason;
  detail: string | null;
}): Promise<ActionResult> {
  await assertAuthenticated();

  try {
    await rejectMeasureRevision({ ...input, rejectedBy: ACTOR });
    revalidate(input.measureId);
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

export async function reviewRevisionAction(input: {
  measureId: string;
  revisionId: string;
}): Promise<ActionResult> {
  await assertAuthenticated();

  try {
    await reviewMeasureRevision({ ...input, reviewedBy: ACTOR });
    revalidate(input.measureId);
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

export async function proposeSubtopicsAction(input: {
  measureId: string;
  revisionId: string;
}): Promise<ActionResult> {
  await assertAuthenticated();

  try {
    const parsed = subtopicProposalInputSchema.safeParse(input);
    if (!parsed.success) throw new MeasureValidationError("Révision à classer invalide");
    await proposeMeasureRevisionSubtopics(parsed.data.revisionId, { proposedBy: ACTOR });
    revalidate(parsed.data.measureId);
    return { ok: true };
  } catch (error) {
    if (error instanceof MeasureValidationError) return toFailure(error);
    return { ok: false, message: "La proposition automatique a échoué. Réessayez plus tard." };
  }
}

export async function reviewSubtopicAction(input: {
  measureId: string;
  revisionId: string;
  subtopicId: string;
  status: "APPROVED" | "REJECTED";
}): Promise<ActionResult> {
  await assertAuthenticated();

  try {
    const parsed = subtopicReviewInputSchema.safeParse(input);
    if (!parsed.success) throw new MeasureValidationError("Proposition de sous-thème invalide");
    await reviewMeasureRevisionSubtopic({
      revisionId: parsed.data.revisionId,
      subtopicId: parsed.data.subtopicId,
      status: parsed.data.status,
      reviewedBy: ACTOR,
    });
    revalidate(parsed.data.measureId);
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

export async function proposeReaderGuidesAction(input: unknown): Promise<ActionResult> {
  await assertAuthenticated();
  try {
    const parsed = readerGuideProposalInputSchema.safeParse(input);
    if (!parsed.success) throw new MeasureValidationError("Révision à analyser invalide");
    const requestMetadata = await getAuditRequestMetadata();
    await proposeReaderGuidesForRevision(parsed.data.revisionId, ACTOR, requestMetadata);
    revalidate(parsed.data.measureId);
    return { ok: true };
  } catch (error) {
    if (error instanceof MeasureValidationError) return toFailure(error);
    return { ok: false, message: "L’analyse automatique a échoué. Réessayez plus tard." };
  }
}

export async function reviewReaderGuideMentionAction(input: unknown): Promise<ActionResult> {
  await assertAuthenticated();
  try {
    const parsed = readerGuideReviewInputSchema.safeParse(input);
    if (!parsed.success) throw new MeasureValidationError("Proposition de repère invalide");
    const requestMetadata = await getAuditRequestMetadata();
    await reviewReaderGuideMention({
      mentionId: parsed.data.mentionId,
      guideId: parsed.data.guideId,
      status: parsed.data.status,
      reviewedBy: ACTOR,
      ...requestMetadata,
    });
    revalidate(parsed.data.measureId);
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

export async function saveReaderGuideDraftAction(input: unknown): Promise<ActionResult> {
  await assertAuthenticated();
  try {
    const parsed = readerGuideDraftInputSchema.safeParse(input);
    if (!parsed.success) throw new MeasureValidationError("Le brouillon de repère est invalide");
    const requestMetadata = await getAuditRequestMetadata();
    const id = await saveReaderGuideDraft(parsed.data, ACTOR, requestMetadata);
    revalidatePath("/admin/mesures/reperes");
    return { ok: true, measureId: id };
  } catch (error) {
    return toFailure(error);
  }
}

export async function publishReaderGuideAction(input: unknown): Promise<ActionResult> {
  await assertAuthenticated();
  try {
    const parsed = z
      .object({ guideId: z.string().min(1) })
      .strict()
      .safeParse(input);
    if (!parsed.success) throw new MeasureValidationError("Repère invalide");
    const requestMetadata = await getAuditRequestMetadata();
    await publishReaderGuide(parsed.data.guideId, ACTOR, requestMetadata);
    revalidatePath("/admin/mesures/reperes");
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

export async function generateContextDraftAction(input: {
  measureId: string;
  expectedUpdatedAt?: string;
}): Promise<ActionResult> {
  await assertAuthenticated();

  try {
    const parsed = contextGenerationInputSchema.safeParse(input);
    if (!parsed.success) throw new MeasureValidationError("Mesure à enrichir invalide");
    const requestMetadata = await getAuditRequestMetadata();
    const result = await generateMeasureContextDraft(parsed.data.measureId, {
      expectedUpdatedAt: parsed.data.expectedUpdatedAt
        ? parseDate(parsed.data.expectedUpdatedAt, "La version attendue")
        : undefined,
      generatedBy: ACTOR,
      ...requestMetadata,
    });
    if (result.status === "SKIPPED") {
      return { ok: false, message: contextSkipMessage(result.reason) };
    }
    revalidate(parsed.data.measureId);
    return { ok: true, measureId: parsed.data.measureId };
  } catch (error) {
    if (error instanceof MeasureConcurrencyError || error instanceof MeasureValidationError) {
      return toFailure(error);
    }
    return {
      ok: false,
      message: "La génération du contexte a échoué. Réessayez plus tard.",
    };
  }
}

export type ContextGenerationBatchActionResult = {
  ok: true;
  created: number;
  skipped: number;
  failed: number;
};

export async function generateContextDraftBatchAction(
  input: unknown
): Promise<ContextGenerationBatchActionResult> {
  await assertAuthenticated();

  const parsed = contextGenerationBatchInputSchema.safeParse(input);
  if (!parsed.success) throw new MeasureValidationError("Le lot doit contenir de 1 à 10 mesures");
  const measureIds = [...new Set(parsed.data.measureIds)];
  const requestMetadata = await getAuditRequestMetadata();
  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const measureId of measureIds) {
    try {
      const result = await generateMeasureContextDraft(measureId, {
        generatedBy: ACTOR,
        ...requestMetadata,
      });
      if (result.status === "CREATED") {
        created += 1;
        revalidate(measureId);
      } else {
        skipped += 1;
      }
    } catch {
      failed += 1;
    }
  }
  return { ok: true, created, skipped, failed };
}

export async function reviewDraftBatchAction(input: unknown): Promise<BatchReviewActionResult> {
  await assertAuthenticated();

  try {
    // Validate the whole payload before the first review. A malformed trailing row must not leave
    // a valid prefix marked as reviewed.
    const parsed = batchReviewInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new MeasureValidationError(
        `Le lot doit contenir entre 1 et ${MAX_MEASURE_REVIEW_BATCH_SIZE} éléments valides`
      );
    }
    const result = await reviewMeasureRevisionBatch(parsed.data.items, ACTOR);

    revalidatePath("/admin/mesures");
    for (const item of parsed.data.items) revalidatePath(`/admin/mesures/${item.measureId}`);

    return result.failures.length === 0
      ? { ok: true, reviewedCount: result.reviewedCount }
      : { ok: false, reviewedCount: result.reviewedCount, failures: result.failures };
  } catch (error) {
    const failure = toFailure(error);
    if (failure.ok) throw new Error("Résultat d'échec incohérent");
    return {
      ok: false,
      reviewedCount: 0,
      failures: [
        {
          measureId: "batch",
          revisionId: "batch",
          batchKind: "FIRST_PUBLICATION",
          message: failure.message,
        },
      ],
    };
  }
}

export async function discardRevisionAction(input: {
  measureId: string;
  revisionId: string;
}): Promise<ActionResult> {
  await assertAuthenticated();

  try {
    await discardMeasureRevision(input);
    revalidate(input.measureId);
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

export async function publishRevisionAction(input: {
  measureId: string;
  revisionId: string;
  /** The `Measure.updatedAt` the page carried, in ISO form. */
  expectedUpdatedAt: string;
}): Promise<ActionResult> {
  await assertAuthenticated();

  try {
    await publishMeasureRevision({
      measureId: input.measureId,
      revisionId: input.revisionId,
      expectedUpdatedAt: parseDate(input.expectedUpdatedAt, "La version attendue"),
      publishedBy: ACTOR,
    });
    revalidate(input.measureId);
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

export async function publishReviewedBatchAction(input: unknown): Promise<BatchActionResult> {
  await assertAuthenticated();

  try {
    // Parse the complete request before the first write, so malformed trailing input cannot leave
    // a valid prefix published and then fail validation halfway through the lot.
    const parsed = batchPublicationInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new MeasureValidationError(
        `Le lot doit contenir entre 1 et ${MAX_MEASURE_PUBLICATION_BATCH_SIZE} éléments valides`
      );
    }
    const items = parsed.data.items.map((item) => ({
      measureId: item.measureId,
      revisionId: item.revisionId,
      expectedUpdatedAt: parseDate(item.expectedUpdatedAt, "La version attendue"),
      batchKind: item.batchKind,
    }));
    const result = await publishMeasureRevisionBatch(items, ACTOR);

    revalidatePath("/admin/mesures");
    for (const item of items) revalidatePath(`/admin/mesures/${item.measureId}`);

    return result.failures.length === 0
      ? { ok: true, publishedCount: result.publishedCount }
      : { ok: false, publishedCount: result.publishedCount, failures: result.failures };
  } catch (error) {
    const failure = toFailure(error);
    if (failure.ok) throw new Error("Résultat d'échec incohérent");
    return {
      ok: false,
      publishedCount: 0,
      failures: [
        {
          measureId: "batch",
          revisionId: "batch",
          message: failure.message,
          stale: failure.stale ?? false,
        },
      ],
    };
  }
}

export async function depublishMeasureAction(input: {
  measureId: string;
  reason: string;
  /** The `Measure.updatedAt` the page carried, in ISO form. */
  expectedUpdatedAt: string;
}): Promise<ActionResult> {
  await assertAuthenticated();

  try {
    await depublishMeasure({
      measureId: input.measureId,
      reason: input.reason,
      depublishedBy: ACTOR,
      expectedUpdatedAt: parseDate(input.expectedUpdatedAt, "La version attendue"),
    });
    revalidate(input.measureId);
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

export async function withdrawMeasureAction(input: {
  measureId: string;
  withdrawnAt: string;
  sourceUrl: string;
  sourceLabel: string;
  /** The `Measure.updatedAt` the page carried, in ISO form. */
  expectedUpdatedAt: string;
}): Promise<ActionResult> {
  await assertAuthenticated();

  try {
    await withdrawMeasure({
      measureId: input.measureId,
      withdrawnAt: parseDate(input.withdrawnAt, "La date de retrait"),
      sourceUrl: input.sourceUrl.trim(),
      sourceLabel: input.sourceLabel.trim(),
      expectedUpdatedAt: parseDate(input.expectedUpdatedAt, "La version attendue"),
    });
    revalidate(input.measureId);
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * A dated editorial conclusion on ONE formulation.
 *
 * No version token, and that is deliberate: a qualification writes a child table and leaves
 * `Measure.updatedAt` untouched, so the token would protect nothing here. The revision is targeted
 * explicitly instead, which is the guarantee that matters: a conclusion belongs to the text it was
 * drawn from.
 *
 * No update path either. Several dated conclusions on the same revision can be legitimate, so a
 * second reading is a second row, not an edit of the first.
 */
export async function createQualificationAction(input: {
  measureId: string;
  revisionId: string;
  kind: QualificationKind;
  rationale: string;
  sourceUrl: string | null;
  sourceLabel: string | null;
}): Promise<ActionResult> {
  await assertAuthenticated();

  try {
    await createQualification({
      measureRevisionId: input.revisionId,
      kind: input.kind,
      // The label follows the enum rather than being typed: two different wordings for the same
      // qualification would make the opposable definitions unopposable.
      label: QUALIFICATION_KIND_LABELS[input.kind],
      rationale: input.rationale,
      sourceUrl: input.sourceUrl,
      sourceLabel: input.sourceLabel,
      assessedBy: ACTOR,
    });
    revalidate(input.measureId);
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

/** Same reasoning as above: attached to one revision, never edited in place. */
export async function createSimilarityAssessmentAction(input: {
  measureId: string;
  revisionId: string;
  comparedCorpusVersion: string;
  conclusion: SimilarityConclusion;
  rationale: string;
  equivalentRevisionIds: string[];
}): Promise<ActionResult> {
  await assertAuthenticated();

  try {
    await createSimilarityAssessment({
      measureRevisionId: input.revisionId,
      comparedCorpusVersion: input.comparedCorpusVersion,
      conclusion: input.conclusion,
      rationale: input.rationale,
      assessedBy: ACTOR,
      equivalentRevisionIds: input.equivalentRevisionIds,
    });
    revalidate(input.measureId);
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * The manual attachment of the measure to a scrutin (spec §5.8), the only writer of MeasureVoteLink from
 * the UI. The input is a discriminated `situation`, so the three cases the reviewer must keep apart are
 * unrepresentable as a mix: "no scrutin found" carries neither a scrutinId nor a relation, an absence is a
 * relation on a chosen scrutin, and a broader-text vote carries no relation at all. createMeasureVoteLink
 * re-checks every one of these in its transaction: the type here is convenience, the transaction is the law.
 */
export type VoteLinkSituation =
  | { kind: "NO_VOTE_IDENTIFIED" }
  | { kind: "SAME_OBJECT"; scrutinId: string; relation: MeasureVoteRelation; isReference: boolean }
  | { kind: "BROADER_TEXT"; scrutinId: string };

export async function attachVoteLinkAction(input: {
  measureId: string;
  applicableRevisionId: string;
  situation: VoteLinkSituation;
  rationale: string;
  /** ISO date of the review that produced this link. */
  checkedAt: string;
  institutionScope: Chamber[];
  legislatureScope: string[];
  searchMethod: string;
}): Promise<ActionResult> {
  await assertAuthenticated();

  try {
    const base = {
      measureId: input.measureId,
      applicableRevisionId: input.applicableRevisionId,
      rationale: input.rationale,
      checkedAt: parseDate(input.checkedAt, "La date de vérification"),
      institutionScope: input.institutionScope,
      legislatureScope: input.legislatureScope,
      searchMethod: input.searchMethod,
      reviewedBy: ACTOR,
    };

    switch (input.situation.kind) {
      case "NO_VOTE_IDENTIFIED":
        await createMeasureVoteLink({
          ...base,
          linkKind: "NO_VOTE_IDENTIFIED",
          scrutinId: null,
          relation: null,
          isReference: false,
        });
        break;
      case "SAME_OBJECT":
        await createMeasureVoteLink({
          ...base,
          linkKind: "SAME_OBJECT",
          scrutinId: input.situation.scrutinId,
          relation: input.situation.relation,
          isReference: input.situation.isReference,
        });
        break;
      case "BROADER_TEXT":
        await createMeasureVoteLink({
          ...base,
          linkKind: "BROADER_TEXT",
          scrutinId: input.situation.scrutinId,
          relation: null,
          isReference: false,
        });
        break;
      default: {
        // Exhaustiveness: a new situation kind must add its branch here, not fall through silently.
        const exhaustive: never = input.situation;
        throw new MeasureValidationError(
          `Situation de rattachement inconnue : ${JSON.stringify(exhaustive)}`
        );
      }
    }

    revalidate(input.measureId);
    return { ok: true, measureId: input.measureId };
  } catch (error) {
    return toFailure(error);
  }
}
