/**
 * Filter / search param keys that turn each listing into a utility variant, which the
 * pages pass to hasActiveListingFilter() to emit noindex,follow (the bare listing stays
 * indexable). Centralised here so each listing's noindex perimeter is explicit and
 * guarded by src/lib/seo/__tests__/indexation-doctrine.test.ts against silent removal
 * of a key (which would let a filtered URL slip back into the index).
 *
 * Route-specific extra conditions (e.g. /affaires mode, /politiques conviction/sort)
 * stay inline in their pages: they are not param-key based.
 */

export const AFFAIRES_LISTING_FILTER_KEYS = [
  "search",
  "sort",
  "status",
  "supercat",
  "category",
  "certainty",
  "parti",
] as const;

export const POLITIQUES_LISTING_FILTER_KEYS = ["search", "party", "mandate", "status"] as const;

export const VOTES_LISTING_FILTER_KEYS = [
  "search",
  "result",
  "legislature",
  "chamber",
  "theme",
  "type",
  "sort",
] as const;

export const DOSSIERS_LISTING_FILTER_KEYS = ["status", "theme", "sort"] as const;

export const PRESIDENTIAL_CANDIDATES_FILTER_KEYS = ["q", "statut", "propositions"] as const;
