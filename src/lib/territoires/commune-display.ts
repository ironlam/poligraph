import type { CommuneDossier } from "@/lib/data/territoires";

/**
 * Pure wording of the Territoires commune page (#1052), shared by the page, its metadata and its
 * Open Graph image so the three say the same thing. Every helper returns null rather than a
 * placeholder when the fact is missing: an absence is a state, never a zero or a dash.
 */

const NBSP = "\u00a0";

/**
 * `toLocaleString("fr-FR")` groups thousands with U+202F, which the display font does not draw:
 * "230 890" rendered as "230890". A plain no-break space keeps the grouping visible.
 */
function frNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString("fr-FR", options).replace(/\u202f/g, NBSP);
}

/** "1re circonscription", "3e circonscription". */
export function formatCirconscription(n: number): string {
  return `${n === 1 ? "1re" : `${n}e`} circonscription`;
}

export function formatPct(value: number): string {
  return `${frNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${NBSP}%`;
}

/** "1 234" with a visible thousands separator. */
export function formatCount(value: number): string {
  return frNumber(value);
}

export function formatPopulation(value: number): string {
  return `${frNumber(value)} habitant${value > 1 ? "s" : ""}`;
}

/** Department label for the pastille and the breadcrumb: "Ille-et-Vilaine (35)". */
export function territoireLabel(identity: CommuneDossier["identity"]): string {
  const name = identity.department.name ?? identity.territoireHorsRegion?.name ?? null;
  return name ? `${name} (${identity.department.code})` : identity.department.code;
}

/** Start of the mayor's current function, falling back to the mandate start. */
export function maireSince(maire: CommuneDossier["maire"]): string | null {
  return maire.functionStart ?? maire.mandateStart;
}

/**
 * Nominative title (D14). The department code disambiguates the many homonyms (Saint-Denis 93
 * and 974). "maire" is promised only when a mayor is established, "résultats" only when there are.
 */
export function communeTitle(dossier: CommuneDossier): string {
  const parts = [
    dossier.maire.state === "ETABLI" ? "maire" : null,
    "élus",
    dossier.elections.municipales2026?.state === "DISPONIBLE" ? "résultats" : null,
  ].filter((p): p is string => p !== null);
  // "Papeete : élus" alone reads truncated: without mayor nor results, say what the page holds.
  const list =
    parts.length > 1
      ? `${parts.slice(0, -1).join(", ")} et ${parts.at(-1)}`
      : "élus et informations publiques";
  return `${dossier.identity.name} (${dossier.identity.department.code}) : ${list}`;
}

export function communeDescription(dossier: CommuneDossier): string {
  const { identity, maire, population } = dossier;
  const where = identity.department.name ?? identity.territoireHorsRegion?.name ?? null;
  const sentences = [
    `Commune de ${identity.name}${where ? ` (${where})` : ""}, code INSEE ${identity.inseeCode}.`,
    maire.state === "ETABLI" && maire.person ? `Maire : ${maire.person.fullName}.` : null,
    population.value != null ? `Population : ${formatPopulation(population.value)}.` : null,
    "Parlementaires et élections, avec leurs sources.",
  ];
  return sentences.filter(Boolean).join(" ");
}

/**
 * Function noun agreed with the recorded civility; null when the civility is unknown, so the
 * caller rephrases without a gendered noun rather than guessing (no "député·e").
 */
export function deputeNoun(civility: string | null): "députée" | "député" | null {
  if (civility === "Mme") return "députée";
  if (civility === "M.") return "député";
  return null;
}
