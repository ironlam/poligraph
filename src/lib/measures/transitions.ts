import type {
  MeasureAttribution,
  MeasureExtractionMethod,
  MeasurePrecision,
  MeasureSourceKind,
  SourceTier,
  ThemeCategory,
} from "@/generated/prisma";
import { db, type DbTransactionClient } from "@/lib/db";
import { MeasureValidationError } from "./errors";
import { lockMeasure } from "./lock";
import { syncSearchDocument } from "./search-sync";

export type MeasureSourceInput = {
  sourceKind: MeasureSourceKind;
  tier: SourceTier;
  url: string;
  page: string | null;
  publishedAt: Date;
};

export type MeasureRevisionInput = {
  text: string;
  precision: MeasurePrecision | null;
  validFrom: Date;
  extractionMethod: MeasureExtractionMethod;
  extractionConfidence: number | null;
  extractorVersion: string | null;
};

export type CreateMeasureInput = {
  politicianId: string;
  electionId: string;
  candidacyId: string | null;
  programEditionId: string | null;
  attribution: MeasureAttribution;
  theme: ThemeCategory;
  precedingMeasureId: string | null;
  revision: MeasureRevisionInput;
  sources: MeasureSourceInput[];
};

/**
 * The two consistency invariants of spec 5.2. Both relations are individually valid
 * foreign keys, so nothing in the schema catches the mismatch: it has to be checked.
 * Shared with draftMeasureRevision, which can also move a measure's context.
 */
async function assertContextIsCoherent(
  tx: DbTransactionClient,
  input: Pick<
    CreateMeasureInput,
    "politicianId" | "electionId" | "candidacyId" | "programEditionId"
  >
): Promise<void> {
  if (input.candidacyId) {
    const candidacy = await tx.candidacy.findUnique({
      where: { id: input.candidacyId },
      select: { politicianId: true },
    });
    if (!candidacy) {
      throw new MeasureValidationError(`Candidature ${input.candidacyId} introuvable`);
    }
    if (candidacy.politicianId !== input.politicianId) {
      throw new MeasureValidationError(
        "La candidature n'appartient pas au politicien de la mesure"
      );
    }
  }

  if (input.programEditionId) {
    const edition = await tx.programEdition.findUnique({
      where: { id: input.programEditionId },
      select: { electionId: true },
    });
    if (!edition) {
      throw new MeasureValidationError(`Édition ${input.programEditionId} introuvable`);
    }
    if (edition.electionId !== input.electionId) {
      throw new MeasureValidationError(
        "L'édition de programme porte sur une autre élection que la mesure"
      );
    }
  }
}

function assertRevisionIsUsable(
  revision: MeasureRevisionInput,
  sources: MeasureSourceInput[]
): void {
  if (revision.text.trim() === "") {
    throw new MeasureValidationError("Le texte de la révision est vide");
  }
  // A revision with no source can never be published (audit rule of spec 12.1), so
  // accepting one here would create something structurally unpublishable.
  if (sources.length === 0) {
    throw new MeasureValidationError("Une révision exige au moins une source");
  }
}

/**
 * Creates a measure and its first revision, in draft. Nothing is published: the
 * measure starts at publicationStatus = DRAFT with publishedRevisionId null, and only
 * publishMeasureRevision() can change that.
 *
 * No lockMeasure() call here, and it is not an oversight: the row does not exist yet,
 * so there is nothing to lock. Every other transition locks first.
 */
export async function createMeasure(
  input: CreateMeasureInput
): Promise<{ measureId: string; revisionId: string }> {
  assertRevisionIsUsable(input.revision, input.sources);

  return db.$transaction(async (tx) => {
    await assertContextIsCoherent(tx, input);

    const measure = await tx.measure.create({
      data: {
        politicianId: input.politicianId,
        electionId: input.electionId,
        candidacyId: input.candidacyId,
        programEditionId: input.programEditionId,
        attribution: input.attribution,
        theme: input.theme,
        precedingMeasureId: input.precedingMeasureId,
      },
    });

    const revision = await tx.measureRevision.create({
      data: {
        measureId: measure.id,
        text: input.revision.text,
        precision: input.revision.precision,
        validFrom: input.revision.validFrom,
        extractionMethod: input.revision.extractionMethod,
        extractionConfidence: input.revision.extractionConfidence,
        extractorVersion: input.revision.extractorVersion,
        sources: { create: input.sources },
      },
    });

    await tx.measure.update({
      where: { id: measure.id },
      data: { latestRevisionId: revision.id },
    });

    // Spec 7.2, visibility policy: "entity created in draft, row created with
    // visibility = ADMIN_ONLY". Not optional, and not deferrable to publication: a
    // measure with no document is invisible to the moderation search from the moment it
    // exists, and the audit reports it as missing.
    await syncSearchDocument(tx, measure.id);

    return { measureId: measure.id, revisionId: revision.id };
  });
}

export type DraftMeasureRevisionInput = {
  measureId: string;
  revision: MeasureRevisionInput;
  sources: MeasureSourceInput[];
};

// No `discardedBy` and no `supersedesDraftBy`. A first version of this plan took a
// `supersedesDraftBy` and never stored it anywhere, which is a parameter documenting an
// intention the code does not honour. Attributing a discard needs a real column on
// MeasureRevision, and the moderation admin is what will know whether it needs one.

/**
 * Creates a new revision in draft. The public keeps seeing publishedRevisionId, which
 * this function never touches.
 *
 * Also discards the previous active draft, and that second write is the point: without
 * it, two successive calls leave two active drafts while latestRevisionId designates only
 * one of them. The other becomes an orphan no path can ever publish or clean up.
 */
export async function draftMeasureRevision(
  input: DraftMeasureRevisionInput
): Promise<{ revisionId: string }> {
  assertRevisionIsUsable(input.revision, input.sources);

  return db.$transaction(async (tx) => {
    await lockMeasure(tx, input.measureId);

    const measure = await tx.measure.findUniqueOrThrow({
      where: { id: input.measureId },
      select: { latestRevisionId: true, publishedRevisionId: true },
    });

    // The previous latest revision is an active draft only if it is not the published
    // one: a published revision is superseded at publication time, never discarded.
    if (measure.latestRevisionId && measure.latestRevisionId !== measure.publishedRevisionId) {
      await tx.measureRevision.update({
        where: { id: measure.latestRevisionId },
        data: { discardedAt: new Date() },
      });
    }

    const revision = await tx.measureRevision.create({
      data: {
        measureId: input.measureId,
        text: input.revision.text,
        precision: input.revision.precision,
        validFrom: input.revision.validFrom,
        extractionMethod: input.revision.extractionMethod,
        extractionConfidence: input.revision.extractionConfidence,
        extractorVersion: input.revision.extractorVersion,
        sources: { create: input.sources },
      },
    });

    await tx.measure.update({
      where: { id: input.measureId },
      data: { latestRevisionId: revision.id },
    });

    // Re-derives the document. On a public measure this changes nothing, because the
    // reference stays publishedRevisionId: that is precisely how a correction in progress
    // stays invisible. On a never-published or depublished measure, it moves the
    // ADMIN_ONLY document onto the new draft.
    await syncSearchDocument(tx, input.measureId);

    return { revisionId: revision.id };
  });
}

/**
 * Records that a human read this formulation. Separate from publication on purpose: a
 * function that receives reviewedAt as a parameter declares the review rather than
 * verifying it, which made the guarantee "a published revision has been reviewed"
 * circular in the first version of this plan.
 */
export async function reviewMeasureRevision(input: {
  measureId: string;
  revisionId: string;
  reviewedBy: string;
}): Promise<void> {
  if (input.reviewedBy.trim() === "") {
    throw new MeasureValidationError("Le relecteur doit être identifié");
  }

  await db.$transaction(async (tx) => {
    await lockMeasure(tx, input.measureId);

    const revision = await tx.measureRevision.findUnique({
      where: { id: input.revisionId },
      select: { measureId: true, discardedAt: true, supersededAt: true },
    });
    if (!revision) throw new MeasureValidationError(`Révision ${input.revisionId} introuvable`);
    if (revision.measureId !== input.measureId) {
      throw new MeasureValidationError("La révision appartient à une autre mesure");
    }
    if (revision.discardedAt) {
      throw new MeasureValidationError("Une révision abandonnée ne peut pas être relue");
    }
    if (revision.supersededAt) {
      throw new MeasureValidationError("Une révision remplacée ne peut pas être relue");
    }

    await tx.measureRevision.update({
      where: { id: input.revisionId },
      data: { reviewedAt: new Date(), reviewedBy: input.reviewedBy },
    });
  });
}

/**
 * Abandons a draft. If it was the latest, the pointer falls back to the published
 * revision, so the measure never designates a discarded draft as its latest state.
 */
export async function discardMeasureRevision(input: {
  measureId: string;
  revisionId: string;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockMeasure(tx, input.measureId);

    // Ownership check, not a formality: the lock is taken on input.measureId, and the
    // update targets input.revisionId. Without this, a call can lock measure A and set
    // discardedAt on a revision of measure B, which is both unlocked and untouched by the
    // caller's intent.
    const revision = await tx.measureRevision.findUnique({
      where: { id: input.revisionId },
      select: { measureId: true },
    });
    if (!revision) throw new MeasureValidationError(`Révision ${input.revisionId} introuvable`);
    if (revision.measureId !== input.measureId) {
      throw new MeasureValidationError("La révision appartient à une autre mesure");
    }

    const measure = await tx.measure.findUniqueOrThrow({
      where: { id: input.measureId },
      select: { latestRevisionId: true, publishedRevisionId: true },
    });
    if (input.revisionId === measure.publishedRevisionId) {
      throw new MeasureValidationError(
        "Une révision publiée ne s'abandonne pas, elle se dépublie ou se remplace"
      );
    }

    await tx.measureRevision.update({
      where: { id: input.revisionId },
      data: { discardedAt: new Date() },
    });

    if (measure.latestRevisionId === input.revisionId) {
      await tx.measure.update({
        where: { id: input.measureId },
        data: { latestRevisionId: measure.publishedRevisionId },
      });
    }

    await syncSearchDocument(tx, input.measureId);
  });
}
