import { findDepartmentCode } from "@/config/departments";

export { findDepartmentCode };

/**
 * Format a number as euros (e.g., 1234567 → "1 234 567 €")
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Normalize a query for matching: lowercase, strip accents and punctuation.
 */
export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:'"()]/g, "")
    .trim();
}

/**
 * Extract temporal modifiers from a query.
 * Returns a date filter object if temporal keywords are found.
 */
export function extractTemporalModifiers(query: string): {
  since?: Date;
  year?: number;
  label?: string;
} | null {
  const lower = query.toLowerCase();
  const now = new Date();

  // "en 2025", "en 2024"
  const yearMatch = lower.match(/en\s+(20\d{2})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]!);
    return { year, label: `en ${year}` };
  }

  // "cette année", "cette annee"
  if (lower.includes("cette ann")) {
    return {
      since: new Date(now.getFullYear(), 0, 1),
      year: now.getFullYear(),
      label: `en ${now.getFullYear()}`,
    };
  }

  // "récent", "récemment", "dernier", "dernière"
  if (
    lower.includes("récen") ||
    lower.includes("recen") ||
    lower.includes("dernier") ||
    lower.includes("dernièr")
  ) {
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    return { since: threeMonthsAgo, label: "ces 3 derniers mois" };
  }

  return null;
}

/**
 * Extract a person name from a query, given a matched regex.
 * Cleans up common prefixes/suffixes.
 */
export function extractPersonName(raw: string): string {
  return raw
    .replace(/\s*\?+$/, "")
    .replace(/^(de |du |d'|l'|la |le )/i, "")
    .trim();
}

/**
 * Status labels for legislative dossiers.
 */
export const DOSSIER_STATUS_LABELS: Record<string, string> = {
  DEPOSE: "Déposé",
  EN_COMMISSION: "En commission",
  EN_COURS: "En discussion",
  CONSEIL_CONSTITUTIONNEL: "Conseil constitutionnel",
  ADOPTE: "Adopté",
  REJETE: "Rejeté",
  RETIRE: "Retiré",
  CADUQUE: "Caduc",
};

/**
 * Status labels for affairs.
 */
export const AFFAIR_STATUS_LABELS: Record<string, string> = {
  MISE_EN_EXAMEN: "Mis(e) en examen",
  PROCES_EN_COURS: "Procès en cours",
  CONDAMNATION_DEFINITIVE: "Condamnation définitive",
  RELAXE: "Relaxé(e)",
  ACQUITTEMENT: "Acquitté(e)",
  APPEL_EN_COURS: "Appel en cours",
  POURVOI_EN_CASSATION: "Condamnation non définitive, pourvoi en cassation en cours",
  PRESCRIPTION: "Prescrit",
  NON_LIEU: "Non-lieu",
  ENQUETE: "Enquête en cours",
};
