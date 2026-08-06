import { db, type DbTransactionClient } from "@/lib/db";
import type {
  Chamber,
  MeasureVoteLink,
  MeasureVoteLinkKind,
  MeasureVoteRelation,
} from "@/generated/prisma";
import { lockMeasure } from "./lock";
import { MeasureValidationError } from "./errors";
import { deriveVoteRelation, type VoteRelation } from "./vote-relation";

/**
 * MeasureVoteLink: the manual attachment of a measure to a scrutin (spec §5.8).
 *
 * Written only from admin, never by a script, never by an automatic engine or confidence score
 * (arbitrated 2026-08-06). The five write constraints of §5.8 are checked in the transaction, not only
 * by the audit, because each of them, if skipped, lets a position state be produced from nothing.
 */

export type CreateMeasureVoteLinkInput = {
  measureId: string;
  applicableRevisionId: string;
  scrutinId?: string | null;
  linkKind: MeasureVoteLinkKind;
  /** Reviewer-recorded relation to the measure; only on a SAME_OBJECT link tied to a scrutin. */
  relation?: MeasureVoteRelation | null;
  isReference?: boolean;
  rationale: string;
  checkedAt: Date;
  institutionScope: Chamber[];
  legislatureScope: string[];
  searchMethod: string;
  reviewedBy: string;
};

export async function createMeasureVoteLink(
  input: CreateMeasureVoteLinkInput
): Promise<MeasureVoteLink> {
  const scrutinId = input.scrutinId ?? null;
  const relation = input.relation ?? null;
  const isReference = input.isReference ?? false;
  const isSameObjectVote = input.linkKind === "SAME_OBJECT" && scrutinId !== null;

  return db.$transaction(async (tx: DbTransactionClient) => {
    await lockMeasure(tx, input.measureId);

    // Constraint 1: the link's measure must be the measure of the targeted revision.
    const revision = await tx.measureRevision.findUnique({
      where: { id: input.applicableRevisionId },
      select: { measureId: true },
    });
    if (!revision) throw new MeasureValidationError("La révision applicable est introuvable");
    if (revision.measureId !== input.measureId) {
      throw new MeasureValidationError("La révision applicable n'appartient pas à cette mesure");
    }

    // Constraint 3: NO_VOTE_IDENTIFIED is a constatation, not an attachment.
    if (input.linkKind === "NO_VOTE_IDENTIFIED" && scrutinId !== null) {
      throw new MeasureValidationError("Un lien « aucun vote identifié » ne porte pas de scrutin");
    }

    // Relation consistency: only a SAME_OBJECT link tied to a scrutin carries a relation, and it must.
    if (isSameObjectVote && relation === null) {
      throw new MeasureValidationError(
        "Un lien sur le même objet doit porter la relation du candidat à la mesure"
      );
    }
    if (!isSameObjectVote && relation !== null) {
      throw new MeasureValidationError(
        "Seul un lien sur le même objet rattaché à un scrutin porte une relation"
      );
    }

    // Constraint 2: a reference must be a SAME_OBJECT link tied to a scrutin.
    if (isReference && !isSameObjectVote) {
      throw new MeasureValidationError(
        "Seul un lien sur le même objet rattaché à un scrutin peut être la référence"
      );
    }

    // Constraint 4: at most one reference per applicable revision. Partial constraint Prisma cannot
    // declare; the row lock above serializes concurrent attempts, so the count is authoritative here.
    if (isReference) {
      const existing = await tx.measureVoteLink.count({
        where: { applicableRevisionId: input.applicableRevisionId, isReference: true },
      });
      if (existing > 0) {
        throw new MeasureValidationError(
          "Une référence existe déjà pour cette révision applicable"
        );
      }
    }

    return tx.measureVoteLink.create({
      data: {
        measureId: input.measureId,
        applicableRevisionId: input.applicableRevisionId,
        scrutinId,
        linkKind: input.linkKind,
        relation,
        isReference,
        rationale: input.rationale,
        checkedAt: input.checkedAt,
        institutionScope: input.institutionScope,
        legislatureScope: input.legislatureScope,
        searchMethod: input.searchMethod,
        reviewedBy: input.reviewedBy,
      },
    });
  });
}

/** The sourced basis of the reference link, safe to show publicly. Never carries rationale/reviewedBy. */
export type PublicVoteReference = {
  scrutinId: string | null;
  institutionScope: Chamber[];
  legislatureScope: string[];
  checkedAt: Date;
};

export type PublicMeasureVoteRelation = {
  relation: VoteRelation;
  reference: PublicVoteReference | null;
};

/**
 * The public relation of a measure to recorded votes, and the sourced basis of its reference.
 *
 * Constraint 5 (§5.8): the badge only uses links whose applicableRevisionId equals publishedRevisionId,
 * which deriveVoteRelation() enforces. The select deliberately omits `rationale` and `reviewedBy`: they
 * are internal editorial judgment and must never reach the public surface.
 */
export async function getPublicMeasureVoteRelation(
  measureId: string,
  publishedRevisionId: string
): Promise<PublicMeasureVoteRelation> {
  const links = await db.measureVoteLink.findMany({
    where: { measureId },
    select: {
      linkKind: true,
      applicableRevisionId: true,
      relation: true,
      isReference: true,
      scrutinId: true,
      institutionScope: true,
      legislatureScope: true,
      checkedAt: true,
    },
  });

  const relation = deriveVoteRelation(
    links.map((l) => ({
      linkKind: l.linkKind,
      applicableRevisionId: l.applicableRevisionId,
      position: l.relation,
    })),
    publishedRevisionId
  );

  const ref =
    links.find((l) => l.applicableRevisionId === publishedRevisionId && l.isReference) ?? null;

  return {
    relation,
    reference: ref
      ? {
          scrutinId: ref.scrutinId,
          institutionScope: ref.institutionScope,
          legislatureScope: ref.legislatureScope,
          checkedAt: ref.checkedAt,
        }
      : null,
  };
}
