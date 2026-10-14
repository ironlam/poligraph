import type { BandeauFilterOption } from "@/components/ui/BandeauFilterForm";
import { AFFAIR_SUPER_CATEGORY_LABELS, type AffairSuperCategory } from "@/config/labels";
import { CERTAINTY_LABELS, CERTAINTY_SORT_ORDER, type CertaintyLevel } from "@/config/certainty";

/**
 * Options of the /affaires filters, shared by the landing banner form and the filter bar so both
 * offer the same values, labels and order.
 */
export type AffairesFilterOption = BandeauFilterOption;

export const AFFAIRES_SORT_OPTIONS: Record<string, string> = {
  "": "Plus récentes",
  certainty: "Par certitude",
  "date-asc": "Plus anciennes",
  "name-asc": "Nom A-Z",
  "name-desc": "Nom Z-A",
};

export const AFFAIR_SUPER_CATEGORIES: AffairSuperCategory[] = [
  "PROBITE",
  "FINANCES",
  "PERSONNES",
  "EXPRESSION",
  "AUTRE",
];

export const CERTAINTY_LEVELS_ORDERED = (Object.keys(CERTAINTY_LABELS) as CertaintyLevel[]).sort(
  (a, b) => CERTAINTY_SORT_ORDER[a] - CERTAINTY_SORT_ORDER[b]
);

/** Levels with no listed card are left out: an option must never lead to an empty list. */
export function certaintyFilterOptions(
  counts: Record<string, number>
): (AffairesFilterOption & { level?: CertaintyLevel })[] {
  return [
    { value: "", label: "Toutes" },
    ...CERTAINTY_LEVELS_ORDERED.filter((level) => (counts[level] ?? 0) > 0).map((level) => ({
      value: level,
      level,
      label: `${CERTAINTY_LABELS[level]} (${counts[level] ?? 0})`,
    })),
  ];
}

export function superCategoryFilterOptions(counts: Record<string, number>): AffairesFilterOption[] {
  return [
    { value: "", label: "Toutes" },
    ...AFFAIR_SUPER_CATEGORIES.map((superCat) => ({
      value: superCat,
      label: `${AFFAIR_SUPER_CATEGORY_LABELS[superCat]} (${counts[superCat] ?? 0})`,
    })),
  ];
}

export function partyFilterOptions(
  parties: { slug: string; shortName: string; count: number }[]
): AffairesFilterOption[] {
  return [
    { value: "", label: "Tous les partis" },
    ...parties.map((p) => ({ value: p.slug, label: `${p.shortName} (${p.count})` })),
  ];
}

export function sortFilterOptions(): AffairesFilterOption[] {
  return Object.entries(AFFAIRES_SORT_OPTIONS).map(([value, label]) => ({ value, label }));
}
