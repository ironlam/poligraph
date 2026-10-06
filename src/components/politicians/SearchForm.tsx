"use client";

import { useRouter } from "next/navigation";
import { SearchAutocomplete } from "./SearchAutocomplete";
import Link from "next/link";

interface SearchFormProps {
  defaultSearch: string;
  partyFilter: string;
  convictionFilter: boolean;
  financingFilter: boolean;
  mandateFilter: string;
  sortOption: string;
}

export function SearchForm({
  defaultSearch,
  partyFilter,
  convictionFilter,
  financingFilter,
  mandateFilter,
  sortOption,
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
          className="h-9 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium transition-colors"
        >
          Rechercher
        </button>
        {hasFilters && (
          <Link
            href="/politiques"
            className="h-9 flex items-center px-4 border rounded-md hover:bg-muted text-sm text-muted-foreground transition-colors"
          >
            Réinitialiser
          </Link>
        )}
      </div>
    </div>
  );
}
