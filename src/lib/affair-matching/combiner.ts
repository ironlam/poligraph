import type { AffairSignalResult } from "./signals/types";
import { FLOOR_SCORE, SAME_THRESHOLD, MIN_GAP } from "./signals/constants";

export type AffairJudgment = "SAME" | "UNDECIDED" | "NO_MATCH";

export interface CandidateSignals {
  candidateId: string;
  signals: AffairSignalResult[];
}

export interface ScoredCandidate {
  candidateId: string;
  totalScore: number;
  signals: AffairSignalResult[];
  disqualified?: { reason: string };
}

export interface CombinerDecision {
  judgment: AffairJudgment;
  topCandidateId: string | null;
  topScore: number;
  gap: number;
  topCandidates: ScoredCandidate[];
}

/**
 * Sums log-likelihood ratios per candidate, applies disqualifier short-circuits,
 * then applies the three-tier threshold logic (FLOOR, SAME_THRESHOLD, MIN_GAP)
 * to return a single judgment over the candidate set.
 */
export class AffairCombiner {
  judge(candidates: CandidateSignals[]): CombinerDecision {
    const scored: ScoredCandidate[] = candidates.map((c) => {
      const disqualifier = c.signals.find((s) => s.disqualified);
      if (disqualifier) {
        return {
          candidateId: c.candidateId,
          totalScore: -Infinity,
          signals: c.signals,
          disqualified: disqualifier.disqualified,
        };
      }
      const totalScore = c.signals.reduce((sum, s) => sum + s.logLikelihoodRatio, 0);
      return { candidateId: c.candidateId, totalScore, signals: c.signals };
    });

    // Exclude disqualified from ranking.
    const ranked = scored
      .filter((c) => !c.disqualified)
      .sort((a, b) => b.totalScore - a.totalScore);

    const topCandidates = ranked.slice(0, 3);
    const top = ranked[0];
    const runnerUp = ranked[1];
    const gap = top && runnerUp ? top.totalScore - runnerUp.totalScore : (top?.totalScore ?? 0);

    if (!top || top.totalScore < FLOOR_SCORE) {
      return {
        judgment: "NO_MATCH",
        topCandidateId: top?.candidateId ?? null,
        topScore: top?.totalScore ?? 0,
        gap,
        topCandidates,
      };
    }

    if (top.totalScore >= SAME_THRESHOLD && gap >= MIN_GAP) {
      return {
        judgment: "SAME",
        topCandidateId: top.candidateId,
        topScore: top.totalScore,
        gap,
        topCandidates,
      };
    }

    return {
      judgment: "UNDECIDED",
      topCandidateId: top.candidateId,
      topScore: top.totalScore,
      gap,
      topCandidates,
    };
  }
}
