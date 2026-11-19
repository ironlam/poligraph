"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { HubCandidacy } from "@/lib/data/hub";
import {
  CANDIDACY_FILTERS,
  CANDIDACY_FILTER_LABELS,
  CANDIDACY_SORTS,
  CANDIDACY_SORT_NOTES,
  CANDIDACY_SORT_LABELS,
  matchesCandidacyFilter,
  matchesCandidacyQuery,
  matchesPublishedProposals,
  parseCandidacyFilter,
  parseCandidacySort,
  sortCandidacies,
  type CandidacyFilter,
  type CandidacySort,
} from "@/lib/presidentielle/candidacy-filters";
import { CandidacyDirectoryLink } from "./CandidacyDirectoryLink";

export function CandidacyCard({
  candidacy,
  onNavigate,
}: {
  candidacy: HubCandidacy;
  onNavigate?: () => void;
}) {
  return <CandidacyDirectoryLink candidacy={candidacy} onNavigate={onNavigate} />;
}

export function CandidacyFieldBrowser({ candidacies }: { candidacies: HubCandidacy[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const urlStatus = parseCandidacyFilter(searchParams.get("statut"));
  const urlPublishedOnly = searchParams.get("propositions") === "publiees";
  const [query, setQuery] = useState(urlQuery);
  const [status, setStatus] = useState<CandidacyFilter>(urlStatus);
  const [publishedOnly, setPublishedOnly] = useState(urlPublishedOnly);
  const [sort, setSort] = useState<CandidacySort>(parseCandidacySort(searchParams.get("tri")));
  // Below sm the status pills and the checkbox are folded behind one button, so the first
  // candidates show without scrolling. From sm up they are always visible.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const pendingQuerySync = useRef<number | null>(null);
  const lastWrittenQuery = useRef<string | null>(null);

  const counts = Object.fromEntries(
    CANDIDACY_FILTERS.map((key) => [
      key,
      candidacies.filter((candidacy) => matchesCandidacyFilter(candidacy, key)).length,
    ])
  ) as Record<CandidacyFilter, number>;
  const visible = sortCandidacies(
    candidacies.filter(
      (candidacy) =>
        matchesCandidacyFilter(candidacy, status) &&
        matchesPublishedProposals(candidacy, publishedOnly) &&
        matchesCandidacyQuery(candidacy, query)
    ),
    sort
  );
  const hasActiveFilters = status !== "toutes" || publishedOnly || query.trim() !== "";
  const foldedFilterCount = Number(status !== "toutes") + Number(publishedOnly);
  const foldedClass = filtersOpen ? "" : "max-sm:hidden";

  const cancelPendingQuerySync = useCallback(() => {
    if (pendingQuerySync.current === null) return;
    window.clearTimeout(pendingQuerySync.current);
    pendingQuerySync.current = null;
  }, []);

  const writeUrl = useCallback(
    (next: { statut: CandidacyFilter; q: string; publishedOnly: boolean }) => {
      lastWrittenQuery.current = next.q.trim();
      const params = new URLSearchParams(searchParams.toString());
      // The order is written by `selectSort`, outside of this snapshot: carry it over.
      const tri = new URLSearchParams(window.location.search).get("tri");
      if (tri === null) params.delete("tri");
      else params.set("tri", tri);
      if (next.statut === "toutes") params.delete("statut");
      else params.set("statut", next.statut);
      if (next.q.trim() === "") params.delete("q");
      else params.set("q", next.q.trim());
      if (next.publishedOnly) params.set("propositions", "publiees");
      else params.delete("propositions");
      const value = params.toString();
      window.history.replaceState(null, "", value === "" ? pathname : `${pathname}?${value}`);
    },
    [pathname, searchParams]
  );

  useEffect(() => {
    if (query === urlQuery || query.trim() === lastWrittenQuery.current) return;
    const timeout = window.setTimeout(() => {
      pendingQuerySync.current = null;
      writeUrl({ statut: status, q: query, publishedOnly });
    }, 250);
    pendingQuerySync.current = timeout;
    return () => {
      window.clearTimeout(timeout);
      if (pendingQuerySync.current === timeout) pendingQuerySync.current = null;
    };
  }, [publishedOnly, query, status, urlQuery, writeUrl]);

  function selectStatus(nextStatus: CandidacyFilter) {
    cancelPendingQuerySync();
    setStatus(nextStatus);
    writeUrl({ statut: nextStatus, q: query, publishedOnly });
  }

  function selectPublishedOnly(nextPublishedOnly: boolean) {
    cancelPendingQuerySync();
    setPublishedOnly(nextPublishedOnly);
    writeUrl({ statut: status, q: query, publishedOnly: nextPublishedOnly });
  }

  function selectSort(nextSort: CandidacySort) {
    setSort(nextSort);
    // Written straight to the address: the order is not a filter, so it stays out of `writeUrl`
    // and survives "Réinitialiser les filtres".
    const params = new URLSearchParams(window.location.search);
    if (nextSort === "alphabetique") params.delete("tri");
    else params.set("tri", nextSort);
    const value = params.toString();
    window.history.replaceState(null, "", value === "" ? pathname : `${pathname}?${value}`);
  }

  function resetFilters() {
    cancelPendingQuerySync();
    setQuery("");
    setStatus("toutes");
    setPublishedOnly(false);
    writeUrl({ statut: "toutes", q: "", publishedOnly: false });
  }

  return (
    <div className="space-y-3 sm:space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:gap-4 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex w-full max-w-xl items-end gap-2">
            <label className="block min-w-0 flex-1 text-sm font-semibold">
              <span className="max-sm:sr-only">Rechercher une personne ou un parti</span>
              <span className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 font-normal focus-within:ring-2 focus-within:ring-primary sm:mt-2">
                <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Personne ou parti"
                  className="min-w-0 flex-1 bg-transparent outline-none"
                />
                {query !== "" && (
                  <button
                    type="button"
                    onClick={() => {
                      cancelPendingQuerySync();
                      setQuery("");
                      writeUrl({ statut: status, q: "", publishedOnly });
                    }}
                    aria-label="Effacer la recherche"
                    title="Effacer la recherche"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                  </button>
                )}
              </span>
            </label>
            <button
              type="button"
              aria-expanded={filtersOpen}
              aria-controls="candidacy-filters"
              onClick={() => setFiltersOpen((open) => !open)}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-semibold hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
            >
              <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
              Filtrer
              {foldedFilterCount > 0 && <span>({foldedFilterCount})</span>}
            </button>
          </div>

          <label
            className={`flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium ${foldedClass}`}
          >
            <input
              type="checkbox"
              checked={publishedOnly}
              onChange={(event) => selectPublishedOnly(event.target.checked)}
              className="h-5 w-5 rounded border-border accent-primary"
            />
            Avec des propositions publiées
          </label>
        </div>

        <fieldset id="candidacy-filters" className={`space-y-2 ${foldedClass}`}>
          <legend className="text-sm font-semibold">Statut public</legend>
          <div className="-mx-4 px-4 pb-1">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {CANDIDACY_FILTERS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={key === status}
                  onClick={() => selectStatus(key)}
                  className={`min-h-11 w-full rounded-full border px-2 text-xs font-medium leading-tight sm:w-auto sm:px-4 sm:text-sm ${
                    key === status
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:border-primary hover:text-primary"
                  }`}
                >
                  {CANDIDACY_FILTER_LABELS[key]} ({counts[key]})
                </button>
              ))}
            </div>
          </div>
        </fieldset>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 sm:min-h-11">
        <p
          aria-live="polite"
          className="min-w-0 flex-1 text-sm font-medium text-muted-foreground-strong max-sm:text-xs"
        >
          {visible.length}{" "}
          {visible.length === 1 ? "personnalité affichée" : "personnalités affichées"}
        </p>
        <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground-strong">
          <span className="max-sm:sr-only">Trier</span>
          <select
            value={sort}
            onChange={(event) => selectSort(parseCandidacySort(event.target.value))}
            aria-label="Trier les candidatures"
            className="min-h-11 rounded-xl border border-border bg-background px-2 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {CANDIDACY_SORTS.map((key) => (
              <option key={key} value={key}>
                {CANDIDACY_SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Réinitialiser les filtres
          </button>
        )}
      </div>

      {CANDIDACY_SORT_NOTES[sort] && (
        <p className="text-xs leading-relaxed text-muted-foreground-strong">
          {CANDIDACY_SORT_NOTES[sort]}
        </p>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p>Aucune personne ne correspond à ces critères.</p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary underline"
          >
            Réinitialiser
          </button>
        </div>
      ) : (
        <ul className="grid min-w-0 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
          {visible.map((candidacy) => (
            <li key={candidacy.id}>
              <CandidacyCard candidacy={candidacy} onNavigate={cancelPendingQuerySync} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
