// Centralized color configuration for the application
// All colors have light and dark mode variants

export interface ColorVariant {
  light: string;
  dark: string;
  tailwind?: string; // Optional Tailwind class for simple cases
}

export const COLORS = {
  // Vote colors — soft green (pour), soft red (contre), gray (abstention)
  vote: {
    pour: { light: "#4a8a5c", dark: "#7ab892", tailwind: "bg-green-700" },
    contre: { light: "#9e5454", dark: "#c88a8a", tailwind: "bg-red-700" },
    abstention: { light: "#8a8e96", dark: "#6a6e78", tailwind: "bg-gray-500" },
    absent: { light: "#9498a0", dark: "#5a5e68", tailwind: "bg-gray-400" },
    nonVotant: { light: "#9498a0", dark: "#5a5e68", tailwind: "bg-gray-400" },
  },

  // Chamber colors — distinct hues matching TEXT_COLORS
  chamber: {
    AN: { light: "#1e40af", dark: "#60a5fa", tailwind: "bg-blue-800" },
    SENAT: { light: "#be185d", dark: "#f472b6", tailwind: "bg-pink-700" },
    PE: { light: "#7c3aed", dark: "#a78bfa", tailwind: "bg-violet-600" },
    GOUVERNEMENT: { light: "#047857", dark: "#34d399", tailwind: "bg-emerald-700" },
  },

  // Affair status colors — blue shades + muted red for condamnation
  affairStatus: {
    PLAINTE_DEPOSEE: { light: "#88a4c6", dark: "#5a7eaa", tailwind: "bg-blue-300" },
    SIGNALEMENT_PARQUET: { light: "#88a4c6", dark: "#5a7eaa", tailwind: "bg-blue-300" },
    ENQUETE_PRELIMINAIRE: { light: "#88a4c6", dark: "#5a7eaa", tailwind: "bg-blue-300" },
    INSTRUCTION: { light: "#7090b8", dark: "#5a7eaa", tailwind: "bg-blue-400" },
    INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN: {
      light: "#9498a0",
      dark: "#6a6e78",
      tailwind: "bg-gray-400",
    },
    MISE_EN_EXAMEN: { light: "#5a7aaa", dark: "#6a90ba", tailwind: "bg-blue-500" },
    RENVOI_TRIBUNAL: { light: "#4a6a9c", dark: "#7a9ec6", tailwind: "bg-blue-600" },
    PROCES_EN_COURS: { light: "#3a5a8e", dark: "#7a9ec6", tailwind: "bg-blue-700" },
    APPEL_EN_COURS: { light: "#2d4a7c", dark: "#7a9ec6", tailwind: "bg-blue-800" },
    CONDAMNATION_PREMIERE_INSTANCE: { light: "#b06a6a", dark: "#c88a8a", tailwind: "bg-red-600" },
    CONDAMNATION_EN_APPEL: { light: "#b06a6a", dark: "#c88a8a", tailwind: "bg-red-600" },
    POURVOI_EN_CASSATION: { light: "#b06a6a", dark: "#c88a8a", tailwind: "bg-red-600" },
    CONDAMNATION_DEFINITIVE: { light: "#9e5454", dark: "#c88a8a", tailwind: "bg-red-800" },
    RELAXE: { light: "#88a4c6", dark: "#9ab6d6", tailwind: "bg-blue-300" },
    ACQUITTEMENT: { light: "#88a4c6", dark: "#9ab6d6", tailwind: "bg-blue-300" },
    NON_LIEU: { light: "#9498a0", dark: "#6a6e78", tailwind: "bg-gray-400" },
    PRESCRIPTION: { light: "#9498a0", dark: "#5a5e68", tailwind: "bg-gray-400" },
    CLASSEMENT_SANS_SUITE: { light: "#9498a0", dark: "#5a5e68", tailwind: "bg-neutral-400" },
  },

  // Affair super-categories — distinct hues per category
  affairCategory: {
    PROBITE: { light: "#1e40af", dark: "#818cf8", tailwind: "bg-indigo-700" },
    FINANCES: { light: "#b45309", dark: "#fbbf24", tailwind: "bg-amber-700" },
    PERSONNES: { light: "#be185d", dark: "#fb7185", tailwind: "bg-rose-700" },
    EXPRESSION: { light: "#0f766e", dark: "#5eead4", tailwind: "bg-teal-700" },
  },

  // Political positions (left-right spectrum) — keep semantic colors
  position: {
    EXTREME_GAUCHE: { light: "#991b1b", dark: "#dc2626", tailwind: "bg-red-800" },
    GAUCHE: { light: "#dc2626", dark: "#ef4444", tailwind: "bg-red-600" },
    CENTRE_GAUCHE: { light: "#f97316", dark: "#fb923c", tailwind: "bg-orange-500" },
    CENTRE: { light: "#eab308", dark: "#facc15", tailwind: "bg-yellow-500" },
    CENTRE_DROIT: { light: "#3b82f6", dark: "#60a5fa", tailwind: "bg-blue-500" },
    DROITE: { light: "#1d4ed8", dark: "#3b82f6", tailwind: "bg-blue-700" },
    EXTREME_DROITE: { light: "#1e3a8a", dark: "#1d4ed8", tailwind: "bg-blue-900" },
    ECOLOGISTE: { light: "#22c55e", dark: "#4ade80", tailwind: "bg-green-500" },
  },

  // Generic UI colors — blue + muted red
  ui: {
    success: { light: "#2d4a7c", dark: "#7a9ec6", tailwind: "bg-blue-800" },
    warning: { light: "#5a7aaa", dark: "#8aaad0", tailwind: "bg-blue-500" },
    error: { light: "#9e5454", dark: "#c88a8a", tailwind: "bg-red-800" },
    info: { light: "#3a5a8e", dark: "#7a9ec6", tailwind: "bg-blue-700" },
    muted: { light: "#9498a0", dark: "#6a6e78", tailwind: "bg-gray-400" },
  },

  // Press sources
  press: {
    lemonde: { light: "#1a1a1a", dark: "#e5e5e5", tailwind: "bg-neutral-900" },
    politico: { light: "#9e5454", dark: "#c88a8a", tailwind: "bg-red-800" },
    mediapart: { light: "#3a5a8e", dark: "#7a9ec6", tailwind: "bg-blue-700" },
  },

  // Chart colors — monochromatic blue shades
  chart: {
    primary: { light: "#2d4a7c", dark: "#7a9ec6" },
    secondary: { light: "#3a5a8e", dark: "#8aaad0" },
    tertiary: { light: "#4a6a9c", dark: "#6a90ba" },
    quaternary: { light: "#5a7aaa", dark: "#5a7eaa" },
    quinary: { light: "#7090b8", dark: "#9ab6d6" },
  },
} as const;

/**
 * Accents for the shared `StatCard`. `border` doubles as the count text color
 * and `bg` only shows when the card is active, hence the low-alpha overlays.
 *
 * Unlike `COLORS` these carry no dark variant: `StatCard` applies them inline,
 * so the same value is used in both themes. Making the card theme-aware is a
 * separate change; centralizing here at least stops each page from inventing
 * its own accent.
 */
export const STAT_ACCENTS = {
  primary: { border: "#2563eb", bg: "#2563eb0a" },
  warning: { border: "#d97706", bg: "#d9770610" },
} as const;

// Type helpers
export type ColorCategory = keyof typeof COLORS;

/**
 * Get a color value by path
 * @param category - The color category (e.g., 'vote', 'chamber')
 * @param key - The specific color key (e.g., 'pour', 'AN')
 * @param theme - 'light' or 'dark'
 * @returns The hex color value
 */
export function getColor(
  category: ColorCategory,
  key: string,
  theme: "light" | "dark" = "light"
): string {
  const categoryColors = COLORS[category] as Record<string, ColorVariant>;
  const colorVariant = categoryColors?.[key];
  if (!colorVariant) {
    // Missing color — return fallback
    return theme === "light" ? "#888888" : "#666666";
  }
  return colorVariant[theme];
}
