import { VOTES_LISTING_FILTER_KEYS } from "./listing-filters";
import { hasActiveListingFilter } from "./listing-robots";

export const BARE_VOTES_TITLE = "Qui vote quoi ? Votes de l'Assemblée et du Sénat";
export const BARE_VOTES_DESCRIPTION =
  "Qui vote quoi au Parlement ? Suivez les votes des députés et sénateurs, consultez les scrutins et découvrez comment votent vos représentants.";

/** Copy for the unfiltered listing only, independent from the facets' robots policy. */
export function isBareVotesView(params: Record<string, string | undefined>): boolean {
  return (
    params.filter !== "expliques" &&
    VOTES_LISTING_FILTER_KEYS.every((key) => params[key] === undefined) &&
    !hasActiveListingFilter(params, VOTES_LISTING_FILTER_KEYS)
  );
}
