"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import type { HubCandidacy } from "@/lib/data/hub";
import {
  CANDIDACY_FILTERS,
  CANDIDACY_FILTER_LABELS,
  matchesCandidacyFilter,
  matchesCandidacyQuery,
  matchesPublishedProposals,
  parseCandidacyFilter,
  type CandidacyFilter,
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
  const pendingQuerySync = useRef<number | null>(null);
  const lastWrittenQuery = useRef<string | null>(null);

  const counts = Object.fromEntries(
    CANDIDACY_FILTERS.map((key) => [
      key,
      candidacies.filter((candidacy) => matchesCandidacyFilter(candidacy, key)).length,
    ])
  ) as Record<CandidacyFilter, number>;
  const visible = candidacies.filter(
    (candidacy) =>
      matchesCandidacyFilter(candidacy, status) &&
      matchesPublishedProposals(candidacy, publishedOnly) &&
      matchesCandidacyQuery(candidacy, query)
  );
  const hasActiveFilters = status !== "toutes" || publishedOnly || query.trim() !== "";

  const cancelPendingQuerySync = useCallback(() => {
    if (pendingQuerySync.current === null) return;
    window.clearTimeout(pendingQuerySync.current);
    pendingQuerySync.current = null;
  }, []);

  const writeUrl = useCallback(
    (next: { statut: CandidacyFilter; q: string; publishedOnly: boolean }) => {
      lastWrittenQuery.current = next.q.trim();
      const params = new URLSearchParams(searchParams.toString());
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

  function resetFilters() {
    cancelPendingQuerySync();
    setQuery("");
    setStatus("toutes");
    setPublishedOnly(false);
    writeUrl({ statut: "toutes", q: "", publishedOnly: false });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <label className="block w-full max-w-xl text-sm font-semibold">
            Rechercher une personne ou un parti
            <span className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 font-normal focus-within:ring-2 focus-within:ring-primary">
              <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
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

          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={publishedOnly}
              onChange={(event) => selectPublishedOnly(event.target.checked)}
              className="h-5 w-5 rounded border-border accent-primary"
            />
            Avec des propositions publiées
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Statut public</legend>
          <div className="-mx-4 overflow-x-auto px-4 pb-1">
            <div className="flex min-w-max gap-2">
              {CANDIDACY_FILTERS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={key === status}
                  onClick={() => selectStatus(key)}
                  className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
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

      <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm font-medium text-muted-foreground-strong">
          {visible.length}{" "}
          {visible.length === 1 ? "personnalité affichée" : "personnalités affichées"}
        </p>
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
        <ul className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
