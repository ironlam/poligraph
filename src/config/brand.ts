// Canonical Poligraph brand colors. These are visual-identity constants and must
// stay independent from semantic UI tokens (--brand / --destructive / --primary),
// which change with the theme and carry a "signal/danger" meaning.
export const BRAND_NAVY = "#002654";
export const BRAND_RED = "#ed2939";
export const BRAND_PAGE = "#ffffff";

// Allowed fill/stroke colors for the static brand SVGs (guarded by a test).
export const BRAND_SVG_COLORS = [BRAND_NAVY, BRAND_RED, BRAND_PAGE] as const;
