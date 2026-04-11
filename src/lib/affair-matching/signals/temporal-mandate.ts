import {
  AffairSignalEvaluator,
  AffairSignalResult,
  AffairSignalTier,
  AffairScoringInput,
  AffairCandidateRecord,
  AffairSignalContext,
} from "./types";
import {
  TEMPORAL_DURING_MANDATE_LLR,
  TEMPORAL_AFTER_MANDATE_LLR,
  TEMPORAL_BEFORE_MANDATE_LLR,
  DEATH_GRACE_PERIOD_MS,
} from "./constants";

/**
 * Relates the facts date to the candidate's mandate timeline.
 * Also enforces life-span disqualifiers (not yet born, long deceased).
 */
export class TemporalMandateSignal implements AffairSignalEvaluator {
  readonly id = "temporal-mandate";
  readonly description = "Facts date vs candidate mandate timeline";
  readonly tier = AffairSignalTier.MODERATE;

  evaluate(
    input: AffairScoringInput,
    candidate: AffairCandidateRecord,
    _context: AffairSignalContext
  ): AffairSignalResult {
    const factsDate = input.metadata.factsDate;
    if (!factsDate) {
      return {
        signalId: this.id,
        logLikelihoodRatio: 0,
        explanation: "No facts date on input",
      };
    }

    // Disqualifier: not yet born.
    if (candidate.birthDate && factsDate.getTime() < candidate.birthDate.getTime()) {
      return {
        signalId: this.id,
        logLikelihoodRatio: 0,
        disqualified: { reason: "politician not yet born at facts date" },
        explanation: `Facts on ${factsDate.toISOString().slice(0, 10)} before birth ${candidate.birthDate.toISOString().slice(0, 10)}`,
      };
    }

    // Disqualifier: deceased long before facts.
    if (
      candidate.deathDate &&
      factsDate.getTime() - candidate.deathDate.getTime() > DEATH_GRACE_PERIOD_MS
    ) {
      return {
        signalId: this.id,
        logLikelihoodRatio: 0,
        disqualified: { reason: "politician deceased more than 10 years before facts" },
        explanation: `Death ${candidate.deathDate.toISOString().slice(0, 10)}, facts ${factsDate.toISOString().slice(0, 10)}`,
      };
    }

    if (candidate.mandates.length === 0) {
      return {
        signalId: this.id,
        logLikelihoodRatio: 0,
        explanation: "Candidate has no mandates",
      };
    }

    // During any mandate?
    const duringMandate = candidate.mandates.find(
      (m) =>
        factsDate.getTime() >= m.startDate.getTime() &&
        (m.endDate === null || factsDate.getTime() <= m.endDate.getTime())
    );
    if (duringMandate) {
      return {
        signalId: this.id,
        logLikelihoodRatio: TEMPORAL_DURING_MANDATE_LLR,
        explanation: `Facts during ${duringMandate.type} mandate`,
        evidence: { mandateType: duringMandate.type },
      };
    }

    // Find earliest and latest mandate dates.
    const earliestStart = Math.min(...candidate.mandates.map((m) => m.startDate.getTime()));
    const latestEnd = Math.max(
      ...candidate.mandates.map((m) => m.endDate?.getTime() ?? Date.now())
    );

    if (factsDate.getTime() < earliestStart) {
      return {
        signalId: this.id,
        logLikelihoodRatio: TEMPORAL_BEFORE_MANDATE_LLR,
        explanation: "Facts before any known mandate",
      };
    }

    if (factsDate.getTime() > latestEnd) {
      return {
        signalId: this.id,
        logLikelihoodRatio: TEMPORAL_AFTER_MANDATE_LLR,
        explanation: "Facts after the last mandate ended",
      };
    }

    // Between mandates (gap).
    return {
      signalId: this.id,
      logLikelihoodRatio: 0,
      explanation: "Facts in a gap between mandates",
    };
  }
}
