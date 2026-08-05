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
