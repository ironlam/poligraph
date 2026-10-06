"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PoliticianCard } from "./PoliticianCard";
import { FilterBar, type SortOption, type MandateFilter } from "./FilterBar";
import { Badge } from "@/components/ui/badge";
import { PartySelect } from "./PartySelect";
import type { PoliticianWithPartyAndCounts, Party } from "@/types";

interface PoliticiansGridProps {
  politicians: PoliticianWithPartyAndCounts[];
  total: number;
  page: number;
  totalPages: number;
  parties: (Party & { _count: { politicians: number } })[];
  counts: {
    withConviction: number;
    deputes: number;
    senateurs: number;
    gouvernement: number;
    dirigeants: number;
    maires: number;
  };
  filters: {
    search: string;
    partyFilter: string;
    convictionFilter: boolean;
    mandateFilter: MandateFilter;
    sortOption: SortOption;
  };
  showMissingDeclarationBadge?: boolean;
}

export function PoliticiansGrid({
  politicians,
  total: _total,
  page,
  totalPages,
  parties,
  counts,
  filters,
  showMissingDeclarationBadge = false,
}: PoliticiansGridProps) {
  const router = useRouter();
  const _searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const { search, partyFilter, convictionFilter, mandateFilter, sortOption } = filters;

  // Build URL with current filters
  function buildUrl(newParams: Record<string, string | undefined>) {
    const url = new URLSearchParams();
    const finalParams = {
      search: search || undefined,
      party: partyFilter || undefined,
      conviction: convictionFilter ? "true" : undefined,
      mandate: mandateFilter || undefined,
      status: undefined,
      sort: sortOption !== "alpha" ? sortOption : undefined,
      page: undefined,
      ...newParams,
    };

    Object.entries(finalParams).forEach(([key, value]) => {
      if (value) url.set(key, value);
    });

    const queryString = url.toString();
    return `/politiques${queryString ? `?${queryString}` : ""}`;
  }

  const navigateTo = (url: string) => {
    startTransition(() => {
      router.push(url);
    });
  };

  // Count active filters
  const activeFilterCount = [partyFilter, convictionFilter, mandateFilter].filter(Boolean).length;

  return (
    <>
      {/* Filters and sort */}
      <div className="mb-6 rounded-lg border bg-muted/40 p-4 space-y-3">
        {/* Sort and mandate/status filters */}
        <FilterBar
          currentSort={sortOption}
          currentMandate={mandateFilter}
          currentConviction={convictionFilter}
          convictionCount={counts.withConviction}
          counts={{
            deputes: counts.deputes,
            senateurs: counts.senateurs,
            gouvernement: counts.gouvernement,
            dirigeants: counts.dirigeants,
            maires: counts.maires,
          }}
        />

        {/* Party filter */}
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3 sm:gap-4 pt-1 border-t">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Parti:</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par parti">
              <Badge
                variant={partyFilter === "" ? "default" : "outline"}
                className="cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={() => navigateTo(buildUrl({ party: undefined }))}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && navigateTo(buildUrl({ party: undefined }))}
              >
                Tous
              </Badge>
              {parties.slice(0, 6).map((party) => (
                <Badge
                  key={party.id}
                  variant={partyFilter === party.id ? "default" : "outline"}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => navigateTo(buildUrl({ party: party.id }))}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && navigateTo(buildUrl({ party: party.id }))}
                  title={party.name}
                  style={{
                    backgroundColor:
                      partyFilter === party.id ? party.color || undefined : undefined,
                    borderColor: party.color || undefined,
                  }}
                >
                  {party.shortName}
                </Badge>
              ))}
              {parties.length > 6 && (
                <PartySelect parties={parties.slice(6)} currentValue={partyFilter} />
              )}
            </div>
          </div>

          {/* Conviction filter */}
          <div className="flex items-center gap-2 sm:border-l sm:pl-4">
            <Badge
              variant={convictionFilter ? "destructive" : "outline"}
              className="cursor-pointer hover:bg-destructive/10 transition-colors"
              onClick={() =>
                navigateTo(buildUrl({ conviction: convictionFilter ? undefined : "true" }))
              }
              role="button"
              tabIndex={0}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                navigateTo(buildUrl({ conviction: convictionFilter ? undefined : "true" }))
              }
              title="Condamnation définitive pour atteinte à la probité"
            >
              Condamnés pour probité ({counts.withConviction})
            </Badge>
          </div>
        </div>
      </div>

      {/* Active filters summary */}
      {activeFilterCount > 0 && (
        <div className="mb-6 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtres actifs :</span>
          <button
            onClick={() => navigateTo("/politiques")}
            className="text-primary hover:underline"
          >
            Tout effacer
          </button>
        </div>
      )}

      {/* Results */}
      {politicians.length > 0 ? (
        <>
          <div
            className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 transition-opacity duration-200 ${
              isPending ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            {isPending && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <div className="bg-background/80 rounded-lg p-4 shadow-lg flex items-center gap-3">
                  <svg
                    className="animate-spin h-5 w-5 text-primary"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span className="text-sm font-medium">Chargement...</span>
                </div>
              </div>
            )}
            {politicians.map((politician) => (
              <PoliticianCard
                key={politician.id}
                politician={politician}
                showConvictionBadge
                showMissingDeclarationBadge={showMissingDeclarationBadge}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className="mt-8 flex justify-center items-center gap-2" aria-label="Pagination">
              <button
                onClick={() => navigateTo(buildUrl({ page: String(page - 1) }))}
                className="inline-flex items-center gap-1 px-4 py-2 border rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                disabled={isPending || page <= 1}
                aria-label="Page précédente"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="hidden sm:inline">Précédent</span>
              </button>
              <span className="px-4 py-2 text-sm text-muted-foreground tabular-nums">
                Page <span className="font-medium text-foreground">{page}</span> sur{" "}
                <span className="font-medium text-foreground">{totalPages}</span>
              </span>
              <button
                onClick={() => navigateTo(buildUrl({ page: String(page + 1) }))}
                className="inline-flex items-center gap-1 px-4 py-2 border rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                disabled={isPending || page >= totalPages}
                aria-label="Page suivante"
              >
                <span className="hidden sm:inline">Suivant</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </nav>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Aucun résultat trouvé</p>
          <button
            onClick={() => navigateTo("/politiques")}
            className="text-primary hover:underline mt-2 inline-block"
          >
            Voir tous les représentants
          </button>
        </div>
      )}
    </>
  );
}
