import { describe, it, expect } from "vitest";
import {
  hexToRgb,
  getRelativeLuminance,
  getContrastRatio,
  getAccessibleTextColor,
  ensureContrast,
  tintOver,
  ensureContrastOnDark,
} from "./contrast";

describe("hexToRgb", () => {
  it("parses black", () => {
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("parses white", () => {
    expect(hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("parses primary colors", () => {
    expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb("#00ff00")).toEqual({ r: 0, g: 255, b: 0 });
    expect(hexToRgb("#0000ff")).toEqual({ r: 0, g: 0, b: 255 });
  });

  it("works without # prefix", () => {
    expect(hexToRgb("ff0000")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("expands 3-char shorthand", () => {
    expect(hexToRgb("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb("#f00")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("expands 3-char shorthand without #", () => {
    expect(hexToRgb("abc")).toEqual({ r: 170, g: 187, b: 204 });
  });
});

describe("getRelativeLuminance", () => {
  it("returns 0 for black", () => {
    expect(getRelativeLuminance("#000000")).toBe(0);
  });

  it("returns ~1 for white", () => {
    expect(getRelativeLuminance("#ffffff")).toBeCloseTo(1, 2);
  });

  it("returns intermediate values for gray", () => {
    const lum = getRelativeLuminance("#808080");
    expect(lum).toBeGreaterThan(0.1);
    expect(lum).toBeLessThan(0.5);
  });
});

describe("getContrastRatio", () => {
  it("returns 21:1 for black vs white", () => {
    expect(getContrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("returns 1:1 for identical colors", () => {
    expect(getContrastRatio("#336699", "#336699")).toBeCloseTo(1, 2);
  });

  it("is symmetric", () => {
    const ab = getContrastRatio("#336699", "#ffcc00");
    const ba = getContrastRatio("#ffcc00", "#336699");
    expect(ab).toBeCloseTo(ba, 5);
  });
});

describe("getAccessibleTextColor", () => {
  it("returns black on white background", () => {
    expect(getAccessibleTextColor("#ffffff")).toBe("#000000");
  });

  it("returns white on black background", () => {
    expect(getAccessibleTextColor("#000000")).toBe("#ffffff");
  });

  it("returns white on dark blue", () => {
    expect(getAccessibleTextColor("#003366")).toBe("#ffffff");
  });

  it("returns black on light yellow", () => {
    expect(getAccessibleTextColor("#ffff00")).toBe("#000000");
  });
});

describe("ensureContrast", () => {
  it("returns original color when contrast is sufficient", () => {
    expect(ensureContrast("#000000", "#ffffff")).toBe("#000000");
  });

  it("darkens color when contrast is insufficient", () => {
    const lightGray = "#cccccc";
    const result = ensureContrast(lightGray, "#ffffff");
    expect(result).not.toBe(lightGray);
    expect(getContrastRatio(result, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("defaults to white background", () => {
    const result = ensureContrast("#cccccc");
    expect(getContrastRatio(result, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("respects custom minimum ratio", () => {
    const result = ensureContrast("#999999", "#ffffff", 7);
    expect(getContrastRatio(result, "#ffffff")).toBeGreaterThanOrEqual(7);
  });

  it("falls back to black when target is unreachable", () => {
    expect(ensureContrast("#010101", "#000000", 21)).toBe("#000000");
  });
});

describe("tintOver", () => {
  it("returns the base for a zero alpha and the color for an alpha of 1", () => {
    expect(tintOver("#FFD600", 0, "#f5f5f5")).toBe("#f5f5f5");
    expect(tintOver("#FFD600", 1, "#f5f5f5")).toBe("#ffd600");
  });

  it("matches the surface of a party badge tint on the page background", () => {
    expect(tintOver("#FFD600", 0x20 / 255, "#f5f5f5")).toBe("#f6f1d6");
  });

  it("lets ensureContrast reach AA on a tint, where white gave 4.01", () => {
    const bg = tintOver("#FFD600", 0x20 / 255, "#f5f5f5");
    const onWhite = ensureContrast("#FFD600", "#ffffff");
    expect(getContrastRatio(onWhite, bg)).toBeLessThan(4.5);
    expect(getContrastRatio(ensureContrast("#FFD600", bg), bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("ensureContrastOnDark", () => {
  const dark = tintOver("#0D378A", 0x20 / 255, "#0d0d0d");

  it("keeps a color that already reads on the dark surface", () => {
    expect(ensureContrastOnDark("#FFD600", "#0d0d0d")).toBe("#FFD600");
  });

  it("lightens a dark party color until it reaches AA, where it gave 1.7:1", () => {
    expect(getContrastRatio("#0D378A", dark)).toBeLessThan(2);
    expect(getContrastRatio(ensureContrastOnDark("#0D378A", dark), dark)).toBeGreaterThanOrEqual(
      4.5
    );
  });

  it("falls back to white when the target is unreachable", () => {
    expect(ensureContrastOnDark("#010101", "#000000", 21)).toBe("#ffffff");
  });
});
