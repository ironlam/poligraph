import { DataSource, Judgement, MatchMethod, MandateType } from "@/generated/prisma";

export interface ResolveInput {
  firstName: string;
  lastName: string;
  birthDate?: Date | null;
  source: DataSource;
  sourceId: string;
  department?: string;
  gender?: string | null;
  mandateType?: MandateType;
  context?: Record<string, unknown>;
}

export interface CandidateMatch {
  politicianId: string;
  firstName: string;
  lastName: string;
  birthDate: Date | null;
  score: number;
  method: MatchMethod;
  blocked: boolean; // true if NOT_SAME decision exists
  /** Fellegi-Sunter combiner result (drives decisions since Phase 3) */
  fellegiSunter?: {
    compositeLogRatio: number;
    confidence: number;
    judgement: string | null;
    primaryMethod: string;
    signals: Array<{ id: string; logLR: number }>;
  };
}

/** Mandate period for TemporalSignal */
export interface MandatePeriod {
  start: Date;
  end: Date | null;
  type: string;
}

/** Party membership for PartyContextSignal */
export interface PartyMembershipRecord {
  partyId: string;
  partyName: string;
  current: boolean;
}

export interface ResolveResult {
  sourceId: string;
  politicianId: string | null;
  confidence: number;
  method: MatchMethod;
  decision: Judgement | "NEW";
  candidates: CandidateMatch[];
  blocked: boolean;
}

/** Thresholds for decision zones */
export const IDENTITY_THRESHOLDS = {
  AUTO_MATCH: 0.95,
  REVIEW: 0.7,
} as const;

/** Birthdate tolerance: 1 day in ms */
export const BIRTHDATE_TOLERANCE_MS = 86_400_000;

/** Minimum prominenceScore for the prominence boost (0-1000 scale) */
export const PROMINENCE_THRESHOLD = 400;

/** Input for the legacy pure scoring function (no DB, no side effects) */
export interface LegacyScoringInput {
  firstName: string;
  lastName: string;
  birthDate?: Date | null;
  department?: string;
  gender?: string | null;
}

/**
 * @deprecated Use LegacyScoringInput. Will be replaced by v2 ScoringInput in Phase 2.
 */
export type ScoringInput = LegacyScoringInput;

/** Politician data needed for in-memory scoring */
export interface CachedPolitician {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: Date | null;
  departments: string[];
  gender?: string | null;
  prominenceScore: number;
}

export interface BatchResolveInput {
  inputs: ResolveInput[];
  sourceType: DataSource;
  onProgress?: (processed: number, total: number) => void;
  /**
   * Politicians that must not be offered as candidates, nor trusted in a prior decision.
   *
   * For a caller that persists its records before resolving them: the RNE sync creates a
   * profile in phase 1, then asks in phase 2 whether it duplicates someone. Without this, the
   * record screens against itself, wins on an exact match, and the true duplicate is never
   * seen. Measured 2026-09-27: 77 of 78 decisions pointed at the record being resolved.
   */
  excludePoliticianIds?: ReadonlySet<string>;
}

export interface BatchResolveResult {
  results: ResolveResult[];
  stats: {
    total: number;
    matched: number;
    review: number;
    notFound: number;
    blocked: number;
  };
}
