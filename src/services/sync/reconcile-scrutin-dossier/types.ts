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
  /** When false, the reconciler computes transitions but does NOT write
   *  dossierLegislatifId: the caller's Phase A (repairScrutinDossier) owns the
   *  write, atomically with the title STALE. Default true (self-contained). */
  applyMutations?: boolean;
}

export const TITLE_MATCH_MIN_SCORE = 0.3; // tuned on the 2026-07-21 simulation
export const TITLE_MATCH_MIN_MARGIN = 0.15;
