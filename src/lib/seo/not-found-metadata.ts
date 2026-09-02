import type { Metadata } from "next";

/**
 * Metadata for a dynamic route whose entity does not exist.
 *
 * The page calls notFound() and renders the not-found view, which brings its
 * own `noindex`. Returning a bare title from generateMetadata leaves the route
 * inheriting the site default on top of it, so the response carries two
 * contradictory robots tags and the outcome rests on the crawler applying the
 * most restrictive one. An explicit value removes that ambiguity rather than
 * relying on it; `follow: true` keeps the layout links crawlable.
 *
 * Measured before this helper existed: every affected route emitted both
 * `index, follow` and `noindex`. So this is metadata hygiene, not an indexing
 * fix, and it does not address the HTTP status, which stays 200 on these
 * routes for an unrelated reason in the framework.
 */
export function missingEntityMetadata(title: string): Metadata {
  return { title, robots: { index: false, follow: true } };
}
