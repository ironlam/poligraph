import { AffairCombiner, type CombinerDecision } from "./combiner";
import type {
  AffairCandidateRecord,
  AffairScoringInput,
  AffairSignalContext,
} from "./signals/types";
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
  candidates: AffairCandidateRecord[]
): CombinerDecision {
  const context: AffairSignalContext = { resolverVersion: RESOLVER_VERSION };

  const candidateSignals = candidates.map((candidate) => ({
    candidateId: candidate.id,
    signals: SIGNALS.map((signal) => signal.evaluate(input, candidate, context)),
  }));

  return combiner.judge(candidateSignals);
}
