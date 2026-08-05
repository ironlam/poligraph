"use server";

import { revalidatePath } from "next/cache";
import { QUALIFICATION_KIND_LABELS } from "@/config/labels";
import type {
  MeasureAttribution,
  MeasureExtractionMethod,
  MeasurePrecision,
  MeasureSourceKind,
  QualificationKind,
  SimilarityConclusion,
  SourceTier,
  ThemeCategory,
} from "@/generated/prisma";
import { isAuthenticated } from "@/lib/auth";
import { createQualification, createSimilarityAssessment } from "@/lib/measures/assessments";
import { MeasureConcurrencyError, MeasureValidationError } from "@/lib/measures/errors";
import {
  createMeasure,
  depublishMeasure,
  discardMeasureRevision,
  draftMeasureRevision,
  publishMeasureRevision,
  reviewMeasureRevision,
  withdrawMeasure,
} from "@/lib/measures/transitions";

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

/**
 * The admin auth of this project is a single signed cookie with no per-user identity (see
 * `src/lib/auth.ts`), so every action attributes its review to a constant actor. Same convention as
 * `src/app/admin/policy-titles/actions.ts`. Inventing a reviewer name in a form would produce an
 * unverifiable attribution, which is worse than no attribution.
 */
const ACTOR = "admin";

async function assertAuthenticated(): Promise<void> {
  if (!(await isAuthenticated())) throw new Error("Non autorisé");
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
  precision: MeasurePrecision | null;
  validFrom: string;
  extractionMethod: MeasureExtractionMethod;
};

function toRevision(input: RevisionInput) {
  return {
    text: input.text,
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
    const { measureId } = await createMeasure({
      politicianId: input.politicianId,
      electionId: input.electionId,
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
}): Promise<ActionResult> {
  await assertAuthenticated();

  try {
    await draftMeasureRevision({
      measureId: input.measureId,
      revision: toRevision(input.revision),
      sources: toSources(input.sources),
      expectedUpdatedAt: parseDate(input.expectedUpdatedAt, "La version attendue"),
    });
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
    });
    revalidate(input.measureId);
    return { ok: true };
  } catch (error) {
    return toFailure(error);
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
