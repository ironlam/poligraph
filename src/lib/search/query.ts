import { Prisma, type SearchEntityType } from "@/generated/prisma";
import { db } from "@/lib/db";

export type SearchHit = {
  entityType: SearchEntityType;
  entityId: string;
  title: string;
  url: string;
};

const MAX_QUERY_LENGTH = 200;
const DEFAULT_LIMIT = 20;
// Below three characters a trigram index degrades to a sequential scan, and a
// one-letter substring matches almost everything.
const MIN_TRIGRAM_TERM_LENGTH = 3;

/** Trim, collapse runs of whitespace, and cap the length. Returns "" when there is nothing to search. */
function normalize(rawQuery: string): string {
  return rawQuery.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);
}

function key(hit: SearchHit): string {
  return `${hit.entityType}:${hit.entityId}`;
}

/** Exact words through the tsvector index. No stemming, so no loyer/loi false positive. */
async function searchExact(query: string, limit: number): Promise<SearchHit[]> {
  return db.$queryRaw<SearchHit[]>`
    SELECT "entityType", "entityId", title, url
    FROM "SearchDocument"
    WHERE visibility = 'PUBLIC'::"SearchVisibility"
      AND "searchVector" @@ plainto_tsquery('simple', unaccent(${query}))
    ORDER BY ts_rank("searchVector", plainto_tsquery('simple', unaccent(${query}))) DESC, title ASC
    LIMIT ${limit}
  `;
}

/**
 * Morphological variants and typos, through the trigram column.
 *
 * Term by term and not on the whole query: "loyer zk1x2" as a single substring never
 * matches "loyers zk1x2", because the plural breaks the run. Each term has to be found
 * on its own, which is also what lets the trigram index serve each condition.
 */
async function searchFuzzy(query: string, limit: number): Promise<SearchHit[]> {
  const terms = query.split(" ").filter((term) => term.length >= MIN_TRIGRAM_TERM_LENGTH);
  if (terms.length === 0) return [];

  const conditions = Prisma.join(
    terms.map((term) => Prisma.sql`"searchText" LIKE '%' || lower(unaccent(${term})) || '%'`),
    " AND "
  );

  return db.$queryRaw<SearchHit[]>`
    SELECT "entityType", "entityId", title, url
    FROM "SearchDocument"
    WHERE visibility = 'PUBLIC'::"SearchVisibility"
      AND ${conditions}
    ORDER BY title ASC
    LIMIT ${limit}
  `;
}

/**
 * Public lexical search. Both passes always run and their results are merged, exact
 * matches first, deduplicated on (entityType, entityId), limit applied after the merge.
 *
 * `visibility = 'PUBLIC'` is part of both queries. It is not a convenience filter:
 * without it the index bypasses the publication filter of the data layer.
 */
export async function searchPublic(
  rawQuery: string,
  limit: number = DEFAULT_LIMIT
): Promise<SearchHit[]> {
  const query = normalize(rawQuery);
  if (query === "") return [];

  const [exact, fuzzy] = await Promise.all([searchExact(query, limit), searchFuzzy(query, limit)]);

  const seen = new Set(exact.map(key));
  const merged = [...exact, ...fuzzy.filter((hit) => !seen.has(key(hit)))];

  return merged.slice(0, limit);
}
