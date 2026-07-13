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
      {
        candidateId: "winner",
        signals: [
          signal(5.2, "name-quality"),
          signal(3.0, "jurisdiction"),
          signal(2.0, "role-context"),
        ],
      }, // total 10.2, corroborated
      scored("runnerup", [2.0]), // total 2.0, gap 8.2
    ]);
    expect(result.judgment).toBe("SAME");
    expect(result.topCandidateId).toBe("winner");
    expect(result.topScore).toBeCloseTo(10.2);
    expect(result.gap).toBeCloseTo(8.2);
  });

  it("returns UNDECIDED when top clears SAME but gap is below MIN_GAP", () => {
    const result = combiner.judge([
      { candidateId: "c1", signals: [signal(5.2, "name-quality"), signal(1.0, "role-context")] }, // 6.2, corroborated
      { candidateId: "c2", signals: [signal(5.2, "name-quality"), signal(0.5, "role-context")] }, // 5.7, gap 0.5
    ]);
    expect(result.judgment).toBe("UNDECIDED");
  });

  it("returns UNDECIDED when top is between FLOOR and SAME_THRESHOLD", () => {
    const result = combiner.judge([
      { candidateId: "c1", signals: [signal(4.0, "role-context")] }, // between FLOOR and SAME, corroborated
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

describe("AffairCombiner — name-only gate", () => {
  it("downgrades a name-only match to NO_MATCH even above SAME_THRESHOLD", () => {
    const result = combiner.judge([
      // Exact name (5.2) + first name (1.5) = 6.7, but nothing ties this person
      // to the affair: an incidental mention.
      {
        candidateId: "mention",
        signals: [signal(5.2, "name-quality"), signal(1.5, "first-name")],
      },
    ]);
    expect(result.judgment).toBe("NO_MATCH");
    // Candidate is preserved for inspection, not discarded.
    expect(result.topCandidateId).toBe("mention");
    expect(result.topScore).toBeCloseTo(6.7);
  });

  it("keeps SAME when a corroborating signal supports the name match", () => {
    const result = combiner.judge([
      { candidateId: "real", signals: [signal(5.2, "name-quality"), signal(4.0, "role-context")] },
      { candidateId: "other", signals: [signal(1.0, "name-quality")] },
    ]);
    expect(result.judgment).toBe("SAME");
    expect(result.topCandidateId).toBe("real");
  });

  it("treats external-id alone as corroboration (deterministic match)", () => {
    const result = combiner.judge([
      { candidateId: "ecli", signals: [signal(10.0, "external-id")] },
    ]);
    expect(result.judgment).toBe("SAME");
  });

  it("does not treat context-plausibility (French anchor) as corroboration", () => {
    const result = combiner.judge([
      {
        candidateId: "x",
        signals: [signal(5.2, "name-quality"), signal(1.0, "context-plausibility")],
      },
    ]);
    expect(result.judgment).toBe("NO_MATCH");
  });

  it("does not count a negative corroborating signal (role mismatch)", () => {
    const result = combiner.judge([
      // Name matches (5.2) but role context contradicts (-2): net 3.2, above FLOOR
      // yet the only non-name signal is negative -> no corroboration.
      {
        candidateId: "wrong",
        signals: [signal(5.2, "name-quality"), signal(-2.0, "role-context")],
      },
    ]);
    expect(result.judgment).toBe("NO_MATCH");
  });
});
