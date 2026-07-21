export type Resolution = "VOTE_REF" | "SINGLE_SESSION" | "TITLE_MATCH" | "AMBIGUOUS" | "UNMATCHED";

export type Action = "NEW_LINK" | "REPOINT" | "CLEAR" | "KEEP" | "NOOP";

export interface ScrutinDossierTransition {
  scrutinId: string;
  externalId: string;
  previousDossierId: string | null;
  resolvedDossierId: string | null; // DB id, mapped from the resolver's external id
  resolution: Resolution;
  appliedDossierId: string | null;
  action: Action;
  bestScore?: number;
  margin?: number;
  candidateExternalIds: string[];
  /** Resolver's per-candidate alias-max scores, sorted desc. See
   *  ResolveOutcome.candidateScores (./resolve). Only present for TITLE_MATCH
   *  and AMBIGUOUS transitions. */
  candidateScores?: { externalId: string; score: number }[];
}

export interface ReconciliationResult {
  evaluatedCount: number;
  decisions: ScrutinDossierTransition[];
  appliedTransitions: ScrutinDossierTransition[];
  repairRunId: string;
}

export interface ReconcileOptions {
  /** Destructively clear currently-linked scrutins that resolve AMBIGUOUS. Daily = false. */
  applyClears?: boolean;
  /** Stamps revision/report rows for idempotent resume. Caller-supplied (deterministic). */
  repairRunId: string;
}

export const TITLE_MATCH_MIN_SCORE = 0.3; // tuned on the 2026-07-21 simulation
export const TITLE_MATCH_MIN_MARGIN = 0.15;
