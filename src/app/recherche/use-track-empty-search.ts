"use client";

import { useEffect, useRef } from "react";
import { trackUmami } from "@/lib/umami";

/**
 * Longer than the 250ms search debounce and the 500ms URL sync, so a term is only reported
 * once the visitor has stopped typing rather than once per prefix on the way there.
 */
const SETTLE_MS = 1200;

/** Keeps one term to one hash field, and stops a pasted paragraph from becoming a label. */
const MAX_QUERY_LENGTH = 60;

export function normaliseSearchQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);
}

/**
 * Report searches that returned nothing.
 *
 * What a citizen looked for and did not find names a gap in the database, so this is an
 * editorial backlog rather than an engagement metric. It is only worth reading if it stays
 * clean: terms are normalised, prefixes are waited out, and a term already reported in this
 * session is not sent again.
 */
export function useTrackEmptySearch(query: string, noResults: boolean): void {
  const reported = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!noResults) return;

    const term = normaliseSearchQuery(query);
    if (!term || reported.current.has(term)) return;

    const timer = setTimeout(() => {
      reported.current.add(term);
      trackUmami("search_no_results", { query: term });
    }, SETTLE_MS);

    return () => clearTimeout(timer);
  }, [query, noResults]);
}
