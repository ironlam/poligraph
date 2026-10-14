import type { BandeauFilterOption } from "@/components/ui/BandeauFilterForm";
import { FACTCHECK_RATING_LABELS } from "@/config/labels";
import type { FactCheckRating } from "@/types";

/**
 * Options of the /factchecks filters, shared by the landing banner form and the filter bar so both
 * offer the same values, labels and order.
 */
export const FACTCHECK_RATING_OPTIONS: FactCheckRating[] = [
  "FALSE",
  "MOSTLY_FALSE",
  "MISLEADING",
  "OUT_OF_CONTEXT",
  "HALF_TRUE",
  "MOSTLY_TRUE",
  "TRUE",
  "UNVERIFIABLE",
];

/** Super-categories grouping individual ratings. */
export const FACTCHECK_VERDICT_GROUPS: {
  value: string;
  label: string;
  ratings: FactCheckRating[];
}[] = [
  { value: "faux", label: "Faux / Plutôt faux", ratings: ["FALSE", "MOSTLY_FALSE"] },
  {
    value: "trompeur",
    label: "Trompeur / Partiel",
    ratings: ["MISLEADING", "OUT_OF_CONTEXT", "HALF_TRUE"],
  },
  { value: "vrai", label: "Vrai / Plutôt vrai", ratings: ["TRUE", "MOSTLY_TRUE"] },
];

export function sourceFilterOptions(
  sources: { name: string; count: number }[]
): BandeauFilterOption[] {
  return [
    { value: "", label: "Toutes les sources" },
    ...sources.map((s) => ({ value: s.name, label: `${s.name} (${s.count})` })),
  ];
}

/** Groups first, then single ratings; options with no fact-check are left out. */
export function verdictFilterOptions(ratingCounts: Record<string, number>): BandeauFilterOption[] {
  const groups = FACTCHECK_VERDICT_GROUPS.flatMap((group) => {
    const count = group.ratings.reduce((sum, r) => sum + (ratingCounts[r] || 0), 0);
    return count > 0 ? [{ value: group.value, label: `${group.label} (${count})` }] : [];
  });
  const ratings = FACTCHECK_RATING_OPTIONS.flatMap((rating) => {
    const count = ratingCounts[rating] || 0;
    return count > 0
      ? [{ value: rating, label: `${FACTCHECK_RATING_LABELS[rating]} (${count})` }]
      : [];
  });
  return [
    { value: "", label: "Tous les verdicts" },
    ...groups,
    // Own value: a disabled option sharing "" would become the default selection and drop the field.
    { value: "separateur", label: "────────", disabled: true },
    ...ratings,
  ];
}
