/**
 * Scrutins confirmed unresolvable to an amendment link after investigation,
 * keyed by scrutin externalId -> human-readable reason.
 *
 * Purpose: the amendment-linking watchdog must not stay STALLED for days over a
 * KNOWN, explicitly-classified unresolvable vote, yet it must never silently
 * hide an unlinked vote merely because it is old. So exclusion from the blocking
 * stall signal is by EXPLICIT entry here only, never by age.
 *
 * Start EMPTY: the délibération-aware resolver fallback (see
 * link-scrutins-to-amendments/resolve.ts) links the previously-stuck
 * seconde-délibération votes. Add an entry ONLY when a vote is genuinely
 * unresolvable (documented reason), so the watchdog stops treating it as a live
 * stall while still surfacing it in the non-blocking detail.
 */
export const AMENDMENT_LINK_UNRESOLVABLE: Record<string, string> = {};

/** Keys of AMENDMENT_LINK_UNRESOLVABLE, for fast membership lookups. */
export const AMENDMENT_LINK_UNRESOLVABLE_IDS: ReadonlySet<string> = new Set(
  Object.keys(AMENDMENT_LINK_UNRESOLVABLE)
);
