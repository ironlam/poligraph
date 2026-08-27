import { AffairCombiner, type CombinerDecision } from "./combiner";
import type {
  AffairCandidateRecord,
  AffairScoringInput,
  AffairSignalContext,
} from "./signals/types";
import {
  computeTextHash,
  loadCandidatePool,
  loadBlocklist,
  loadSurnameVocabulary,
  persistDecision,
} from "./persistence";
import type { SurnameVocabulary } from "./surname-ambiguity";
import { CandidatePrefilter } from "./candidate-prefilter";
import { RESOLVER_VERSION } from "./signals/constants";
import { ExternalIdSignal } from "./signals/external-id";
import { NameQualitySignal } from "./signals/name-quality";
import { FirstNameSignal } from "./signals/first-name";
import { JurisdictionSignal } from "./signals/jurisdiction";
import { TemporalMandateSignal } from "./signals/temporal-mandate";
import { RoleContextSignal } from "./signals/role-context";
import { PartyContextSignal } from "./signals/party-context";
import { ContextPlausibilitySignal } from "./signals/context-plausibility";

const SIGNALS = [
  new ExternalIdSignal(),
  new NameQualitySignal(),
  new FirstNameSignal(),
  new JurisdictionSignal(),
  new TemporalMandateSignal(),
  new RoleContextSignal(),
  new PartyContextSignal(),
  new ContextPlausibilitySignal(),
];

const combiner = new AffairCombiner();

/**
 * Pure scoring function: takes an affair input and a pre-loaded pool of
 * candidate politicians, returns the combiner's decision. No DB access.
 *
 * This is the testable core. The persistence-aware wrapper
 * `resolveAffairPolitician` (added in persistence.ts) handles DB I/O,
 * idempotency, and blocklist reads.
 */
export function scoreAffairAgainstCandidates(
  input: AffairScoringInput,
  candidates: AffairCandidateRecord[],
  vocabulary: SurnameVocabulary
): CombinerDecision {
  const context: AffairSignalContext = { resolverVersion: RESOLVER_VERSION, vocabulary };

  const candidateSignals = candidates.map((candidate) => ({
    candidateId: candidate.id,
    signals: SIGNALS.map((signal) => signal.evaluate(input, candidate, context)),
  }));

  return combiner.judge(candidateSignals);
}

export interface ResolveResult {
  judgment: CombinerDecision["judgment"];
  topCandidateId: string | null;
  topScore: number;
  gap: number;
  topCandidates: CombinerDecision["topCandidates"];
  decisionId: string;
}

export type ResolvePreviewResult = Omit<ResolveResult, "decisionId"> & { decisionId: null };

/**
 * Full resolver entry point. Loads politicians, prefilters, scores, judges,
 * persists, and returns the decision id.
 */
async function resolveAffairPoliticianInternal(
  input: AffairScoringInput,
  persist: boolean
): Promise<ResolveResult | ResolvePreviewResult> {
  if (input.text.length > 100_000) {
    throw new Error("Affair text exceeds 100KB limit");
  }

  const [pool, vocabulary] = await Promise.all([loadCandidatePool(), loadSurnameVocabulary()]);
  const prefilter = new CandidatePrefilter(pool);
  const prefiltered = prefilter.filter(input.text);

  const textHash = computeTextHash(input.text);
  const blocklist = await loadBlocklist(textHash);
  const candidates = prefiltered.filter((p) => !blocklist.has(p.id));

  const decision = scoreAffairAgainstCandidates(input, candidates, vocabulary);

  const decisionId = persist
    ? (
        await persistDecision({
          text: input.text,
          metadata: input.metadata,
          decision,
        })
      ).decisionId
    : null;

  return {
    judgment: decision.judgment,
    topCandidateId: decision.topCandidateId,
    topScore: decision.topScore,
    gap: decision.gap,
    topCandidates: decision.topCandidates,
    decisionId,
  };
}

export async function resolveAffairPolitician(input: AffairScoringInput): Promise<ResolveResult> {
  return resolveAffairPoliticianInternal(input, true) as Promise<ResolveResult>;
}

/** Runs the same resolver without creating an audit row, for strict dry-runs. */
export async function previewAffairPolitician(
  input: AffairScoringInput
): Promise<ResolvePreviewResult> {
  return resolveAffairPoliticianInternal(input, false) as Promise<ResolvePreviewResult>;
}
