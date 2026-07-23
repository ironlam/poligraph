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
}

/**
 * Primary watchdog signal: the linked frontier lags the amendable frontier
 * beyond the threshold AND linkable recent votes remain unlinked (the second
 * clause avoids recess false positives: no recent votes => not stalled).
 */
export function isLinkingStalled(i: LinkStallInput): boolean {
  return i.lagHours > i.maxLagHours && i.recentLinkableUnlinked > 0;
}

export interface IngestionAnomalyInput {
  /** Feed returned 304 / unchanged. */
  notModified: boolean;
  entriesSeen: number;
  created: number;
  updated: number;
  dbAmendmentCount: number;
  recentLinkableUnlinked: number;
}

/**
 * In-sync anomaly: a 304/unchanged feed or a matched corpus is NORMAL (no
 * anomaly). Flag only when the feed was actually processed, NOTHING was
 * ingested, AND there is an observable business consequence: the ZIP has more
 * entries than the DB reflects, or linkable recent votes remain unlinked.
 */
export function isIngestionAnomaly(i: IngestionAnomalyInput): boolean {
  if (i.notModified) return false;
  if (i.created > 0 || i.updated > 0) return false;
  return i.entriesSeen > i.dbAmendmentCount || i.recentLinkableUnlinked > 0;
}
