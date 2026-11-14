import { describe, expect, it } from "vitest";
import {
  asOfLabel,
  groupNameSize,
  leadingSegment,
  monogramSize,
  positionSegments,
  scrutinCountLabel,
} from "../og-card";

describe("positionSegments", () => {
  it("keeps the page's order and its rounded percents", () => {
    const { total, segments } = positionSegments({ POUR: 30, ABSTENTION: 3, CONTRE: 4 });
    expect(total).toBe(37);
    expect(segments.map((s) => [s.key, s.label, s.percent])).toEqual([
      ["POUR", "Pour", 81],
      ["ABSTENTION", "Abstention", 8],
      ["CONTRE", "Contre", 11],
    ]);
  });

  it("gives zero shares, not NaN, when nothing was retained", () => {
    const { total, segments } = positionSegments({ POUR: 0, ABSTENTION: 0, CONTRE: 0 });
    expect(total).toBe(0);
    expect(segments.every((s) => s.share === 0 && s.percent === 0)).toBe(true);
  });
});

describe("leadingSegment", () => {
  const lead = (POUR: number, ABSTENTION: number, CONTRE: number) =>
    leadingSegment(positionSegments({ POUR, ABSTENTION, CONTRE }).segments)?.key ?? null;

  it("leads with the most frequent position, whichever it is", () => {
    expect(lead(30, 3, 4)).toBe("POUR");
    expect(lead(7, 5, 25)).toBe("CONTRE");
    expect(lead(2, 9, 3)).toBe("ABSTENTION");
  });

  it("leads with nothing on a tie or an empty record", () => {
    expect(lead(10, 2, 10)).toBeNull();
    expect(lead(0, 0, 0)).toBeNull();
  });
});

describe("sizes", () => {
  it("sets long names and long codes smaller", () => {
    expect(groupNameSize("Rassemblement National")).toBe(50);
    expect(groupNameSize("La France insoumise - Nouveau Front Populaire")).toBe(34);
    expect(monogramSize("RN")).toBe(38);
    expect(monogramSize("LFI-NFP")).toBe(24);
  });
});

describe("labels", () => {
  it("dates the counts in Paris time", () => {
    expect(asOfLabel(new Date("2026-11-13T23:30:00Z"))).toBe("au 14 nov. 2026");
    expect(asOfLabel(new Date("2026-03-01T10:00:00Z"))).toBe("au 1er mars 2026");
    expect(asOfLabel(null)).toBeNull();
  });

  it("agrees the noun with the count", () => {
    expect(scrutinCountLabel(1)).toBe("1 scrutin");
    expect(scrutinCountLabel(37)).toBe("37 scrutins");
  });
});
