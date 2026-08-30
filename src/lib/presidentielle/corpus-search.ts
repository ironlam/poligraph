import "server-only";

import type {
  CandidacyStatus,
  MeasurePrecision,
  MeasureSourceKind,
  ThemeCategory,
} from "@/generated/prisma";
import { db } from "@/lib/db";
import { listPublicPresidentialMeasures } from "@/lib/data/measures";
import { searchPublicPage } from "@/lib/search/query";
import { toPresidentialLexicalQuery } from "@/lib/presidentielle/natural-query";
import {
  PUBLIC_HUB_CANDIDACY_WHERE,
  PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
} from "@/lib/presidentielle/publication";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import {
  findMatchingThemes,
  findThemesMentionedInQuery,
  themeToSlug,
} from "@/lib/presidentielle/themes";

const MAX_RESULTS = 50;

export type PresidentialCandidacySearchResult = {
  type: "candidacy";
  id: string;
  name: string;
  url: string;
  photoUrl: string | null;
  blobPhotoUrl: string | null;
  status: CandidacyStatus;
  party: string | null;
};

export type PresidentialMeasureSearchResult = {
  type: "measure";
  id: string;
  text: string;
  url: string;
  candidateName: string;
  theme: ThemeCategory;
  precision: MeasurePrecision | null;
  sourceLabel: MeasureSourceKind | null;
};

export type PresidentialSubjectSearchResult = {
  type: "subject";
  theme: ThemeCategory;
  label: string;
  url: string;
};

export type PresidentialCorpusSearchResult = {
  query: string;
  total: number;
  subjects: PresidentialSubjectSearchResult[];
  candidacies: PresidentialCandidacySearchResult[];
  measures: PresidentialMeasureSearchResult[];
  filter?: { type: "subtopic"; slug: string; label: string };
  page?: number;
  totalPages?: number;
};

export type PresidentialCorpusSearchOptions = {
  subtopicSlug?: string;
  page?: number;
};

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 12;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_RESULTS);
}

/**
 * Search the public corpus of one election, then hydrate through the public read
 * authorities. The second step is deliberately defensive: a stale index row can
 * reduce the result count, but it can never expose a closed candidacy or measure.
 */
export async function searchPresidentialCorpus(
  electionSlug: string,
  rawQuery: string,
  limit = 12,
  options: PresidentialCorpusSearchOptions = {}
): Promise<PresidentialCorpusSearchResult | null> {
  const query = rawQuery.trim().slice(0, 200);
  const election = await db.election.findUnique({
    where: { slug: electionSlug },
    select: { id: true, slug: true },
  });
  if (election === null) return null;

  const subtopicSlug = options.subtopicSlug?.trim().slice(0, 100);
  if (subtopicSlug) {
    const subtopic = await db.measureSubtopic.findUnique({
      where: { slug: subtopicSlug },
      select: { slug: true, label: true, active: true },
    });
    if (subtopic === null || !subtopic.active) {
      return { query: "", total: 0, subjects: [], candidacies: [], measures: [] };
    }

    let page = Math.min(Math.max(Math.trunc(options.page ?? 1), 1), 1_000);
    const pageSize = clampLimit(limit);
    let measurePage = await listPublicPresidentialMeasures({
      electionId: election.id,
      electionSlug: election.slug,
      subtopicSlug: subtopic.slug,
      page,
      limit: pageSize,
    });
    const totalPages = Math.max(1, Math.ceil(measurePage.total / pageSize));
    if (page > totalPages) {
      page = totalPages;
      measurePage = await listPublicPresidentialMeasures({
        electionId: election.id,
        electionSlug: election.slug,
        subtopicSlug: subtopic.slug,
        page,
        limit: pageSize,
      });
    }
    const measures: PresidentialMeasureSearchResult[] = measurePage.data.map((measure) => ({
      type: "measure",
      id: measure.measureId,
      text: measure.text,
      url: measure.publicUrl,
      candidateName: measure.candidacy.candidateName,
      theme: measure.theme.code,
      precision: measure.precision.code,
      sourceLabel: measure.sources[0]?.sourceKind ?? null,
    }));

    return {
      query: subtopic.label,
      total: measurePage.total,
      subjects: [],
      candidacies: [],
      measures,
      filter: { type: "subtopic", slug: subtopic.slug, label: subtopic.label },
      page,
      totalPages,
    };
  }

  if (query.length < 2) {
    return { query, total: 0, subjects: [], candidacies: [], measures: [] };
  }

  const matchingThemes = [
    ...new Set([...findMatchingThemes(query), ...findThemesMentionedInQuery(query)]),
  ];
  const subjects: PresidentialSubjectSearchResult[] = matchingThemes.map((theme) => ({
    type: "subject",
    theme,
    label: THEME_CATEGORY_LABELS[theme],
    url: `/elections/${election.slug}/themes/${themeToSlug(theme)}`,
  }));

  const lexicalQuery = toPresidentialLexicalQuery(query);
  let page = await searchPublicPage(lexicalQuery, {
    electionId: election.id,
    limit: clampLimit(limit),
  });
  // A sentence may still contain a verb absent from every formulation. If it names one known
  // theme, fall back to that controlled label. This broadens only within the public taxonomy and
  // keeps the lexical engine available while the semantic index is being built.
  const [singleMatchingTheme] = matchingThemes;
  if (page.total === 0 && matchingThemes.length === 1 && singleMatchingTheme !== undefined) {
    page = await searchPublicPage(THEME_CATEGORY_LABELS[singleMatchingTheme], {
      electionId: election.id,
      limit: clampLimit(limit),
    });
  }
  const candidacyIds = page.hits
    .filter((hit) => hit.entityType === "CANDIDACY")
    .map((hit) => hit.entityId);
  const measureIds = page.hits
    .filter((hit) => hit.entityType === "MEASURE")
    .map((hit) => hit.entityId);

  const [candidacyRows, measureRows] = await Promise.all([
    candidacyIds.length === 0
      ? []
      : db.candidacy.findMany({
          where: {
            id: { in: candidacyIds },
            electionId: election.id,
            ...PUBLIC_HUB_CANDIDACY_WHERE,
          },
          select: {
            id: true,
            candidateName: true,
            status: true,
            politician: {
              select: { slug: true, photoUrl: true, blobPhotoUrl: true },
            },
            party: { select: { name: true, shortName: true } },
          },
        }),
    measureIds.length === 0
      ? []
      : db.measure.findMany({
          where: {
            id: { in: measureIds },
            electionId: election.id,
            ...PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
          },
          select: {
            id: true,
            slug: true,
            theme: true,
            publishedRevision: {
              select: {
                text: true,
                precision: true,
                sources: {
                  orderBy: { publishedAt: "asc" },
                  take: 1,
                  select: { sourceKind: true },
                },
              },
            },
            candidacy: {
              select: {
                candidateName: true,
              },
            },
          },
        }),
  ]);

  const candidaciesById = new Map(
    candidacyRows.flatMap((row) => {
      if (row.status === null || row.politician === null) return [];
      const result: PresidentialCandidacySearchResult = {
        type: "candidacy",
        id: row.id,
        name: row.candidateName,
        url: `/elections/${election.slug}/candidats/${row.politician.slug}`,
        photoUrl: row.politician.photoUrl,
        blobPhotoUrl: row.politician.blobPhotoUrl,
        status: row.status,
        party: row.party?.shortName ?? row.party?.name ?? null,
      };
      return [[row.id, result] as const];
    })
  );
  const measuresById = new Map(
    measureRows.flatMap((row) => {
      if (row.publishedRevision === null || row.candidacy === null) return [];
      const result: PresidentialMeasureSearchResult = {
        type: "measure",
        id: row.id,
        text: row.publishedRevision.text,
        url: `/elections/${election.slug}/mesures/${row.slug}`,
        candidateName: row.candidacy.candidateName,
        theme: row.theme,
        precision: row.publishedRevision.precision,
        sourceLabel: row.publishedRevision.sources[0]?.sourceKind ?? null,
      };
      return [[row.id, result] as const];
    })
  );

  const candidacies: PresidentialCandidacySearchResult[] = [];
  const measures: PresidentialMeasureSearchResult[] = [];
  for (const hit of page.hits) {
    if (hit.entityType === "CANDIDACY") {
      const candidacy = candidaciesById.get(hit.entityId);
      if (candidacy) candidacies.push(candidacy);
    } else if (hit.entityType === "MEASURE") {
      const measure = measuresById.get(hit.entityId);
      if (measure) measures.push(measure);
    }
  }

  const discardedFromPage = page.hits.length - candidacies.length - measures.length;
  return {
    query,
    total: subjects.length + Math.max(0, page.total - discardedFromPage),
    subjects,
    candidacies,
    measures,
  };
}
