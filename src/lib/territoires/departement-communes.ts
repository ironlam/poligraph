import { DEPARTEMENT_COMMUNES_FILTER_KEYS } from "@/lib/seo/listing-filters";
import { hasActiveListingFilter } from "@/lib/seo/listing-robots";
import { territoireDepartementPath } from "@/lib/territoires/paths";

/**
 * URLs of the paginated commune list of a department page (#1052, lot 1.2).
 *
 * Public URLs carry the filter as a query string (`/territoires/departements/eure?lettre=E&page=2`). The page
 * itself never reads `searchParams`: doing so would make the whole route dynamic, and combined
 * with `generateStaticParams` it crashes with DYNAMIC_SERVER_USAGE (AGENTS.md §8). `src/proxy.ts`
 * rewrites a filtered URL to the internal segment `/territoires/departements/<slug>/communes/<lettre>/<page>`,
 * which is ISR-cached per variant like the bare page. The rewrite is internal: the address bar
 * and the canonical keep the public form.
 */

export const COMMUNE_INDEX_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** Letter segment of the internal route when no letter is selected. */
export const ALL_LETTERS_SEGMENT = "toutes";

export const COMMUNES_ANCHOR = "communes";

export interface CommuneListQuery {
  letter: string | null;
  page: number;
}

/** Public URL of one view of the list, anchored on the list. Page 1 and "all" are omitted. */
export function departementCommunesHref(slug: string, query: CommuneListQuery): string {
  const params = new URLSearchParams();
  if (query.letter) params.set("lettre", query.letter);
  if (query.page > 1) params.set("page", String(query.page));
  const search = params.toString();
  return `${territoireDepartementPath(slug)}${search ? `?${search}` : ""}#${COMMUNES_ANCHOR}`;
}

const DEPARTEMENT_PATH = /^\/territoires\/departements\/([a-z0-9-]+)$/;

/**
 * Internal path for a filtered department URL, or null when the URL is the bare page (no letter,
 * page 1) or when the letter or page cannot designate a view of the list: the bare page route
 * serves those as is. The internal route still answers 404 for a page past the end of the list.
 */
export function departementCommunesRewritePath(
  pathname: string,
  searchParams: URLSearchParams
): string | null {
  const slug = DEPARTEMENT_PATH.exec(pathname)?.[1];
  if (slug === undefined) return null;
  const lettre = searchParams.get("lettre")?.trim() || undefined;
  const page = searchParams.get("page") ?? undefined;
  if (!hasActiveListingFilter({ lettre, page }, DEPARTEMENT_COMMUNES_FILTER_KEYS)) return null;

  // Only rewrite views that can exist: arbitrary values would each render (and cache) a 404 on
  // the ISR route, which costs ISR writes. Anything else falls back to the bare cached page.
  if (lettre !== undefined && !COMMUNE_INDEX_LETTERS.includes(lettre.toUpperCase())) return null;
  if (page !== undefined && !/^[1-9][0-9]?$/.test(page)) return null;

  const pageNumber = Number(page);
  const pageSegment = Number.isInteger(pageNumber) && pageNumber > 1 ? String(pageNumber) : "1";
  const letterSegment = lettre ?? ALL_LETTERS_SEGMENT;
  return `${territoireDepartementPath(slug)}/communes/${encodeURIComponent(letterSegment)}/${pageSegment}`;
}

/** Reads the internal segments back. Null when they designate no view of the list. */
export function parseCommuneListSegments(lettre: string, page: string): CommuneListQuery | null {
  const decoded = decodeURIComponent(lettre).toUpperCase();
  const letter =
    decoded === ALL_LETTERS_SEGMENT.toUpperCase()
      ? null
      : COMMUNE_INDEX_LETTERS.includes(decoded)
        ? decoded
        : undefined;
  if (letter === undefined) return null;
  if (!/^[1-9][0-9]?$/.test(page)) return null;
  return { letter, page: Number(page) };
}
