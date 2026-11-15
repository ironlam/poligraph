// Public URLs of the Territoires section (#1052). Departments moved from /departements to
// /territoires/departements: next.config.ts redirects the old URLs (308, query string kept).

export const TERRITOIRES_PATH = "/territoires";
export const TERRITOIRES_REGIONS_ANCHOR = "/territoires#regions";
/** Server-rendered search results: dynamic, so kept off the cached entry page. */
export const TERRITOIRES_SEARCH_PATH = "/territoires/recherche";

const INSEE_CODE = "[0-9]{5}|2[AB][0-9]{3}";

/** Same slug as the rest of the site, inlined so this file stays free of imports. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * `/territoires/communes/brest-29019`. The INSEE code is the key; the name in front is there
 * for the reader and is never used to find the commune. Without a name the bare code is
 * returned: that address still answers, by a 308 to the readable one.
 */
export function territoireCommunePath(inseeCode: string, name?: string | null): string {
  const slug = name ? slugify(name) : "";
  return `/territoires/communes/${slug ? `${slug}-` : ""}${encodeURIComponent(inseeCode)}`;
}

/** INSEE code of a commune segment, readable (`brest-29019`) or bare (`29019`). */
export function communeCodeFromSegment(segment: string): string | null {
  const match = decodeURIComponent(segment).match(new RegExp(`(?:^|-)(${INSEE_CODE})$`));
  return match?.[1] ?? null;
}

const LEGACY_COMMUNE_PATH = new RegExp(
  `^/territoires/communes/(${INSEE_CODE})(/elections|/decisions)?/?$`
);

/**
 * A commune address written with the bare code, as published before the readable form: the
 * code and the sub-page to redirect to. Null for a readable address and for anything else.
 */
export function legacyCommunePath(
  pathname: string
): { code: string; suite: "" | "/elections" | "/decisions" } | null {
  const match = pathname.match(LEGACY_COMMUNE_PATH);
  if (!match) return null;
  return { code: match[1]!, suite: (match[2] ?? "") as "" | "/elections" | "/decisions" };
}

export const TERRITOIRES_DEPARTEMENTS_PATH = "/territoires/departements";

export function territoireDepartementPath(slug: string): string {
  return `${TERRITOIRES_DEPARTEMENTS_PATH}/${encodeURIComponent(slug)}`;
}

export function territoireRegionPath(slug: string): string {
  return `/territoires/regions/${encodeURIComponent(slug)}`;
}

/** Exists only while the commune has at least one published decision (#1052, lot 2). */
export function territoireCommuneDecisionsPath(inseeCode: string, name?: string | null): string {
  return `${territoireCommunePath(inseeCode, name)}/decisions`;
}

/** Dedicated page listing every scrutin the commune has results for (#1052). */
export function territoireCommuneElectionsPath(inseeCode: string, name?: string | null): string {
  return `${territoireCommunePath(inseeCode, name)}/elections`;
}

/** Exports, releases and licences of the section. */
export const TERRITOIRES_DONNEES_PATH = "/territoires/donnees";
