/**
 * Address of the presidential affairs listing: its sorts and the URL each filter state maps to.
 * Pure on purpose, so the page, the filter bar and the tests share one definition.
 */

export const PRESIDENTIAL_AFFAIRS_PATH = "/elections/presidentielle-2027/affaires-judiciaires";

export const PRESIDENTIAL_AFFAIRS_SORTS = ["recentes", "anciennes", "candidat"] as const;
export type PresidentialAffairsSort = (typeof PRESIDENTIAL_AFFAIRS_SORTS)[number];
export const DEFAULT_PRESIDENTIAL_AFFAIRS_SORT: PresidentialAffairsSort = "recentes";

export const PRESIDENTIAL_AFFAIRS_SORT_LABELS: Record<PresidentialAffairsSort, string> = {
  recentes: "Plus récentes",
  anciennes: "Plus anciennes",
  candidat: "Par candidat",
};

export function parsePresidentialAffairsSort(raw: string | undefined): PresidentialAffairsSort {
  return (PRESIDENTIAL_AFFAIRS_SORTS as readonly string[]).includes(raw ?? "")
    ? (raw as PresidentialAffairsSort)
    : DEFAULT_PRESIDENTIAL_AFFAIRS_SORT;
}

export function parsePresidentialAffairsPage(raw: string | undefined): number {
  const page = Number(raw);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export type PresidentialAffairsState = {
  candidat: string | null;
  tri: PresidentialAffairsSort;
  page?: number;
};

/** Defaults stay out of the URL so the bare listing keeps a single indexable address. */
export function buildPresidentialAffairsHref({ candidat, tri, page }: PresidentialAffairsState) {
  const params = new URLSearchParams();
  if (candidat) params.set("candidat", candidat);
  if (tri !== DEFAULT_PRESIDENTIAL_AFFAIRS_SORT) params.set("tri", tri);
  if (page && page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${PRESIDENTIAL_AFFAIRS_PATH}?${qs}` : PRESIDENTIAL_AFFAIRS_PATH;
}
