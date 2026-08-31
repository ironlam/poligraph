import type {
  MeasureAttribution,
  MeasureExtractionMethod,
  MeasurePrecision,
  MeasureRejectionReason,
  MeasureReviewReadiness,
  MeasureReviewWarning,
  MeasureSourceKind,
  SourceTier,
  ThemeCategory,
} from "@/generated/prisma";
import { db, type DbTransactionClient } from "@/lib/db";
import {
  GENERATED_CONTEXT_DRAFT_ACTION,
  type GeneratedContextClaim,
} from "@/lib/measures/context-provenance";
import { invalidateMeasureTags } from "./cache";
import {
  createV6CorrectionFingerprint,
  validateRevisionEvidence,
  type MeasureImportEngine,
} from "./evidence-snapshot";
import { MeasureConcurrencyError, MeasureValidationError } from "./errors";
import { lockMeasure, lockMeasureCandidacy } from "./lock";
import { syncSearchDocument } from "./search-sync";
import { PUBLIC_PRESIDENTIAL_FICHE_WHERE } from "@/lib/presidentielle/publication";
import {
  syncCandidacySearchDocument,
  syncPresidentialSearchDocumentsForCandidacy,
} from "@/lib/presidentielle/search-sync";
import { isAllowedPresidentialMeasureTheme } from "@/lib/presidentielle/themes";
import { allocateMeasureSlug } from "./slug";

export type MeasureSourceInput = {
  sourceKind: MeasureSourceKind;
  tier: SourceTier;
  url: string;
  page: string | null;
  publishedAt: Date;
};

export type MeasureRevisionInput = {
  text: string;
  details?: string | null;
  precision: MeasurePrecision | null;
  validFrom: Date;
  extractionMethod: MeasureExtractionMethod;
  extractionConfidence: number | null;
  extractorVersion: string | null;
  importEngine?: MeasureImportEngine;
  evidenceSnapshot?: unknown | null;
  importFingerprint?: string | null;
  reviewReadiness?: MeasureReviewReadiness | null;
  reviewWarnings?: MeasureReviewWarning[];
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
    "politicianId" | "electionId" | "candidacyId" | "programEditionId" | "theme"
  >
): Promise<void> {
  const election = await tx.election.findUnique({
    where: { id: input.electionId },
    select: { slug: true },
  });
  if (!election) {
    throw new MeasureValidationError(`Élection ${input.electionId} introuvable`);
  }
  if (!isAllowedPresidentialMeasureTheme(election.slug, input.theme)) {
    throw new MeasureValidationError(
      "Le thème historique SOCIAL_TRAVAIL n'est pas autorisé pour une mesure présidentielle 2027"
    );
  }

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

/**
 * Refuses a write built on a state the caller no longer sees.
 *
 * Called after lockMeasure() in every transition that writes the Measure ROW. `undefined` means
 * "do not check", for scripts and the migration, which have no rendered page.
 *
 * BOUND OF THE GUARANTEE: `Measure.updatedAt` only moves when the Measure row is written, so this
 * covers publication, depublication, withdrawal, drafting and discarding. It is NOT a version of
 * the editorial dossier: reviewing a revision, adding a qualification or recording a similarity
 * assessment write a revision or a child table and leave `updatedAt` untouched. Those have their
 * own preconditions instead, which is why reviewMeasureRevision() refuses an already-reviewed
 * revision rather than taking a token.
 */
function assertVersionMatches(measureId: string, expected: Date | undefined, actual: Date): void {
  if (expected !== undefined && actual.getTime() !== expected.getTime()) {
    throw new MeasureConcurrencyError(measureId, expected, actual);
  }
}

function assertRevisionIsUsable(
  revision: MeasureRevisionInput,
  sources: MeasureSourceInput[]
): ReturnType<typeof validateRevisionEvidence> & { ok: true } {
  if (revision.text.trim() === "") {
    throw new MeasureValidationError("Le texte de la révision est vide");
  }
  if ((revision.details?.length ?? 0) > 20_000) {
    throw new MeasureValidationError("Les détails de la révision dépassent 20 000 caractères");
  }
  // A revision with no source can never be published (audit rule of spec 12.1), so
  // accepting one here would create something structurally unpublishable.
  if (sources.length === 0) {
    throw new MeasureValidationError("Une révision exige au moins une source");
  }
  const evidence = validateRevisionEvidence(revision);
  if (!evidence.ok) {
    throw new MeasureValidationError(evidence.reason);
  }
  if (revision.importEngine === "V6" && revision.extractionMethod === "AI_ASSISTED") {
    if (!revision.importFingerprint || !/^[a-f0-9]{64}$/.test(revision.importFingerprint)) {
      throw new MeasureValidationError("Un import V6 exige une clé d'idempotence valide");
    }
    if (!revision.reviewReadiness) {
      throw new MeasureValidationError("Un import V6 exige un état de préparation à la revue");
    }
    const warningCount = revision.reviewWarnings?.length ?? 0;
    if (
      (revision.reviewReadiness === "READY_FOR_REVIEW" && warningCount > 0) ||
      (revision.reviewReadiness === "REVIEW_WITH_WARNING" && warningCount === 0)
    ) {
      throw new MeasureValidationError("L'état de revue V6 contredit ses warnings");
    }
  }
  return evidence;
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
  const evidence = assertRevisionIsUsable(input.revision, input.sources);

  return db.$transaction(async (tx) => {
    await assertContextIsCoherent(tx, input);
    const slug = await allocateMeasureSlug(tx, input.politicianId, input.revision.text);

    const measure = await tx.measure.create({
      data: {
        slug,
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
        details: input.revision.details?.trim() || null,
        precision: input.revision.precision,
        validFrom: input.revision.validFrom,
        extractionMethod: input.revision.extractionMethod,
        extractionConfidence: input.revision.extractionConfidence,
        extractorVersion: input.revision.extractorVersion,
        evidenceSnapshot: evidence.evidenceSnapshot,
        importFingerprint: input.revision.importFingerprint,
        reviewReadiness: input.revision.reviewReadiness,
        reviewWarnings: input.revision.reviewWarnings,
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
  /**
   * The `Measure.updatedAt` the caller last saw. Drafting needs this as much as publishing does:
   * it ACTIVELY discards the previous active draft, so a stale page throws away a colleague's work
   * in progress without anyone seeing it.
   */
  expectedUpdatedAt?: Date;
  /** Preserves immutable V6 proof when a human corrects the active imported formulation. */
  preserveEvidenceFromRevisionId?: string;
  correctedBy?: string;
  generatedContext?: {
    claims: GeneratedContextClaim[];
    evidenceUnitIds: string[];
    generatedBy: string;
    ipAddress: string;
    model: string;
    promptVersion: string;
    userAgent: string;
  };
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
  return db.$transaction(async (tx) => {
    await lockMeasure(tx, input.measureId);

    const measure = await tx.measure.findUniqueOrThrow({
      where: { id: input.measureId },
      select: {
        latestRevisionId: true,
        publishedRevisionId: true,
        candidacyId: true,
        updatedAt: true,
      },
    });

    if (measure.candidacyId) await lockMeasureCandidacy(tx, measure.candidacyId);

    assertVersionMatches(input.measureId, input.expectedUpdatedAt, measure.updatedAt);

    let revisionInput = input.revision;
    let revisionSources = input.sources;
    if (input.preserveEvidenceFromRevisionId) {
      if (measure.latestRevisionId !== input.preserveEvidenceFromRevisionId) {
        throw new MeasureValidationError(
          "La preuve à conserver n'appartient plus au brouillon actif"
        );
      }
      const previous = await tx.measureRevision.findUnique({
        where: { id: input.preserveEvidenceFromRevisionId },
        select: {
          measureId: true,
          evidenceSnapshot: true,
          reviewedAt: true,
          publishedAt: true,
          discardedAt: true,
          rejectedAt: true,
          reviewReadiness: true,
          reviewWarnings: true,
          sources: {
            select: {
              sourceKind: true,
              tier: true,
              url: true,
              page: true,
              publishedAt: true,
            },
          },
        },
      });
      if (!previous || previous.measureId !== input.measureId) {
        throw new MeasureValidationError("La révision source de la preuve est introuvable");
      }
      if (
        input.generatedContext &&
        measure.latestRevisionId !== measure.publishedRevisionId &&
        (previous.reviewedAt !== null ||
          previous.publishedAt !== null ||
          previous.discardedAt !== null ||
          previous.rejectedAt !== null)
      ) {
        throw new MeasureValidationError(
          "Un brouillon relu ou modéré ne peut pas être remplacé automatiquement"
        );
      }
      revisionInput = {
        ...input.revision,
        importEngine: previous.evidenceSnapshot === null ? input.revision.importEngine : "V6",
        evidenceSnapshot: previous.evidenceSnapshot,
        reviewReadiness: previous.reviewReadiness,
        reviewWarnings: previous.reviewWarnings,
        importFingerprint:
          input.revision.extractionMethod === "AI_ASSISTED"
            ? createV6CorrectionFingerprint({
                previousRevisionId: input.preserveEvidenceFromRevisionId,
                text: input.revision.text,
                details: input.revision.details,
              })
            : null,
      };
      revisionSources = previous.sources;
    }
    const evidence = assertRevisionIsUsable(revisionInput, revisionSources);

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
        text: revisionInput.text,
        details: revisionInput.details?.trim() || null,
        precision: revisionInput.precision,
        validFrom: revisionInput.validFrom,
        extractionMethod: revisionInput.extractionMethod,
        extractionConfidence: revisionInput.extractionConfidence,
        extractorVersion: revisionInput.extractorVersion,
        evidenceSnapshot: evidence.evidenceSnapshot,
        importFingerprint: revisionInput.importFingerprint,
        reviewReadiness: revisionInput.reviewReadiness,
        reviewWarnings: revisionInput.reviewWarnings,
        sources: { create: revisionSources },
      },
    });

    if (input.preserveEvidenceFromRevisionId) {
      await tx.auditLog.create({
        data: {
          action: input.generatedContext ? GENERATED_CONTEXT_DRAFT_ACTION : "CORRECT_DRAFT",
          entityType: "MeasureRevision",
          entityId: revision.id,
          changes: {
            previousRevisionId: input.preserveEvidenceFromRevisionId,
            evidenceSnapshotPreserved: true,
            ...(input.generatedContext
              ? {
                  claims: input.generatedContext.claims,
                  evidenceUnitIds: input.generatedContext.evidenceUnitIds,
                  generatedBy: input.generatedContext.generatedBy,
                  model: input.generatedContext.model,
                  promptVersion: input.generatedContext.promptVersion,
                }
              : {}),
          },
          userId: input.generatedContext?.generatedBy ?? input.correctedBy,
          ipAddress: input.generatedContext?.ipAddress,
          userAgent: input.generatedContext?.userAgent,
        },
      });
    }

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

    const measure = await tx.measure.findUniqueOrThrow({
      where: { id: input.measureId },
      select: { latestRevisionId: true, publishedRevisionId: true },
    });

    const revision = await tx.measureRevision.findUnique({
      where: { id: input.revisionId },
      select: {
        measureId: true,
        discardedAt: true,
        supersededAt: true,
        rejectedAt: true,
        reviewedAt: true,
        _count: { select: { sources: true } },
      },
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
    if (revision.rejectedAt) {
      throw new MeasureValidationError("Une révision rejetée ne peut pas être relue");
    }
    if (measure.latestRevisionId !== input.revisionId) {
      throw new MeasureValidationError("Seul le brouillon actif peut être relu");
    }
    if (measure.publishedRevisionId === input.revisionId) {
      throw new MeasureValidationError("Une révision déjà publiée ne peut pas être relue");
    }
    if (revision._count.sources === 0) {
      throw new MeasureValidationError("Une révision sans source ne peut pas être relue");
    }
    // Without this, a second review overwrites reviewedAt and reviewedBy: two successive reviewers
    // leave only the trace of the last one, and the attribution becomes false without anything
    // failing. A real counter-review needs its own history; simulating it by erasing the previous
    // reviewer is worse than not having it.
    if (revision.reviewedAt) {
      throw new MeasureValidationError("Cette révision a déjà été relue");
    }

    await tx.measureRevision.update({
      where: { id: input.revisionId },
      data: { reviewedAt: new Date(), reviewedBy: input.reviewedBy },
    });
    await tx.auditLog.create({
      data: {
        action: "REVIEW_MEASURE_REVISION",
        entityType: "MeasureRevision",
        entityId: input.revisionId,
        changes: { measureId: input.measureId },
        userId: input.reviewedBy,
      },
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
      select: { latestRevisionId: true, publishedRevisionId: true, candidacyId: true },
    });
    if (measure.candidacyId) await lockMeasureCandidacy(tx, measure.candidacyId);
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

/** Records a structured human rejection of an unpublished proposal. */
export async function rejectMeasureRevision(input: {
  measureId: string;
  revisionId: string;
  reason: MeasureRejectionReason;
  detail: string | null;
  rejectedBy: string;
}): Promise<void> {
  if (input.rejectedBy.trim() === "") {
    throw new MeasureValidationError("Le relecteur doit être identifié");
  }
  if (input.reason === "OTHER" && (input.detail === null || input.detail.trim() === "")) {
    throw new MeasureValidationError("Le motif Autre exige une précision");
  }

  await db.$transaction(async (tx) => {
    await lockMeasure(tx, input.measureId);
    const measure = await tx.measure.findUniqueOrThrow({
      where: { id: input.measureId },
      select: { latestRevisionId: true, publishedRevisionId: true, candidacyId: true },
    });
    if (measure.candidacyId) await lockMeasureCandidacy(tx, measure.candidacyId);
    if (input.revisionId === measure.publishedRevisionId) {
      throw new MeasureValidationError("Une révision publiée ne peut pas être rejetée");
    }
    const revision = await tx.measureRevision.findUnique({
      where: { id: input.revisionId },
      select: { measureId: true, discardedAt: true, rejectedAt: true },
    });
    if (!revision || revision.measureId !== input.measureId) {
      throw new MeasureValidationError("La révision à rejeter est introuvable sur cette mesure");
    }
    if (revision.discardedAt || revision.rejectedAt) {
      throw new MeasureValidationError("Cette révision a déjà été abandonnée ou rejetée");
    }

    const now = new Date();
    await tx.measureRevision.update({
      where: { id: input.revisionId },
      data: {
        discardedAt: now,
        rejectedAt: now,
        rejectedBy: input.rejectedBy,
        rejectionReason: input.reason,
        rejectionDetail: input.detail?.trim() || null,
      },
    });
    await tx.auditLog.create({
      data: {
        action: "REJECT_DRAFT",
        entityType: "MeasureRevision",
        entityId: input.revisionId,
        changes: { reason: input.reason, detail: input.detail?.trim() || null },
        userId: input.rejectedBy,
      },
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

/**
 * Publishes a reviewed revision. Five writes in one PostgreSQL transaction, then the cache
 * invalidation outside it.
 *
 * Note what this signature does NOT take: no reviewedAt, no reviewedBy. The review is
 * verified here, never declared. A publish function that accepts a review timestamp makes
 * the "a published revision has been reviewed" guarantee circular.
 */
export async function publishMeasureRevision(input: {
  measureId: string;
  revisionId: string;
  /** Set by authenticated editorial entrypoints so publication itself is auditable. */
  publishedBy?: string;
  /**
   * The `Measure.updatedAt` the caller last saw. When given, publication is refused if the row
   * has moved since, with MeasureConcurrencyError.
   *
   * Optimistic concurrency, and it belongs HERE rather than in the caller: checking before
   * calling the transition would be a read-then-decide outside the lock, which is the race this
   * module takes the lock for.
   *
   * `updatedAt` rather than `publishedRevisionId`, because depublishMeasure() keeps the pointer
   * and only moves publicationStatus. Comparing the pointer would let the worst case through: a
   * reviewer republishing content another reviewer just took down for a legal reason.
   *
   * Optional on purpose: a script or the Promise migration has no rendered page, so demanding a
   * version from them would be a check with nothing to check.
   */
  expectedUpdatedAt?: Date;
}): Promise<void> {
  const { electionId } = await db.$transaction(async (tx) => {
    await lockMeasure(tx, input.measureId);

    const measure = await tx.measure.findUniqueOrThrow({
      where: { id: input.measureId },
      select: {
        electionId: true,
        candidacyId: true,
        publishedRevisionId: true,
        latestRevisionId: true,
        updatedAt: true,
      },
    });

    if (measure.candidacyId) await lockMeasureCandidacy(tx, measure.candidacyId);

    assertVersionMatches(input.measureId, input.expectedUpdatedAt, measure.updatedAt);

    const ficheWasPublic = measure.candidacyId
      ? (await tx.candidacy.findFirst({
          where: { id: measure.candidacyId, ...PUBLIC_PRESIDENTIAL_FICHE_WHERE },
          select: { id: true },
        })) !== null
      : false;

    const revision = await tx.measureRevision.findUnique({
      where: { id: input.revisionId },
      select: {
        measureId: true,
        text: true,
        reviewedAt: true,
        discardedAt: true,
        supersededAt: true,
        evidenceSnapshot: true,
        reviewReadiness: true,
        _count: { select: { sources: true } },
      },
    });

    if (!revision) throw new MeasureValidationError(`Révision ${input.revisionId} introuvable`);
    if (revision.measureId !== input.measureId) {
      throw new MeasureValidationError("La révision appartient à une autre mesure");
    }
    if (!revision.reviewedAt) {
      throw new MeasureValidationError("Une révision non relue ne peut pas être publiée");
    }
    if (revision.discardedAt) {
      throw new MeasureValidationError("Une révision abandonnée ne peut pas être publiée");
    }
    if (revision.supersededAt) {
      throw new MeasureValidationError("Une révision remplacée ne peut pas être republiée");
    }
    if (revision._count.sources === 0) {
      throw new MeasureValidationError("Une révision publiée doit porter au moins une source");
    }
    if (revision.reviewReadiness !== null) {
      const evidence = validateRevisionEvidence({
        importEngine: "V6",
        evidenceSnapshot: revision.evidenceSnapshot,
      });
      if (!evidence.ok) {
        throw new MeasureValidationError(
          "Une révision V6 sans preuve valide ne peut pas être publiée"
        );
      }
    }

    const now = new Date();

    // Republishing the current revision while a draft is in flight must NOT move
    // latestRevisionId: pointing it back at the published revision would leave the draft
    // active with no pointer designating it, which the audit reports as an orphan.
    // Reachable through an admin republish after a depublication.
    const hasNewerDraft =
      measure.latestRevisionId !== null &&
      measure.latestRevisionId !== input.revisionId &&
      measure.latestRevisionId !== measure.publishedRevisionId;

    if (measure.publishedRevisionId && measure.publishedRevisionId !== input.revisionId) {
      await tx.measureRevision.update({
        where: { id: measure.publishedRevisionId },
        data: { supersededAt: now },
      });
    }

    await tx.measureRevision.update({
      where: { id: input.revisionId },
      data: { publishedAt: now },
    });

    await tx.measure.update({
      where: { id: input.measureId },
      data: {
        publishedRevisionId: input.revisionId,
        publicationStatus: "PUBLISHED",
        depublishedAt: null,
        depublicationReason: null,
        // Publishing normally makes the revision the latest state too, unless a newer
        // draft is in flight (see hasNewerDraft above).
        ...(hasNewerDraft ? {} : { latestRevisionId: input.revisionId }),
      },
    });

    if (input.publishedBy) {
      await tx.auditLog.create({
        data: {
          action: "PUBLISH_MEASURE_REVISION",
          entityType: "MeasureRevision",
          entityId: input.revisionId,
          changes: { measureId: input.measureId },
          userId: input.publishedBy,
        },
      });
    }

    const ficheIsPublic = measure.candidacyId
      ? (await tx.candidacy.findFirst({
          where: { id: measure.candidacyId, ...PUBLIC_PRESIDENTIAL_FICHE_WHERE },
          select: { id: true },
        })) !== null
      : false;

    // In the same transaction: the database must never expose a new revision while the
    // index still holds the previous text. Called last, so it reads the pointers this
    // transaction has just written.
    if (measure.candidacyId && ficheWasPublic !== ficheIsPublic) {
      // A publication can only keep the fiche stable or open it. When it opens the fiche, no
      // other qualifying published measure existed before this one, so every other measure keeps
      // its visibility. Enumerating the whole programme would only lengthen the transaction and
      // can exhaust Prisma's timeout on large corpora.
      await syncCandidacySearchDocument(tx, measure.candidacyId);
      await syncSearchDocument(tx, input.measureId);
    } else {
      await syncSearchDocument(tx, input.measureId);
    }

    return { electionId: measure.electionId };
  });

  invalidateMeasureTags(input.measureId, electionId);
}

/**
 * Our act: removing a published measure from the site. Reserved for content that is
 * legally or factually dangerous, which is why it demands a reason.
 *
 * Does not touch the revision: what the candidate said has not changed, only our decision
 * to show it.
 */
export async function depublishMeasure(input: {
  measureId: string;
  reason: string;
  /** Set by authenticated editorial entrypoints so the removal itself is auditable. */
  depublishedBy?: string;
  /**
   * The `Measure.updatedAt` the caller last saw. Without it, an old page depublishes a correction
   * that was published in the meantime, with a reason written about the previous formulation.
   */
  expectedUpdatedAt?: Date;
}): Promise<void> {
  if (input.reason.trim() === "") {
    throw new MeasureValidationError("Une dépublication exige un motif");
  }
  if (input.depublishedBy !== undefined && input.depublishedBy.trim() === "") {
    throw new MeasureValidationError("Le responsable de la dépublication doit être identifié");
  }

  const { electionId } = await db.$transaction(async (tx) => {
    await lockMeasure(tx, input.measureId);

    const measure = await tx.measure.findUniqueOrThrow({
      where: { id: input.measureId },
      select: { electionId: true, candidacyId: true, updatedAt: true },
    });

    if (measure.candidacyId) await lockMeasureCandidacy(tx, measure.candidacyId);

    assertVersionMatches(input.measureId, input.expectedUpdatedAt, measure.updatedAt);

    await tx.measure.update({
      where: { id: input.measureId },
      data: {
        publicationStatus: "DRAFT",
        depublishedAt: new Date(),
        depublicationReason: input.reason,
      },
    });

    if (input.depublishedBy) {
      await tx.auditLog.create({
        data: {
          action: "DEPUBLISH_MEASURE",
          entityType: "Measure",
          entityId: input.measureId,
          changes: { reason: input.reason.trim() },
          userId: input.depublishedBy,
        },
      });
    }

    // Re-derives rather than just flipping visibility. With a draft in flight, the
    // reference revision becomes latestRevisionId, so the document must carry the draft
    // text: only changing visibility would leave it aligned on the former published
    // revision, which the staleness rule reports as stale. The row is kept either way, an
    // upsert never deletes.
    if (measure.candidacyId) {
      // Depublishing the last primary-sourced measure closes the fiche and therefore every measure
      // document it carried. Re-evaluate the set before committing.
      await syncPresidentialSearchDocumentsForCandidacy(tx, measure.candidacyId);
    } else {
      await syncSearchDocument(tx, input.measureId);
    }

    return { electionId: measure.electionId };
  });

  invalidateMeasureTags(input.measureId, electionId);
}

/**
 * The candidate's act: dropping a proposal before the election. Not a revision, and not a
 * depublication. The measure keeps its published revision and its sources, and its
 * withdrawal state is displayed explicitly.
 *
 * The three withdrawal fields are written here and nowhere else, and never separately.
 *
 * Withdrawal now changes public search eligibility. It can also close the carrier fiche when the
 * withdrawn proposal was its last primary-sourced current measure, so the full candidacy set is
 * synchronized in the same transaction.
 */
export async function withdrawMeasure(input: {
  measureId: string;
  withdrawnAt: Date;
  sourceUrl: string;
  sourceLabel: string;
  /**
   * The `Measure.updatedAt` the caller last saw. A withdrawal is the candidate's act, recorded by
   * us: recording it against a state nobody looked at attaches a political fact to the wrong
   * formulation.
   */
  expectedUpdatedAt?: Date;
}): Promise<void> {
  if (input.sourceUrl.trim() === "" || input.sourceLabel.trim() === "") {
    throw new MeasureValidationError("Un retrait exige une URL et un libellé de source, les deux");
  }

  const { electionId } = await db.$transaction(async (tx) => {
    await lockMeasure(tx, input.measureId);

    const measure = await tx.measure.findUniqueOrThrow({
      where: { id: input.measureId },
      select: { electionId: true, candidacyId: true, updatedAt: true },
    });

    if (measure.candidacyId) await lockMeasureCandidacy(tx, measure.candidacyId);

    assertVersionMatches(input.measureId, input.expectedUpdatedAt, measure.updatedAt);

    await tx.measure.update({
      where: { id: input.measureId },
      data: {
        withdrawnAt: input.withdrawnAt,
        withdrawnSourceUrl: input.sourceUrl,
        withdrawnSourceLabel: input.sourceLabel,
      },
    });

    if (measure.candidacyId) {
      await syncPresidentialSearchDocumentsForCandidacy(tx, measure.candidacyId);
    } else {
      await syncSearchDocument(tx, input.measureId);
    }

    return { electionId: measure.electionId };
  });

  invalidateMeasureTags(input.measureId, electionId);
}
