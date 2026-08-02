import type { SourceType } from "@/generated/prisma";
import type { SurnameVocabulary } from "../surname-ambiguity";

/**
 * Importance tier of a signal in the resolver pipeline.
 * Used to order evaluation and decide which signals to skip in cheap passes.
 */
export enum AffairSignalTier {
  DETERMINISTIC = 0, // External ID match; can produce SAME alone
  STRONG = 1, // High discriminative power (name quality, role context)
  MODERATE = 2, // Contributes but not decisive (jurisdiction, temporal, party)
  CONTEXTUAL = 3, // Global context (French anchor, foreign indicators)
}

/**
 * Output of a single signal evaluation against one candidate politician.
 */
export interface AffairSignalResult {
  signalId: string;
  logLikelihoodRatio: number;
  /**
   * If set, the candidate is removed from scoring entirely and marked
   * disqualified. Used for hard constraints (dead politician, not yet born).
   */
  disqualified?: { reason: string };
  explanation: string;
  evidence?: Record<string, unknown>;
}

/**
 * Everything the resolver knows about the affair being linked.
 */
export interface AffairScoringInput {
  text: string;
  candidateNames?: string[];
  metadata: {
    source: SourceType;
    sourceRef?: string | null;
    factsDate?: Date | null;
    verdictDate?: Date | null;
    court?: string | null;
    department?: string | null;
    externalIds?: {
      ecli?: string | null;
      pourvoiNumber?: string | null;
      wikidataQId?: string | null;
    };
  };
}

/**
 * Politician data a signal needs. Loaded once per batch by the resolver
 * and shared across all candidates to avoid per-signal DB calls.
 */
export interface AffairCandidateRecord {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  normalizedLastName: string;
  birthDate: Date | null;
  deathDate: Date | null;
  civility: string | null;
  departments: string[];
  mandates: Array<{
    type: string;
    roleLabel: string | null;
    location: string | null;
    startDate: Date;
    endDate: Date | null;
  }>;
  parties: Array<{
    partyLabel: string;
    startDate: Date | null;
    endDate: Date | null;
    current: boolean;
  }>;
  externalIds: Record<string, string>;
}

/**
 * Shared state passed to every signal. Carries the resolver version so
 * signals can gate behavior on a version string.
 */
export interface AffairSignalContext {
  resolverVersion: string;
  /**
   * Surname ambiguity lookup, loaded once per batch alongside the candidate
   * pool. Required rather than optional so the compiler names every call site
   * that would otherwise score without it and lose the fix in silence; pass
   * EMPTY_SURNAME_VOCABULARY where the corpus is genuinely unavailable.
   */
  vocabulary: SurnameVocabulary;
}

/**
 * Signal interface. All signals are pure functions of their inputs.
 * No DB calls, no side effects, no async.
 */
export interface AffairSignalEvaluator {
  readonly id: string;
  readonly description: string;
  readonly tier: AffairSignalTier;
  evaluate(
    input: AffairScoringInput,
    candidate: AffairCandidateRecord,
    context: AffairSignalContext
  ): AffairSignalResult;
}
