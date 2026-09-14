/**
 * Canonical form used for public lookup of a dossier alias.
 *
 * "Loi Duplomb", "loi-duplomb" and "duplomb" must resolve identically. The
 * leading word is a search affordance, not part of the distinctive alias.
 */
export function normalizeDossierAlias(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bloi\b/g, " ")
    .replace(/[’'_-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
