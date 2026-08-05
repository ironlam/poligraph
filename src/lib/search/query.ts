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
const MIN_LIMIT = 1;
// A search box is not a bulk export, and PostgreSQL raises on a negative LIMIT, so an
// unbounded caller value turns a mistake into a 500.
const MAX_LIMIT = 50;

/**
 * Fold a raw query into terms that are safe to match on.
 *
 * Everything that is not a letter, a digit or a space is dropped. Two reasons, and the
 * first one is a defect this replaced: with a substring pass, "%%%" built a LIKE pattern
 * that matched every public document and "_" matched any character. Parameter binding
 * protects against injection, not against the pattern semantics of the operator. The
 * second reason is that spec 7.2 asks for punctuation normalization, so "loyers," and
 * "loyers" have to reach the same terms.
 *
 * Accents survive here on purpose: unaccent runs in SQL, on both sides.
 */
function normalize(rawQuery: string): string {
  return rawQuery
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_QUERY_LENGTH)
    .trim();
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), MIN_LIMIT), MAX_LIMIT);
}

/**
 * The controlled variants of a term: itself, plus its -s plural. One direction only.
 *
 * Enumerated and not inferred, which is the whole point. No lexical rule separates the
 * recall we want from the false positive we refuse: "loyer" is a prefix of "loyers" and
 * "retrait" is a prefix of "retraite", so a substring match, a prefix tsquery and a
 * trigram similarity threshold all treat the two pairs the same way. Adding an s keeps
 * "retraite" out of a search for "retrait", because "retraite" is not "retrait" plus an s.
 *
 * Stripping a trailing s would NOT be the mirror image of that, it would invent French:
 * fois -> foi, cours -> cour, fonds -> fond, pays -> pay, plus -> plu. The first two are
 * ordinary words of this corpus, and "cours" returning the Cour des comptes is the very
 * class of false positive the simple dictionary was chosen to avoid.
 *
 * The accepted cost: a query already written in the plural does not yet reach a document
 * written in the singular. Making it symmetric needs a morphological lexicon with its
 * exceptions, not a suffix rule, so it belongs with lot 7's approximate search.
 *
 * Also not covered: the -al/-aux plurals, and typos. A transposition such as "retratite"
 * shares no lexeme with "retraite" and no amount of suffix work finds it.
 */
function variantsOf(term: string): string[] {
  if (term.endsWith("s")) return [term];
  return [term, `${term}s`];
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
 * Plural recall, term by term.
 *
 * Term by term and not on the whole query: each term has to be found on its own, which
 * is what makes "loyer <token>" match a document reading "loyers <token>".
 *
 * Each variant goes through plainto_tsquery rather than to_tsquery: the latter parses an
 * operator syntax and raises on input it does not like, which is not something a public
 * search box may do. The `||` operator ORs the resulting queries.
 */
async function searchVariants(query: string, limit: number): Promise<SearchHit[]> {
  const terms = query.split(" ").filter((term) => term.length > 0);
  if (terms.length === 0) return [];

  const conditions = Prisma.join(
    terms.map((term) => {
      const alternatives = Prisma.join(
        variantsOf(term).map(
          (variant) => Prisma.sql`plainto_tsquery('simple', unaccent(${variant}))`
        ),
        " || "
      );
      return Prisma.sql`"searchVector" @@ (${alternatives})`;
    }),
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

  const bounded = clampLimit(limit);
  const [exact, variants] = await Promise.all([
    searchExact(query, bounded),
    searchVariants(query, bounded),
  ]);

  const seen = new Set(exact.map(key));
  const merged = [...exact, ...variants.filter((hit) => !seen.has(key(hit)))];

  return merged.slice(0, bounded);
}
