// Public URLs of the Territoires section (#1052). Departments moved from /departements to
// /territoires/departements: next.config.ts redirects the old URLs (308, query string kept).

export const TERRITOIRES_PATH = "/territoires";
export const TERRITOIRES_REGIONS_ANCHOR = "/territoires#regions";
/** Server-rendered search results: dynamic, so kept off the cached entry page. */
export const TERRITOIRES_SEARCH_PATH = "/territoires/recherche";

export function territoireCommunePath(inseeCode: string): string {
  return `/territoires/communes/${encodeURIComponent(inseeCode)}`;
}

export const TERRITOIRES_DEPARTEMENTS_PATH = "/territoires/departements";

export function territoireDepartementPath(slug: string): string {
  return `${TERRITOIRES_DEPARTEMENTS_PATH}/${encodeURIComponent(slug)}`;
}

export function territoireRegionPath(slug: string): string {
  return `/territoires/regions/${encodeURIComponent(slug)}`;
}

/** Exists only while the commune has at least one published decision (#1052, lot 2). */
export function territoireCommuneDecisionsPath(inseeCode: string): string {
  return `${territoireCommunePath(inseeCode)}/decisions`;
}

/** Dedicated page listing every scrutin the commune has results for (#1052). */
export function territoireCommuneElectionsPath(inseeCode: string): string {
  return `${territoireCommunePath(inseeCode)}/elections`;
}

/** Exports, releases and licences of the section. */
export const TERRITOIRES_DONNEES_PATH = "/territoires/donnees";
