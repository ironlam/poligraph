/**
 * WCAG 2.1 contrast utilities for accessible color handling.
 * Used for dynamic party colors and any runtime color decisions.
 */

/** Parse a hex color string to RGB components */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace("#", "");
  const fullHex =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((c) => c + c)
          .join("")
      : cleaned;

  return {
    r: parseInt(fullHex.slice(0, 2), 16),
    g: parseInt(fullHex.slice(2, 4), 16),
    b: parseInt(fullHex.slice(4, 6), 16),
  };
}

/** Relative luminance per WCAG 2.1 (0 = black, 1 = white) */
export function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);

  const [rs, gs, bs] = [r, g, b].map((c) => {
    const srgb = c / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * rs! + 0.7152 * gs! + 0.0722 * bs!;
}

/** Contrast ratio between two colors (1:1 to 21:1) */
export function getContrastRatio(color1: string, color2: string): number {
  const l1 = getRelativeLuminance(color1);
  const l2 = getRelativeLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Returns black or white depending on which has better contrast against the background */
export function getAccessibleTextColor(bgHex: string): "#000000" | "#ffffff" {
  const luminance = getRelativeLuminance(bgHex);
  // Use 0.179 threshold (sqrt of 0.0525 from WCAG formula midpoint)
  return luminance > 0.179 ? "#000000" : "#ffffff";
}

/** Opaque color a hex color gives once drawn at `alpha` (0-1) over `base`, e.g. a `${color}20` tint */
export function tintOver(hex: string, alpha: number, base: string = "#ffffff"): string {
  const fg = hexToRgb(hex);
  const bg = hexToRgb(base);
  const mix = (f: number, b: number) =>
    Math.round(b + (f - b) * alpha)
      .toString(16)
      .padStart(2, "0");
  return `#${mix(fg.r, bg.r)}${mix(fg.g, bg.g)}${mix(fg.b, bg.b)}`;
}

/** Darken a hex color by a factor (0-1, where 0 = black) */
function darkenColor(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const nr = clamp(r * factor);
  const ng = clamp(g * factor);
  const nb = clamp(b * factor);
  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
}

/**
 * Darken a color until it meets the minimum contrast ratio against a background.
 * Useful for party colors used as text on white/light backgrounds.
 *
 * @param color - The foreground color (hex)
 * @param background - The background color (hex), defaults to white
 * @param minRatio - Minimum contrast ratio, defaults to 4.5 (WCAG AA for normal text)
 */
export function ensureContrast(
  color: string,
  background: string = "#ffffff",
  minRatio: number = 4.5
): string {
  if (getContrastRatio(color, background) >= minRatio) {
    return color;
  }

  // Iteratively darken until we meet the ratio
  const factor = 0.95;
  let result = color;
  for (let i = 0; i < 20; i++) {
    result = darkenColor(result, factor);
    if (getContrastRatio(result, background) >= minRatio) {
      return result;
    }
  }

  // Fallback to black if we can't reach the target
  return "#000000";
}
