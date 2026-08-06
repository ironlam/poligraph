import { db, type DbTransactionClient } from "@/lib/db";
import type {
  Chamber,
  MeasureVoteLink,
  MeasureVoteLinkKind,
  MeasureVoteRelation,
} from "@/generated/prisma";
import { lockMeasure } from "./lock";
import { MeasureValidationError } from "./errors";
import { invalidateMeasureTags } from "./cache";
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

  const { link, electionId } = await db.$transaction(async (tx: DbTransactionClient) => {
    await lockMeasure(tx, input.measureId);

    // Constraint 1: the link's measure must be the measure of the targeted revision. The measure's
    // electionId is read here too, to bust the public subject-page cache tag after the commit.
    const revision = await tx.measureRevision.findUnique({
      where: { id: input.applicableRevisionId },
      select: { measureId: true, measure: { select: { electionId: true } } },
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

    const created = await tx.measureVoteLink.create({
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
    return { link: created, electionId: revision.measure.electionId };
  });

  // Not part of the transaction: revalidateTag is a platform call, best effort, exactly as the lot 1
  // transitions do. Without it, the public subject page keeps a stale badge until its 24h cacheLife.
  invalidateMeasureTags(input.measureId, electionId);
  return link;
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
 * The public vote relations of several measures at once, keyed by measureId.
 *
 * One query for all the links (`measureId in [...]`), then the derivation runs in memory per measure:
 * this is what a subject page with N measures needs, instead of N sequential reads. Constraint 5 (§5.8):
 * only links whose applicableRevisionId equals a measure's publishedRevisionId count, which
 * deriveVoteRelation() enforces. The select omits `rationale` and `reviewedBy`, internal editorial
 * judgment that must never reach the public surface.
 */
export async function getPublicMeasureVoteRelations(
  inputs: { measureId: string; publishedRevisionId: string }[]
): Promise<Map<string, PublicMeasureVoteRelation>> {
  const measureIds = inputs.map((i) => i.measureId);
  const links = await db.measureVoteLink.findMany({
    where: { measureId: { in: measureIds } },
    select: {
      measureId: true,
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

  const linksByMeasure = new Map<string, typeof links>();
  for (const link of links) {
    const list = linksByMeasure.get(link.measureId) ?? [];
    list.push(link);
    linksByMeasure.set(link.measureId, list);
  }

  const result = new Map<string, PublicMeasureVoteRelation>();
  for (const { measureId, publishedRevisionId } of inputs) {
    const measureLinks = linksByMeasure.get(measureId) ?? [];
    const relation = deriveVoteRelation(
      measureLinks.map((l) => ({
        linkKind: l.linkKind,
        applicableRevisionId: l.applicableRevisionId,
        position: l.relation,
      })),
      publishedRevisionId
    );
    const ref =
      measureLinks.find((l) => l.applicableRevisionId === publishedRevisionId && l.isReference) ??
      null;
    result.set(measureId, {
      relation,
      reference: ref
        ? {
            scrutinId: ref.scrutinId,
            institutionScope: ref.institutionScope,
            legislatureScope: ref.legislatureScope,
            checkedAt: ref.checkedAt,
          }
        : null,
    });
  }

  return result;
}

/**
 * The public relation of a single measure to recorded votes. Delegates to the batched read so the
 * derivation and the public projection have exactly one definition.
 */
export async function getPublicMeasureVoteRelation(
  measureId: string,
  publishedRevisionId: string
): Promise<PublicMeasureVoteRelation> {
  const relations = await getPublicMeasureVoteRelations([{ measureId, publishedRevisionId }]);
  // Always present: getPublicMeasureVoteRelations sets one entry per input.
  return relations.get(measureId)!;
}
