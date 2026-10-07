"use client";

import { useFilterParams } from "@/hooks/useFilterParams";
import { DebouncedSearchInput } from "@/components/filters";
import { FilterBarShell } from "@/components/filters/FilterBarShell";
import { FACTCHECK_RATING_LABELS } from "@/config/labels";
import { PoliticianFilterAutocomplete } from "./PoliticianFilterAutocomplete";
import { PoliticianFilterBanner } from "./PoliticianFilterBanner";
import type { FactCheckRating } from "@/types";

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

const RATING_OPTIONS: FactCheckRating[] = [
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
const VERDICT_GROUPS: { value: string; label: string; ratings: FactCheckRating[] }[] = [
  { value: "faux", label: "Faux / Plutôt faux", ratings: ["FALSE", "MOSTLY_FALSE"] },
  {
    value: "trompeur",
    label: "Trompeur / Partiel",
    ratings: ["MISLEADING", "OUT_OF_CONTEXT", "HALF_TRUE"],
  },
  { value: "vrai", label: "Vrai / Plutôt vrai", ratings: ["TRUE", "MOSTLY_TRUE"] },
];

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
            <option value="">Toutes les sources</option>
            {sources.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} ({s.count})
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
            <option value="">Tous les verdicts</option>
            {VERDICT_GROUPS.map((group) => {
              const count = group.ratings.reduce((sum, r) => sum + (ratingCounts[r] || 0), 0);
              if (count === 0) return null;
              return (
                <option key={group.value} value={group.value}>
                  {group.label} ({count})
                </option>
              );
            })}
            <option disabled>────────</option>
            {RATING_OPTIONS.map((rating) => {
              const count = ratingCounts[rating] || 0;
              if (count === 0) return null;
              return (
                <option key={rating} value={rating}>
                  {FACTCHECK_RATING_LABELS[rating]} ({count})
                </option>
              );
            })}
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
