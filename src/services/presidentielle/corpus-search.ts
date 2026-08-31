import type {
  CandidacyStatus,
  MeasurePrecision,
  MeasureSourceKind,
  ThemeCategory,
} from "@/generated/prisma";
import { db } from "@/lib/db";
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
import {
  searchPresidentialPage,
  type PresidentialSearchStrategy,
} from "@/services/presidentielle/hybrid-search";

const MAX_RESULTS = 50;

// This service is shared by the public server boundary and the read-only evaluation CLI. Keeping
// one implementation avoids a second search path drifting from what the benchmark measures.

export type PresidentialCandidacySearchResult = {
  type: "candidacy";
  id: string;
  name: string;
  slug: string;
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
  candidateSlug: string | null;
  theme: ThemeCategory;
  precision: MeasurePrecision | null;
  sourceLabel: MeasureSourceKind | null;
  sourceUrl: string | null;
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
  searchStrategy?: "lexical" | "semantic" | "hybrid" | "lexical-fallback";
  semanticMaxSimilarity?: number | null;
};

export type PresidentialCorpusSearchOptions = {
  subtopicSlug?: string;
  page?: number;
  strategy?: PresidentialSearchStrategy;
};

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 12;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_RESULTS);
}

function normalizeCandidateText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .toLocaleLowerCase("fr")
    .trim()
    .replace(/\s+/g, " ");
}

/** Pins an explicitly named candidacy without asking the semantic model to recognize a person. */
export function candidateNameIsMentioned(
  query: string,
  candidateName: string,
  allCandidateNames: string[] = [candidateName]
): boolean {
  const normalizedQuery = ` ${normalizeCandidateText(query)} `;
  const fullName = normalizeCandidateText(candidateName);
  if (normalizedQuery.includes(` ${fullName} `)) return true;

  const nameParts = candidateName.trim().split(/\s+/).filter(Boolean);
  const surname = normalizeCandidateText(nameParts.slice(1).join(" "));
  if (surname.length < 4 || !normalizedQuery.includes(` ${surname} `)) return false;

  return !allCandidateNames.some(
    (otherName) =>
      otherName !== candidateName &&
      ` ${normalizeCandidateText(otherName)} `.includes(` ${surname} `)
  );
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
    // The data module carries Next's `server-only` guard. Load it only for the web-only subtopic
    // path so the lexical evaluation CLI can exercise the same search implementation.
    const { listPublicPresidentialMeasures } = await import("@/lib/data/measures");
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
      candidateSlug: measure.candidacy.politicianSlug ?? null,
      theme: measure.theme.code,
      precision: measure.precision.code,
      sourceLabel: measure.sources[0]?.sourceKind ?? null,
      sourceUrl: measure.sources[0]?.url ?? null,
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

  const publicCandidaciesPromise = db.candidacy.findMany({
    where: {
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
  });
  const lexicalQuery = toPresidentialLexicalQuery(query);
  let page = await searchPresidentialPage({
    query,
    lexicalQuery,
    electionId: election.id,
    limit: clampLimit(limit),
    strategy: options.strategy ?? "lexical",
  });
  // A sentence may still contain a verb absent from every formulation. If it names one known
  // theme, fall back to that controlled label. This broadens only within the public taxonomy and
  // keeps the lexical engine available while the semantic index is being built.
  const [singleMatchingTheme] = matchingThemes;
  if (
    options.strategy !== "semantic" &&
    page.total === 0 &&
    matchingThemes.length === 1 &&
    singleMatchingTheme !== undefined
  ) {
    const fallback = await searchPublicPage(THEME_CATEGORY_LABELS[singleMatchingTheme], {
      electionId: election.id,
      limit: clampLimit(limit),
    });
    page = { ...fallback, strategy: page.strategy };
  }
  const indexedCandidacyIds = page.hits
    .filter((hit) => hit.entityType === "CANDIDACY")
    .map((hit) => hit.entityId);
  const measureIds = page.hits
    .filter((hit) => hit.entityType === "MEASURE")
    .map((hit) => hit.entityId);

  const [candidacyRows, measureRows] = await Promise.all([
    publicCandidaciesPromise,
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
                  select: { sourceKind: true, url: true },
                },
              },
            },
            candidacy: {
              select: {
                candidateName: true,
                politician: { select: { slug: true } },
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
        slug: row.politician.slug,
        url: `/elections/${election.slug}/candidats/${row.politician.slug}`,
        photoUrl: row.politician.photoUrl,
        blobPhotoUrl: row.politician.blobPhotoUrl,
        status: row.status,
        party: row.party?.shortName ?? row.party?.name ?? null,
      };
      return [[row.id, result] as const];
    })
  );
  const candidateNames = candidacyRows.map((candidate) => candidate.candidateName);
  const explicitCandidacyIds = candidacyRows
    .filter((row) => candidateNameIsMentioned(query, row.candidateName, candidateNames))
    .map((row) => row.id);
  const measuresById = new Map(
    measureRows.flatMap((row) => {
      if (row.publishedRevision === null || row.candidacy === null) return [];
      const result: PresidentialMeasureSearchResult = {
        type: "measure",
        id: row.id,
        text: row.publishedRevision.text,
        url: `/elections/${election.slug}/mesures/${row.slug}`,
        candidateName: row.candidacy.candidateName,
        candidateSlug: row.candidacy.politician?.slug ?? null,
        theme: row.theme,
        precision: row.publishedRevision.precision,
        sourceLabel: row.publishedRevision.sources[0]?.sourceKind ?? null,
        sourceUrl: row.publishedRevision.sources[0]?.url ?? null,
      };
      return [[row.id, result] as const];
    })
  );

  const candidacies: PresidentialCandidacySearchResult[] = [];
  const measures: PresidentialMeasureSearchResult[] = [];
  for (const candidacyId of explicitCandidacyIds) {
    const candidacy = candidaciesById.get(candidacyId);
    if (candidacy) candidacies.push(candidacy);
  }
  for (const hit of page.hits) {
    if (hit.entityType === "CANDIDACY") {
      const candidacy = candidaciesById.get(hit.entityId);
      if (candidacy && !explicitCandidacyIds.includes(candidacy.id)) candidacies.push(candidacy);
    } else if (hit.entityType === "MEASURE") {
      const measure = measuresById.get(hit.entityId);
      if (measure) measures.push(measure);
    }
  }

  const hydratedIndexedCandidacies = indexedCandidacyIds.filter((id) => candidaciesById.has(id));
  const discardedFromPage = page.hits.length - hydratedIndexedCandidacies.length - measures.length;
  return {
    query,
    total:
      subjects.length +
      Math.max(0, page.total - discardedFromPage) +
      explicitCandidacyIds.filter((id) => !indexedCandidacyIds.includes(id)).length,
    subjects,
    candidacies,
    measures,
    searchStrategy: page.strategy,
    semanticMaxSimilarity: page.semanticMaxSimilarity,
  };
}
