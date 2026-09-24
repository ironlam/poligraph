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

/**
 * An address, whatever spacing it is written with. A leading "@" is not one, so a handle
 * typed as `@jlmelenchon` stays a search we want to know about.
 */
const ADDRESS_SHAPED = /\S\s*@\s*\S/;

/**
 * A digit run long enough to be a phone number, measured AFTER the separators inside it are
 * removed: "06 12 34 56 78" is how a French number is actually written, and a rule that asked
 * for consecutive digits would have waved it through.
 *
 * Nine and not seven, because eight digits is a law number (`2016-1088`) and looking one up is
 * exactly the editorial gap this event exists to record. A French number has ten.
 */
const PHONE_SHAPED = /\d{9,}/;

/** Drops the separators that sit BETWEEN two digits, and only those. */
function joinDigitGroups(value: string): string {
  return value.replace(/(\d)[\s.\-/](?=\d)/g, "$1");
}

/**
 * The term as it will be reported, or an empty string when it must not leave the browser.
 *
 * Analytics is a third party (Umami Cloud), so a free-text field reaching it is the ordinary way
 * personal data ends up somewhere it was never meant to go. The two shapes rejected here carry no
 * editorial value either: nobody looks up an email address in a database of elected officials and
 * expects a hit, so dropping them makes the backlog cleaner as well as quieter.
 *
 * Both are tested BEFORE truncation. Checking the 60-character cut instead would let an address
 * sitting further into a pasted block slip through, and send the first 60 characters anyway.
 *
 * This reduces exposure, it does not remove it: a visitor typing their own name and town is
 * indistinguishable from a legitimate search, and no pattern will catch that.
 */
export function normaliseSearchQuery(query: string): string {
  const cleaned = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (ADDRESS_SHAPED.test(cleaned) || PHONE_SHAPED.test(joinDigitGroups(cleaned))) return "";
  return cleaned.slice(0, MAX_QUERY_LENGTH);
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
