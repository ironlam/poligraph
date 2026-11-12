import { describe, expect, it } from "vitest";
import {
  fitLines,
  formatCardStat,
  hemicycleDots,
  seatSharePct,
  legislatureLabel,
  initialsOf,
  pickCardStats,
  shareCardFileName,
  voteShares,
  wrapLines,
} from "../share-card";

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

describe("fitLines", () => {
  const measureAt = (size: number, text: string) => text.length * size;
  const steps = [
    { size: 4, maxLines: 1 },
    { size: 2, maxLines: 2 },
    { size: 1, maxLines: 2 },
  ];

  it("keeps the largest size when the text holds on its lines", () => {
    expect(fitLines(measureAt, "abc", 12, steps)).toEqual({ size: 4, lines: ["abc"] });
  });

  it("steps down until the text fits", () => {
    expect(fitLines(measureAt, "abc def", 12, steps)).toEqual({ size: 2, lines: ["abc", "def"] });
  });

  it("ends on the last step with an ellipsis rather than overflowing", () => {
    const fitted = fitLines(measureAt, "un deux trois quatre cinq six sept huit", 12, steps);
    expect(fitted.size).toBe(1);
    expect(fitted.lines).toHaveLength(2);
    expect(fitted.lines[1]).toMatch(/…$/);
  });
});

describe("pickCardStats", () => {
  it("drops zeros and keeps the order", () => {
    expect(
      pickCardStats(
        [
          { value: 3, label: "mandats" },
          { value: 0, label: "mesures" },
          { value: 12, label: "votes" },
        ],
        6
      )
    ).toEqual([
      { value: 3, label: "mandats" },
      { value: 12, label: "votes" },
    ]);
  });

  it("caps the list", () => {
    const stats = [1, 2, 3].map((value) => ({ value, label: `n${value}` }));
    expect(pickCardStats(stats, 2)).toHaveLength(2);
  });
});

describe("initialsOf", () => {
  it("takes the first and the last word", () => {
    expect(initialsOf("Jean-Luc de la Fontaine")).toBe("JF");
    expect(initialsOf("  élise  ")).toBe("É");
    expect(initialsOf("")).toBe("");
  });
});

describe("shareCardFileName", () => {
  it("names the file after its kind and what it shows", () => {
    expect(shareCardFileName("vote", "2025-01-15-projet-loi-finances-2025")).toBe(
      "poligraph-vote-2025-01-15-projet-loi-finances-2025.png"
    );
    expect(shareCardFileName("parti", "les-exemples")).toBe("poligraph-parti-les-exemples.png");
  });

  it("keeps the name safe for a file system", () => {
    expect(shareCardFileName("vote", "../é t/x")).toBe("poligraph-vote-t-x.png");
    expect(shareCardFileName("candidat", "")).toBe("poligraph-candidat-carte.png");
  });
});

describe("formatCardStat", () => {
  it("prints the figure the French way, with its unit when it has one", () => {
    expect(formatCardStat({ value: 87, label: "de cohésion", suffix: " %" })).toBe("87 %");
    expect(formatCardStat({ value: 12, label: "membres" })).toBe("12");
  });
});

describe("legislatureLabel", () => {
  it("names a legislature with its ordinal", () => {
    expect(legislatureLabel(17)).toBe("17e législature");
    expect(legislatureLabel(1)).toBe("1re législature");
  });
});

describe("hemicycleDots", () => {
  const share = (dots: { on: boolean }[]) => dots.filter((dot) => dot.on).length / dots.length;

  it("lights a share of the dots close to the share of the seats", () => {
    const dots = hemicycleDots({ before: 100, seats: 150, total: 500 });
    expect(share(dots)).toBeGreaterThan(0.27);
    expect(share(dots)).toBeLessThan(0.33);
  });

  it("places the first benches on the left and the last on the right", () => {
    const left = hemicycleDots({ before: 0, seats: 100, total: 500 }).filter((dot) => dot.on);
    const right = hemicycleDots({ before: 400, seats: 100, total: 500 }).filter((dot) => dot.on);
    expect(left.every((dot) => dot.x < 0)).toBe(true);
    expect(right.every((dot) => dot.x > 0)).toBe(true);
  });

  it("never lets a very small group vanish", () => {
    const dots = hemicycleDots({ before: 300, seats: 1, total: 577 });
    expect(dots.filter((dot) => dot.on)).toHaveLength(1);
  });

  it("stays inside the half disc", () => {
    for (const dot of hemicycleDots({ before: 0, seats: 10, total: 20 })) {
      expect(Math.hypot(dot.x, dot.y)).toBeLessThanOrEqual(1.0001);
      expect(dot.y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("seatSharePct", () => {
  it("rounds to a whole percentage", () => {
    expect(seatSharePct({ before: 0, seats: 64, total: 575 })).toBe(11);
  });

  it("does not round a sitting group down to zero", () => {
    expect(seatSharePct({ before: 0, seats: 1, total: 577 })).toBe(1);
    expect(seatSharePct({ before: 0, seats: 0, total: 577 })).toBe(0);
  });
});
