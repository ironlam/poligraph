import { describe, expect, it } from "vitest";
import { voteCardFileName, voteShares, wrapLines } from "../share-card";

// One unit per character: enough to exercise the wrapping without a canvas.
const measure = (text: string) => text.length;

describe("wrapLines", () => {
  it("keeps a text that fits on one line", () => {
    expect(wrapLines(measure, "Projet de loi", 20, 3)).toEqual(["Projet de loi"]);
  });

  it("breaks between words, never inside one", () => {
    expect(wrapLines(measure, "Projet de loi de finances", 12, 4)).toEqual([
      "Projet de",
      "loi de",
      "finances",
    ]);
  });

  it("ends on an ellipsis when the text exceeds the allowed lines", () => {
    const lines = wrapLines(measure, "un deux trois quatre cinq six sept", 10, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith("…")).toBe(true);
    expect(measure(lines[1]!)).toBeLessThanOrEqual(10);
  });

  it("lets a single word longer than the line stand alone", () => {
    expect(wrapLines(measure, "anticonstitutionnellement oui", 10, 3)).toEqual([
      "anticonstitutionnellement",
      "oui",
    ]);
  });

  it("returns nothing for an empty text", () => {
    expect(wrapLines(measure, "   ", 10, 3)).toEqual([]);
  });
});

describe("voteShares", () => {
  it("splits the votes cast into shares that add up to one", () => {
    const shares = voteShares({ votesFor: 289, votesAgainst: 251, votesAbstain: 12 });
    expect(shares.pour + shares.contre + shares.abstention).toBeCloseTo(1);
    expect(shares.pour).toBeCloseTo(289 / 552);
  });

  it("draws no segment when nobody voted", () => {
    expect(voteShares({ votesFor: 0, votesAgainst: 0, votesAbstain: 0 })).toEqual({
      pour: 0,
      contre: 0,
      abstention: 0,
    });
  });
});

describe("voteCardFileName", () => {
  it("names the file after the scrutin", () => {
    expect(voteCardFileName("2025-01-15-projet-loi-finances-2025")).toBe(
      "poligraph-vote-2025-01-15-projet-loi-finances-2025.png"
    );
  });

  it("keeps the name safe for a file system", () => {
    expect(voteCardFileName("../é t/x")).toBe("poligraph-vote-t-x.png");
    expect(voteCardFileName("")).toBe("poligraph-vote-scrutin.png");
  });
});
