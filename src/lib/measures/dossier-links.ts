import { db, type DbTransactionClient } from "@/lib/db";
import type { MeasureDossierLink, MeasureDossierLinkKind } from "@/generated/prisma";
import { lockMeasure } from "./lock";
import { MeasureValidationError } from "./errors";
import { invalidateMeasureTags } from "./cache";
import { isQuoteVerified } from "./parliament-matching/matching";

/**
 * MeasureDossierLink: the human-reviewed attachment of a measure to a legislative dossier.
 *
 * No vote relation, no polarity, no model score: a reviewer says "same object" or "wider text" and
 * both quotes are re-checked here against the stored texts, never trusted from the caller. The
 * dossier evidence is the official statement of reasons and the title; the AI summary is not
 * evidence.
 */

export type CreateMeasureDossierLinkInput = {
  measureId: string;
  applicableRevisionId: string;
  dossierId: string;
  linkKind: MeasureDossierLinkKind;
  measureQuote: string;
  textQuote: string;
  rationale: string;
  searchMethod: string;
  reviewedBy: string;
  checkedAt: Date;
};

/** The text a dossier quote must be found in: the title and the official statement of reasons. */
export function dossierEvidenceText(dossier: {
  title: string;
  exposeDesMotifs: string | null;
}): string {
  return `${dossier.title}\n${dossier.exposeDesMotifs ?? ""}`;
}

/** Returns the reason a link is refused, or null. Pure, so the admin form can reuse it. */
export function checkDossierLinkEvidence(
  input: Pick<
    CreateMeasureDossierLinkInput,
    "measureQuote" | "textQuote" | "rationale" | "reviewedBy"
  >,
  revisionText: string,
  dossier: { title: string; exposeDesMotifs: string | null }
): string | null {
  if (input.reviewedBy.trim() === "") return "Le relecteur doit être renseigné";
  if (input.rationale.trim() === "") return "La justification est obligatoire";
  if (!isQuoteVerified(input.measureQuote, revisionText)) {
    return "La citation de la mesure ne se retrouve pas dans la révision applicable";
  }
  if (!isQuoteVerified(input.textQuote, dossierEvidenceText(dossier))) {
    return "La citation du texte ne se retrouve ni dans le titre ni dans l'exposé des motifs du dossier";
  }
  return null;
}

export async function createMeasureDossierLink(
  input: CreateMeasureDossierLinkInput
): Promise<MeasureDossierLink> {
  const { link, electionId } = await db.$transaction(async (tx: DbTransactionClient) => {
    await lockMeasure(tx, input.measureId);

    const revision = await tx.measureRevision.findUnique({
      where: { id: input.applicableRevisionId },
      select: {
        measureId: true,
        text: true,
        discardedAt: true,
        measure: { select: { electionId: true } },
      },
    });
    if (!revision) throw new MeasureValidationError("La révision applicable est introuvable");
    if (revision.measureId !== input.measureId) {
      throw new MeasureValidationError("La révision applicable n'appartient pas à cette mesure");
    }
    if (revision.discardedAt !== null) {
      throw new MeasureValidationError("La révision applicable a été écartée");
    }

    const dossier = await tx.legislativeDossier.findUnique({
      where: { id: input.dossierId },
      select: { title: true, exposeDesMotifs: true },
    });
    if (!dossier) throw new MeasureValidationError("Le dossier législatif est introuvable");

    const refusal = checkDossierLinkEvidence(input, revision.text, dossier);
    if (refusal) throw new MeasureValidationError(refusal);

    const existing = await tx.measureDossierLink.count({
      where: { applicableRevisionId: input.applicableRevisionId, dossierId: input.dossierId },
    });
    if (existing > 0) {
      throw new MeasureValidationError("Ce dossier est déjà relié à cette révision");
    }

    const created = await tx.measureDossierLink.create({
      data: {
        measureId: input.measureId,
        applicableRevisionId: input.applicableRevisionId,
        dossierId: input.dossierId,
        linkKind: input.linkKind,
        measureQuote: input.measureQuote,
        textQuote: input.textQuote,
        rationale: input.rationale,
        searchMethod: input.searchMethod,
        reviewedBy: input.reviewedBy,
        checkedAt: input.checkedAt,
      },
    });
    return { link: created, electionId: revision.measure.electionId };
  });

  invalidateMeasureTags(input.measureId, electionId);
  return link;
}

/** Removes a link. Takes the measure lock like the creation, so it cannot interleave with a publication. */
export async function deleteMeasureDossierLink(linkId: string): Promise<void> {
  const electionId = await db.$transaction(async (tx: DbTransactionClient) => {
    const link = await tx.measureDossierLink.findUnique({
      where: { id: linkId },
      select: { measureId: true, measure: { select: { electionId: true } } },
    });
    if (!link) throw new MeasureValidationError("Ce rapprochement n'existe plus");
    await lockMeasure(tx, link.measureId);
    await tx.measureDossierLink.delete({ where: { id: linkId } });
    return { measureId: link.measureId, electionId: link.measure.electionId };
  });
  invalidateMeasureTags(electionId.measureId, electionId.electionId);
}
