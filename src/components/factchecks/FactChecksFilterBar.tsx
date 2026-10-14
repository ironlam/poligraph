"use client";

import { useFilterParams } from "@/hooks/useFilterParams";
import { DebouncedSearchInput } from "@/components/filters";
import { FilterBarShell } from "@/components/filters/FilterBarShell";
import { sourceFilterOptions, verdictFilterOptions } from "./factchecks-filter-options";
import { PoliticianFilterAutocomplete } from "./PoliticianFilterAutocomplete";
import { PoliticianFilterBanner } from "./PoliticianFilterBanner";

interface PoliticianContext {
  fullName: string;
  slug: string;
  photoUrl: string | null;
  blobPhotoUrl: string | null;
  party: string | null;
  factcheckCount: number;
}

interface FactChecksFilterBarProps {
  currentFilters: {
    search: string;
    source: string;
    verdict: string;
    politician: string;
    directOnly: boolean;
  };
  sources: Array<{ name: string; count: number }>;
  ratingCounts: Record<string, number>;
  politicianContext: PoliticianContext | null;
}

const selectClassName =
  "h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer hover:border-primary/50 transition-colors";

export function FactChecksFilterBar({
  currentFilters,
  sources,
  ratingCounts,
  politicianContext,
}: FactChecksFilterBarProps) {
  const { isPending, updateParams } = useFilterParams();

  return (
    <FilterBarShell isPending={isPending} className="space-y-3">
      {/* Filters row: search + politician + source + verdict */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <DebouncedSearchInput
          id="search-factchecks"
          value={currentFilters.search}
          onSearch={(v) => updateParams({ search: v })}
          placeholder="Mot-clé..."
          label="Recherche"
        />

        <PoliticianFilterAutocomplete onSelect={(slug) => updateParams({ politician: slug })} />

        <div>
          <label
            htmlFor="source-factchecks"
            className="text-xs font-medium text-muted-foreground mb-1 block"
          >
            Source
          </label>
          <select
            id="source-factchecks"
            value={currentFilters.source}
            onChange={(e) => updateParams({ source: e.target.value })}
            className={selectClassName}
          >
            {sourceFilterOptions(sources).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="verdict-factchecks"
            className="text-xs font-medium text-muted-foreground mb-1 block"
          >
            Verdict
          </label>
          <select
            id="verdict-factchecks"
            value={currentFilters.verdict}
            onChange={(e) => updateParams({ verdict: e.target.value })}
            className={selectClassName}
          >
            {verdictFilterOptions(ratingCounts).map((o) => (
              <option key={o.value || o.label} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Direct claims toggle */}
      <label
        htmlFor="direct-only-factchecks"
        className="flex items-center gap-2 cursor-pointer w-fit"
      >
        <input
          id="direct-only-factchecks"
          type="checkbox"
          checked={currentFilters.directOnly}
          onChange={(e) => updateParams({ directOnly: e.target.checked ? "1" : "" })}
          className="rounded border-input text-primary focus:ring-ring h-4 w-4 cursor-pointer"
        />
        <span className="text-sm text-muted-foreground">Propos directs uniquement</span>
      </label>

      {/* Politician context banner */}
      {politicianContext && (
        <PoliticianFilterBanner
          {...politicianContext}
          onDismiss={() => updateParams({ politician: "" })}
        />
      )}
    </FilterBarShell>
  );
}
