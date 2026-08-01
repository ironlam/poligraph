import { AFFAIRES_LISTING_FILTER_KEYS } from "@/lib/seo/listing-filters";

/**
 * Non-destructive "back to the listing" plumbing for the affair detail page.
 *
 * The listing serialises its active filters (and result count) into a `retour`
 * query param on each card link; the detail page's sticky bar reads it back to
 * offer "Retour aux N résultats" pointing at the exact filtered listing. Kept
 * pure and free of Next internals so it unit-tests without a router.
 *
 * The detail page's canonical stays /affaires/<slug>, so these `?retour=`
 * variants never enter the index (no server-side searchParams read, ISR intact).
 */

// Only these keys survive a round-trip. Anything else in a crafted `retour`
// value is dropped, so the reconstructed href is always a clean /affaires URL.
const RETURN_ALLOWED_KEYS = new Set<string>([...AFFAIRES_LISTING_FILTER_KEYS, "mode", "page"]);

/** Serialise the active listing params into the inner value of `?retour=`. */
export function buildRetourParam(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const key of RETURN_ALLOWED_KEYS) {
    const value = params[key];
    if (value) sp.set(key, value);
  }
  // Stable order for cache-friendly, comparable URLs.
  sp.sort();
  return sp.toString();
}

export interface ParsedReturn {
  /** Where the back button leads: /affaires, possibly with the origin filters. */
  href: string;
  /** Human label naming the destination, e.g. "Retour aux 12 résultats". */
  label: string;
  /** Result count of the origin perimeter, when known. */
  count: number | null;
  /** True when the origin carried at least one filter (not the bare listing). */
  filtered: boolean;
}

function parseCount(rn: string | null): number | null {
  if (!rn) return null;
  const n = Number.parseInt(rn, 10);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Reconstruct the return destination from the `retour` (inner querystring) and
 * `rn` (count) params, keeping only whitelisted keys.
 */
export function parseReturn(retour: string | null, rn: string | null): ParsedReturn {
  const count = parseCount(rn);
  const clean = new URLSearchParams();

  if (retour) {
    const raw = new URLSearchParams(retour);
    for (const [key, value] of raw) {
      if (RETURN_ALLOWED_KEYS.has(key) && value) clean.set(key, value);
    }
  }

  clean.sort();
  const qs = clean.toString();
  const href = qs ? `/affaires?${qs}` : "/affaires";
  const filtered = qs.length > 0;

  let label: string;
  if (count !== null) {
    const formatted = count.toLocaleString("fr-FR");
    label = count === 1 ? "Retour au résultat" : `Retour aux ${formatted} résultats`;
  } else {
    label = filtered ? "Retour à la liste filtrée" : "Retour aux affaires";
  }

  return { href, label, count, filtered };
}
