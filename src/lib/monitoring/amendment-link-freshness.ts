/**
 * Pure signal logic for the amendment-linking watchdog. No DB, no IO — every
 * input is a value the caller (a script or an Inngest step) has already
 * fetched. Kept here so the two signals can be unit-tested without touching
 * Postgres and reused between the read-only GH Action check and the daily
 * sync's in-band anomaly guard.
 */

export interface LinkStallInput {
  /** votingDate(newest amendable vote) - votingDate(newest linked vote), in hours. */
  lagHours: number;
  /** AMENDEMENT votes with a dossier, old enough to have been linked, still unlinked. */
  recentLinkableUnlinked: number;
  maxLagHours: number;
  /** Absolute unlinked-backlog floor: stalled regardless of lag once reached. */
  absoluteUnlinkedThreshold: number;
}

/**
 * Primary watchdog signal: the linked frontier lags the amendable frontier
 * beyond the threshold AND linkable recent votes remain unlinked (the second
 * clause avoids recess false positives: no recent votes => not stalled).
 *
 * OR'd with an absolute backlog threshold: if only the single newest vote
 * links while a bulk of older ones behind it does not, the lag can stay small
 * even though the backlog is real — the lag-only gate would silence the alarm.
 */
export function isLinkingStalled(i: LinkStallInput): boolean {
  return (
    (i.lagHours > i.maxLagHours && i.recentLinkableUnlinked > 0) ||
    i.recentLinkableUnlinked >= i.absoluteUnlinkedThreshold
  );
}

export interface IngestionAnomalyInput {
  /** Feed returned 304 / unchanged. */
  notModified: boolean;
  created: number;
  updated: number;
  /** AMENDEMENT votes with a dossier, old enough to have been linked, still unlinked. */
  recentLinkableUnlinked: number;
}

/**
 * In-sync anomaly: a 304/unchanged feed or any ingested row is NORMAL. Flag only
 * when the feed was actually processed yet NOTHING was ingested AND a
 * reconciliation-backed business consequence exists: recent linkable votes
 * (AMENDEMENT + dossier) remain unlinked.
 *
 * A raw "ZIP entries > DB rows" comparison is deliberately NOT used: the feed
 * always has more raw entries than deduped/valid DB rows, so it false-positives
 * on every steady-state full pass (created=0 because everything is unchanged).
 * A genuine "feed grew but the base did not" signal would need per-run delta
 * tracking of the entry count (follow-up), not a raw seen-vs-count comparison.
 */
export function isIngestionAnomaly(i: IngestionAnomalyInput): boolean {
  if (i.notModified) return false;
  if (i.created > 0 || i.updated > 0) return false;
  return i.recentLinkableUnlinked > 0;
}
