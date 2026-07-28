// Read the authored value of a CSS custom property from :root (client-only).
export function cssVar(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Normalize any CSS color (oklch, var(), hex…) to #rrggbb via a canvas.
// Returns null when it cannot be resolved (SSR or invalid input).
export function resolveColor(css: string): string | null {
  if (typeof document === "undefined") return null;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#000";
  ctx.fillStyle = css;
  const v = ctx.fillStyle;
  return typeof v === "string" && v.startsWith("#") ? v : null;
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = c.map((x) =>
    x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG contrast ratio between two CSS colors, or null if unresolved.
export function contrastRatio(fg: string, bg: string): number | null {
  const f = resolveColor(fg);
  const b = resolveColor(bg);
  if (!f || !b) return null;
  const l1 = luminance(f);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
