"use client";

import { useEffect } from "react";
import { useFilterParams } from "@/hooks/useFilterParams";
import { SelectFilter } from "@/components/filters";
import { Spinner } from "@/components/ui/spinner";
import { InfoTooltip } from "@/components/ui/info-tooltip";

export type SortOption = "prominence" | "alpha" | "alpha-desc" | "recent" | "affairs";
export type MandateFilter = "" | "depute" | "senateur" | "gouvernement" | "dirigeants" | "maire";
export type StatusFilter = "" | "active" | "former"; // kept for backward compat — unused in UI

const SORT_OPTIONS: Record<SortOption, string> = {
  prominence: "Notoriété",
  alpha: "A - Z",
  "alpha-desc": "Z - A",
  recent: "Plus récents",
  affairs: "Plus d'affaires",
};

const MANDATE_OPTIONS: Record<MandateFilter, string> = {
  "": "Tous les mandats",
  depute: "Députés",
  senateur: "Sénateurs",
  gouvernement: "Gouvernement",
  dirigeants: "Dirigeants de parti",
  maire: "Maires",
};

interface FilterBarProps {
  currentSort: SortOption;
  currentMandate: MandateFilter;
  currentConviction: boolean;
  convictionCount: number;
  counts: {
    deputes: number;
    senateurs: number;
    gouvernement: number;
    dirigeants: number;
    maires: number;
  };
  onLoadingChange?: (loading: boolean) => void;
}

export function FilterBar({
  currentSort,
  currentMandate,
  currentConviction,
  convictionCount,
  counts,
  onLoadingChange,
}: FilterBarProps) {
  const { isPending, updateParams } = useFilterParams();

  // Propagate loading state to parent when transition starts
  useEffect(() => {
    onLoadingChange?.(isPending);
  }, [isPending, onLoadingChange]);

  const sortOptions = (Object.entries(SORT_OPTIONS) as [SortOption, string][]).map(
    ([value, label]) => ({ value, label })
  );

  const mandateOptions = (Object.entries(MANDATE_OPTIONS) as [MandateFilter, string][]).map(
    ([value, label]) => {
      const count =
        value === "depute"
          ? counts.deputes
          : value === "senateur"
            ? counts.senateurs
            : value === "gouvernement"
              ? counts.gouvernement
              : value === "dirigeants"
                ? counts.dirigeants
                : value === "maire"
                  ? counts.maires
                  : null;
      return {
        value,
        label: count !== null ? `${label} (${count})` : label,
      };
    }
  );

  return (
    <div className="relative flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3 sm:gap-4">
      {/* Sort */}
      <div className="flex items-center gap-2">
        <label
          htmlFor="sort-select"
          className="text-sm text-muted-foreground whitespace-nowrap flex items-center gap-1"
        >
          Tri:
          {currentSort === "prominence" && <InfoTooltip term="prominence" side="bottom" />}
        </label>
        <SelectFilter
          id="sort-select"
          value={currentSort}
          onChange={(v) => updateParams({ sort: v === "alpha" ? "" : v })}
          options={sortOptions}
        />
      </div>

      {/* Mandate type filter */}
      <div className="flex items-center gap-2">
        <label htmlFor="mandate-select" className="text-sm text-muted-foreground whitespace-nowrap">
          Mandat:
        </label>
        <SelectFilter
          id="mandate-select"
          value={currentMandate}
          onChange={(v) => updateParams({ mandate: v })}
          options={mandateOptions}
        />
      </div>

      {/* Conviction filter */}
      <label
        htmlFor="conviction-toggle"
        className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer whitespace-nowrap"
      >
        <input
          id="conviction-toggle"
          type="checkbox"
          checked={currentConviction}
          onChange={(e) => updateParams({ conviction: e.target.checked ? "true" : "" })}
          className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
        />
        Condamnations ({convictionCount})
      </label>

      {/* Loading indicator — at the end so it doesn't displace filters */}
      {isPending && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground animate-in fade-in-0">
          <Spinner className="h-3.5 w-3.5" />
        </div>
      )}
    </div>
  );
}
