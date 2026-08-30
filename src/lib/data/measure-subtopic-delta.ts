import { Prisma, type ThemeCategory } from "@/generated/prisma";
import { db } from "@/lib/db";
import type { DeltaMeasureInput } from "@/lib/measures/subtopic-delta-selection";
import { PUBLIC_PRESIDENTIAL_MEASURE_WHERE } from "@/lib/presidentielle/publication";

type ElectionReference = { id: string; slug: string };

async function findSearchDocumentMeasureIds(input: {
  electionId: string;
  measureIds: string[];
  terms: string[];
}): Promise<Set<string>> {
  if (input.measureIds.length === 0 || input.terms.length === 0) return new Set();
  const conditions = Prisma.join(
    input.terms.map(
      (term) => Prisma.sql`"searchVector" @@ plainto_tsquery('simple', unaccent(${term}))`
    ),
    " OR "
  );
  const rows = await db.$queryRaw<Array<{ entityId: string }>>(Prisma.sql`
    SELECT "entityId"
    FROM "SearchDocument"
    WHERE visibility = 'PUBLIC'::"SearchVisibility"
      AND "entityType" = 'MEASURE'::"SearchEntityType"
      AND "electionId" = ${input.electionId}
      AND "entityId" IN (${Prisma.join(input.measureIds)})
      AND (${conditions})
  `);
  return new Set(rows.map((row) => row.entityId));
}

export async function getSubtopicDeltaCorpusPage(input: {
  electionSlug: string;
  theme: ThemeCategory;
  searchTerms: string[];
  limit: number;
  after?: string;
}): Promise<{
  election: ElectionReference;
  totalEligibleMeasures: number;
  measures: DeltaMeasureInput[];
  searchDocumentMeasureIds: Set<string>;
  nextAfter: string | null;
}> {
  const election = await db.election.findUnique({
    where: { slug: input.electionSlug },
    select: { id: true, slug: true },
  });
  if (!election) throw new Error(`Élection inconnue : ${input.electionSlug}`);

  const where = {
    ...PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
    electionId: election.id,
    theme: input.theme,
  } as const;
  const [totalEligibleMeasures, rows] = await Promise.all([
    db.measure.count({ where }),
    db.measure.findMany({
      where,
      select: {
        id: true,
        theme: true,
        politician: { select: { fullName: true } },
        publishedRevision: {
          select: {
            id: true,
            text: true,
            details: true,
            updatedAt: true,
            subtopics: {
              select: { status: true, subtopic: { select: { slug: true } } },
            },
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: input.limit,
      ...(input.after ? { cursor: { id: input.after }, skip: 1 } : {}),
    }),
  ]);
  const measures: DeltaMeasureInput[] = rows.flatMap((row) => {
    if (!row.publishedRevision) return [];
    return [
      {
        measureId: row.id,
        revisionId: row.publishedRevision.id,
        sourceUpdatedAt: row.publishedRevision.updatedAt.toISOString(),
        candidateName: row.politician.fullName,
        theme: row.theme,
        text: row.publishedRevision.text,
        details: row.publishedRevision.details,
        existingAssignments: row.publishedRevision.subtopics.map((assignment) => ({
          slug: assignment.subtopic.slug,
          status: assignment.status,
        })),
      },
    ];
  });
  const searchDocumentMeasureIds = await findSearchDocumentMeasureIds({
    electionId: election.id,
    measureIds: measures.map((measure) => measure.measureId),
    terms: [...new Set(input.searchTerms)],
  });

  return {
    election,
    totalEligibleMeasures,
    measures,
    searchDocumentMeasureIds,
    nextAfter: rows.length === input.limit ? (rows.at(-1)?.id ?? null) : null,
  };
}

export async function getSubtopicDeltaApplySnapshot(input: {
  electionSlug: string;
  electionId: string;
  theme: ThemeCategory;
  measureIds: string[];
}): Promise<{
  electionMatches: boolean;
  measures: Array<{
    id: string;
    publishedRevision: { id: string; text: string; details: string | null; updatedAt: Date } | null;
  }>;
}> {
  const election = await db.election.findUnique({
    where: { slug: input.electionSlug },
    select: { id: true },
  });
  if (!election || election.id !== input.electionId) {
    return { electionMatches: false, measures: [] };
  }
  const measures = await db.measure.findMany({
    where: {
      id: { in: input.measureIds },
      electionId: input.electionId,
      theme: input.theme,
      ...PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
    },
    select: {
      id: true,
      publishedRevision: {
        select: { id: true, text: true, details: true, updatedAt: true },
      },
    },
  });
  return { electionMatches: true, measures };
}
