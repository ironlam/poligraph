/**
 * The former per-politician view of the fact-check listing, /factchecks?politician=<slug>, has its
 * own page now: /factchecks/politique/<slug>, which lists the claims attributed to the politician
 * and, apart, the fact-checks that only cite them. Every other parameter of the old view (source,
 * verdict, search, page) is dropped: the new page shows the whole list and filters it in place.
 *
 * Returns the target path, or null when the request names no politician. The slug is kept to the
 * characters a profile slug uses, so the target can never point outside the route. Pure and
 * edge-safe (used from the proxy).
 */
export function buildFactchecksPoliticianRedirect(searchParams: URLSearchParams): string | null {
  const slug = searchParams.get("politician")?.trim().toLowerCase();
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return null;
  return `/factchecks/politique/${slug}`;
}
