import { describe, it, expect } from "vitest";
import { AffairCombiner } from "../combiner";
import type { AffairSignalResult } from "../signals/types";

const combiner = new AffairCombiner();

function signal(logLR: number, id = "test"): AffairSignalResult {
  return { signalId: id, logLikelihoodRatio: logLR, explanation: "test" };
}

function scored(candidateId: string, logLRs: number[]) {
  const signals = logLRs.map((v, i) => signal(v, `s${i}`));
  return { candidateId, signals };
}

describe("AffairCombiner", () => {
  it("returns NO_MATCH when all candidates score below FLOOR", () => {
    const result = combiner.judge([scored("c1", [1.0, 0.5]), scored("c2", [0.5])]);
    expect(result.judgment).toBe("NO_MATCH");
  });

  it("returns SAME when top candidate clears SAME_THRESHOLD and gap >= MIN_GAP", () => {
    const result = combiner.judge([
      scored("winner", [5.2, 3.0, 2.0]), // total 10.2
      scored("runnerup", [2.0]), // total 2.0, gap 8.2
    ]);
    expect(result.judgment).toBe("SAME");
    expect(result.topCandidateId).toBe("winner");
    expect(result.topScore).toBeCloseTo(10.2);
    expect(result.gap).toBeCloseTo(8.2);
  });

  it("returns UNDECIDED when top clears SAME but gap is below MIN_GAP", () => {
    const result = combiner.judge([
      scored("c1", [5.2, 1.0]), // total 6.2
      scored("c2", [5.2, 0.5]), // total 5.7, gap 0.5
    ]);
    expect(result.judgment).toBe("UNDECIDED");
  });

  it("returns UNDECIDED when top is between FLOOR and SAME_THRESHOLD", () => {
    const result = combiner.judge([
      scored("c1", [4.0]), // between FLOOR (3.0) and SAME_THRESHOLD (5.0)
    ]);
    expect(result.judgment).toBe("UNDECIDED");
  });

  it("skips disqualified candidates from ranking", () => {
    const disqualified: AffairSignalResult = {
      signalId: "temporal-mandate",
      logLikelihoodRatio: 0,
      disqualified: { reason: "not yet born" },
      explanation: "test",
    };
    const result = combiner.judge([
      { candidateId: "c1", signals: [signal(10), disqualified] },
      { candidateId: "c2", signals: [signal(3.5)] },
    ]);
    expect(result.topCandidateId).toBe("c2");
    expect(result.topScore).toBeCloseTo(3.5);
    expect(result.topCandidates.map((c) => c.candidateId)).not.toContain("c1");
  });

  it("sorts candidates descending by total score and returns top 3", () => {
    const result = combiner.judge([
      scored("low", [2.0]),
      scored("high", [8.0]),
      scored("mid", [5.0]),
      scored("bottom", [1.0]),
    ]);
    expect(result.topCandidateId).toBe("high");
    expect(result.topCandidates.map((c) => c.candidateId)).toEqual(["high", "mid", "low"]);
    expect(result.topCandidates).toHaveLength(3);
  });
});
