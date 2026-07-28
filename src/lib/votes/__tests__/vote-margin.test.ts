import { describe, it, expect } from "vitest";
import { formatVoteMargin } from "../vote-margin";

describe("formatVoteMargin", () => {
  it("majorité large", () => {
    const r = formatVoteMargin(400, 29);
    expect(r.label).toBe("majorité +371");
    expect(r.isClose).toBe(false);
    expect(r.hasExpressed).toBe(true);
  });
  it("vote serré adopté (|marge| <= 10)", () => {
    const r = formatVoteMargin(100, 96);
    expect(r.label).toBe("majorité +4 · vote serré");
    expect(r.isClose).toBe(true);
  });
  it("rejeté", () => {
    const r = formatVoteMargin(96, 100);
    expect(r.label).toBe("manque 4 voix · vote serré");
    expect(r.isClose).toBe(true);
  });
  it("rejeté large", () => {
    expect(formatVoteMargin(20, 300).label).toBe("manque 280 voix");
  });
  it("égalité", () => {
    expect(formatVoteMargin(50, 50).label).toBe("égalité · vote serré");
  });
  it("aucun suffrage exprimé", () => {
    const r = formatVoteMargin(0, 0);
    expect(r.hasExpressed).toBe(false);
    expect(r.label).toBe("Aucun suffrage exprimé");
    expect(r.forPercent).toBe(0);
  });
});
