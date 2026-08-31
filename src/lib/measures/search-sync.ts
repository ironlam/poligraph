import { Prisma } from "@/generated/prisma";
import type { DbTransactionClient } from "@/lib/db";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import {
  deleteSearchDocument,
  deleteSearchDocuments,
  upsertSearchDocument,
  upsertSearchDocuments,
  type SearchDocumentInput,
} from "@/lib/search/documents";
import { PUBLIC_PRESIDENTIAL_MEASURE_WHERE } from "@/lib/presidentielle/publication";

const MAX_TITLE_LENGTH = 200;

const SEARCH_MEASURE_SELECT = {
  id: true,
  slug: true,
  electionId: true,
  election: { select: { slug: true } },
  theme: true,
  candidacy: {
    select: {
      candidateName: true,
      party: { select: { name: true, shortName: true } },
    },
  },
  publicationStatus: true,
  publishedRevisionId: true,
  publishedRevision: {
    select: {
      id: true,
      text: true,
      details: true,
      updatedAt: true,
      subtopics: {
        where: { status: "APPROVED" },
        select: { subtopic: { select: { label: true, aliases: true } } },
      },
      readerGuideMentions: {
        where: {
          status: "APPROVED",
          guide: {
            is: {
              active: true,
              publicationStatus: "PUBLISHED",
              reviewedAt: { not: null },
            },
          },
        },
        select: {
          guide: { select: { label: true, aliases: true, definition: true } },
        },
      },
    },
  },
  latestRevision: {
    select: {
      id: true,
      text: true,
      details: true,
      updatedAt: true,
      subtopics: {
        where: { status: "APPROVED" },
        select: { subtopic: { select: { label: true, aliases: true } } },
      },
      readerGuideMentions: {
        where: {
          status: "APPROVED",
          guide: {
            is: {
              active: true,
              publicationStatus: "PUBLISHED",
              reviewedAt: { not: null },
            },
          },
        },
        select: {
          guide: { select: { label: true, aliases: true, definition: true } },
        },
      },
    },
  },
} satisfies Prisma.MeasureSelect;

type SearchableMeasure = Prisma.MeasureGetPayload<{ select: typeof SEARCH_MEASURE_SELECT }>;

function buildSearchDocument(
  measure: SearchableMeasure,
  isPublic: boolean
): SearchDocumentInput | null {
  const reference = isPublic ? measure.publishedRevision : measure.latestRevision;
  if (!reference) return null;

  const partyLabel = measure.candidacy?.party?.shortName ?? measure.candidacy?.party?.name;
  const subtopicTerms = reference.subtopics.flatMap(({ subtopic }) => [
    subtopic.label,
    ...subtopic.aliases,
  ]);
  const readerGuideTerms = reference.readerGuideMentions.flatMap(({ guide }) =>
    guide ? [guide.label, ...guide.aliases, guide.definition] : []
  );
  const contextualBody = [
    reference.text,
    reference.details,
    measure.candidacy?.candidateName,
    partyLabel,
    THEME_CATEGORY_LABELS[measure.theme],
    ...subtopicTerms,
    ...readerGuideTerms,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    entityType: "MEASURE",
    entityId: measure.id,
    electionId: measure.electionId,
    title: reference.text.slice(0, MAX_TITLE_LENGTH),
    body: contextualBody,
    url: `/elections/${measure.election.slug}/mesures/${measure.slug}`,
    visibility: isPublic ? "PUBLIC" : "ADMIN_ONLY",
    sourceRevisionId: reference.id,
    sourceUpdatedAt: reference.updatedAt,
  };
}

/**
 * Derives the SearchDocument from the measure's pointers, inside the caller's transaction.
 *
 * ONE function for the whole visibility policy of spec 7.2, and that is the point. The
 * first version of this plan only indexed at publication and only flipped visibility at
 * depublication, which broke in three places:
 *
 *  - a measure created in draft had no document at all, while the policy says it must
 *    have one in ADMIN_ONLY;
 *  - a new draft on a never-published measure left the document on the old revision;
 *  - a depublication with a draft in flight left an ADMIN_ONLY document aligned on the
 *    former published revision, while the staleness rule for ADMIN_ONLY compares against
 *    latestRevisionId. The audit reported it stale, and it was right.
 *
 * Deriving instead of ordering each transition to do its own upsert means the policy has
 * a single implementation, and every transition just calls this at the end.
 */
export async function syncSearchDocument(
  tx: DbTransactionClient,
  measureId: string
): Promise<void> {
  const measure = await tx.measure.findUniqueOrThrow({
    where: { id: measureId },
    select: SEARCH_MEASURE_SELECT,
  });

  // Re-query through the shared public authority. PublicationStatus alone is insufficient: a
  // withdrawn measure, an invalid published revision or a closed carrier fiche must fail closed.
  const publicMeasure = await tx.measure.findFirst({
    where: { id: measureId, ...PUBLIC_PRESIDENTIAL_MEASURE_WHERE },
    select: { id: true },
  });
  const isPublic = publicMeasure !== null;
  const document = buildSearchDocument(measure, isPublic);

  // Nothing left to represent: no published revision and no active draft. Happens when
  // the only draft of a never-published measure is discarded. Removing the row is the
  // coherent answer, and it is why the audit only demands a document for measures that
  // do have a reference revision.
  if (!document) {
    await deleteSearchDocument(tx, "MEASURE", measureId);
    return;
  }

  await upsertSearchDocument(tx, document);
}

/** Rebuilds many measure documents with two reads and bounded bulk writes. */
export async function syncSearchDocuments(
  tx: DbTransactionClient,
  measureIds: string[]
): Promise<void> {
  if (measureIds.length === 0) return;

  const [measures, publicMeasures] = await Promise.all([
    tx.measure.findMany({
      where: { id: { in: measureIds } },
      select: SEARCH_MEASURE_SELECT,
      orderBy: { id: "asc" },
    }),
    tx.measure.findMany({
      where: { id: { in: measureIds }, ...PUBLIC_PRESIDENTIAL_MEASURE_WHERE },
      select: { id: true },
    }),
  ]);
  const publicIds = new Set(publicMeasures.map(({ id }) => id));
  const documents: SearchDocumentInput[] = [];
  const deletions: string[] = [];

  for (const measure of measures) {
    const document = buildSearchDocument(measure, publicIds.has(measure.id));
    if (document) documents.push(document);
    else deletions.push(measure.id);
  }

  await deleteSearchDocuments(tx, "MEASURE", deletions);
  await upsertSearchDocuments(tx, documents);
}
