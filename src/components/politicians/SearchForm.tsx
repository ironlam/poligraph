"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { SearchAutocomplete } from "./SearchAutocomplete";
import Link from "next/link";

interface SearchFormProps {
  defaultSearch: string;
  partyFilter: string;
  convictionFilter: boolean;
  financingFilter: boolean;
  mandateFilter: string;
  sortOption: string;
  /** `marine`: on the navy banner of the landing page. `clair`: on the page background. */
  tone?: "marine" | "clair";
}

export function SearchForm({
  defaultSearch,
  partyFilter,
  convictionFilter,
  financingFilter,
  mandateFilter,
  sortOption,
  tone = "clair",
}: SearchFormProps) {
  const router = useRouter();

  const handleSearch = (query: string) => {
    const params = new URLSearchParams();
    if (query) params.set("search", query);
    if (partyFilter) params.set("party", partyFilter);
    if (convictionFilter) params.set("conviction", "true");
    if (financingFilter) params.set("financing", "true");
    if (mandateFilter) params.set("mandate", mandateFilter);
    if (sortOption && sortOption !== "alpha") params.set("sort", sortOption);

    const queryString = params.toString();
    router.push(`/politiques${queryString ? `?${queryString}` : ""}`);
  };

  const hasFilters =
    defaultSearch || partyFilter || convictionFilter || financingFilter || mandateFilter;

  if (tone === "marine") {
    // White field on the navy banner, as TerritoireSearch: the input keeps dark text in dark mode.
    return (
      <div className="flex items-stretch gap-2 rounded-xl bg-white p-1.5 [&_input]:border-0 [&_input]:bg-transparent [&_input]:text-base [&_input]:text-neutral-900 [&_input]:shadow-none [&_input]:placeholder:text-neutral-600">
        <SearchAutocomplete
          defaultValue={defaultSearch}
          placeholder="Rechercher un représentant..."
          onSearch={handleSearch}
          className="min-w-0 max-w-none flex-1"
        />
        <button
          type="button"
          onClick={() => handleSearch(defaultSearch)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-primary px-3 font-bold text-primary-foreground hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-5"
        >
          <Search className="h-5 w-5 sm:hidden" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Rechercher</span>
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/40 p-4">
      <div className="flex gap-3 flex-wrap items-center">
        <SearchAutocomplete
          defaultValue={defaultSearch}
          placeholder="Rechercher un représentant..."
          onSearch={handleSearch}
        />
        <button
          type="button"
          onClick={() => handleSearch(defaultSearch)}
          className="h-11 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium transition-colors"
        >
          Rechercher
        </button>
        {hasFilters && (
          <Link
            href="/politiques"
            className="h-11 flex items-center px-4 border rounded-md hover:bg-muted text-sm text-muted-foreground transition-colors"
          >
            Réinitialiser
          </Link>
        )}
      </div>
    </div>
  );
}
