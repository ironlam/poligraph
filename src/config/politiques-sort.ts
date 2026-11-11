/**
 * Tri de la liste /politiques. Sans directive : partagé entre la page (serveur) et les
 * composants client qui reconstruisent l'URL.
 *
 * Invariant : le tri par défaut est le seul qui ne s'écrit pas dans l'URL. La page le
 * relit comme valeur de repli, et l'URL canonique comme l'indexation de la liste nue
 * reposent sur son absence. Un second « défaut » codé ailleurs rend un tri
 * impossible à sélectionner.
 */
export const POLITIQUES_SORT_OPTIONS = ["prominence", "alpha", "alpha-desc", "recent"] as const;

export type SortOption = (typeof POLITIQUES_SORT_OPTIONS)[number];

export const DEFAULT_POLITIQUES_SORT: SortOption = "prominence";

export function parsePolitiquesSort(raw: string | undefined): SortOption {
  const known = (POLITIQUES_SORT_OPTIONS as readonly string[]).includes(raw ?? "");
  if (known) return raw as SortOption;
  return DEFAULT_POLITIQUES_SORT;
}

/** Valeur de `?sort=` pour un tri : chaîne vide quand le paramètre doit être omis. */
export function politiquesSortParam(sort: string | undefined): string {
  const parsed = parsePolitiquesSort(sort);
  if (parsed === DEFAULT_POLITIQUES_SORT) return "";
  return parsed;
}
