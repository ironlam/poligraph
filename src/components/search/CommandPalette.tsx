"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";

import { useCommandPalette } from "@/components/search/CommandPaletteProvider";
import {
  categorizeResults,
  type GlobalSearchResponse,
  type SearchResultCategory,
} from "@/components/search/search-results";
import { cn, normalizeImageUrl } from "@/lib/utils";

const RECENT_SEARCHES_KEY = "poligraph-recent-searches";
const MAX_RECENT_SEARCHES = 5;
const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

interface RecentSearch {
  query: string;
  timestamp: number;
}

const QUICK_LINKS = [
  { label: "Représentants", href: "/politiques" },
  { label: "Votes parlementaires", href: "/parlement/votes" },
  { label: "Affaires judiciaires", href: "/affaires" },
  { label: "Dossiers législatifs", href: "/parlement/dossiers" },
];

function getRecentSearches(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentSearch[];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  try {
    const searches = getRecentSearches().filter((s) => s.query !== query);
    searches.unshift({ query, timestamp: Date.now() });
    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(searches.slice(0, MAX_RECENT_SEARCHES))
    );
  } catch {
    // localStorage unavailable
  }
}

function ResultAvatar({ avatarUrl, name }: { avatarUrl?: string | null; name: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const src = normalizeImageUrl(avatarUrl ?? null);

  if (!src) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <span className="text-xs font-medium text-muted-foreground">{initials}</span>
      </div>
    );
  }

  return (
    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={name}
        className="h-full w-full object-cover"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}

function CategoryIcon({ categoryKey }: { categoryKey: string }) {
  const colorMap: Record<string, string> = {
    politicians: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    scrutins: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    affairs: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    parties: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    dossiers: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
    factchecks: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
    communes: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
  };

  const iconLabels: Record<string, string> = {
    politicians: "P",
    scrutins: "V",
    affairs: "A",
    parties: "G",
    dossiers: "D",
    factchecks: "F",
    communes: "C",
  };

  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold",
        colorMap[categoryKey] ?? "bg-muted text-muted-foreground"
      )}
    >
      {iconLabels[categoryKey] ?? "?"}
    </div>
  );
}

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);

  const resultsListRef = useRef<HTMLDivElement>(null);

  // Compute flat list of all result items for keyboard nav
  const flatResults = results.flatMap((cat) => cat.results);
  const totalResults = flatResults.length;

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(-1);
      setIsLoading(false);
      setRecentSearches(getRecentSearches());
      // Focus input after Radix animation starts
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (query.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setSelectedIndex(-1);

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/global?q=${encodeURIComponent(query)}&limit=3`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setResults([]);
          return;
        }
        const data = (await res.json()) as GlobalSearchResponse;
        setResults(categorizeResults(data));
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setResults([]);
        }
      } finally {
        setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex < 0) return;
    const el = resultsListRef.current?.querySelector(`[data-result-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const navigateToResult = useCallback(
    (href: string) => {
      if (query.length >= MIN_QUERY_LENGTH) {
        saveRecentSearch(query);
      }
      router.push(href);
      close();
    },
    [router, close, query]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % totalResults);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev <= 0 ? totalResults - 1 : prev - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < totalResults) {
          const result = flatResults[selectedIndex];
          if (result) navigateToResult(result.href);
        } else if (query.length >= MIN_QUERY_LENGTH) {
          saveRecentSearch(query);
          router.push(`/recherche?q=${encodeURIComponent(query)}`);
          close();
        }
      }
    },
    [selectedIndex, totalResults, flatResults, navigateToResult, query, router, close]
  );

  const showInitialState = query.length < MIN_QUERY_LENGTH;
  const hasResults = results.length > 0;

  // Map flat index per result row
  let flatIndex = 0;

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          )}
        />
        <Dialog.Content
          className={cn(
            // Mobile: full screen
            "fixed inset-0 z-50 flex flex-col bg-background",
            // Desktop: centered modal
            "sm:inset-auto sm:top-[15%] sm:left-1/2 sm:-translate-x-1/2",
            "sm:w-full sm:max-w-[600px] sm:max-h-[480px]",
            "sm:rounded-xl sm:border sm:bg-popover sm:shadow-2xl",
            // Animations
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          )}
          onKeyDown={handleKeyDown}
        >
          <Dialog.Title className="sr-only">Recherche globale</Dialog.Title>

          {/* Search input */}
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Search className="h-5 w-5 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un politique, un vote, une affaire..."
              className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              role="combobox"
              aria-expanded={hasResults}
              aria-activedescendant={selectedIndex >= 0 ? `result-${selectedIndex}` : undefined}
              aria-controls="command-palette-results"
              aria-autocomplete="list"
            />
            {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            <kbd className="hidden h-5 items-center rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
              Esc
            </kbd>
          </div>

          {/* Results area */}
          <div
            ref={resultsListRef}
            id="command-palette-results"
            role="listbox"
            className="flex-1 overflow-y-auto"
          >
            {showInitialState ? (
              <>
                {/* Quick links */}
                <div className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Accès rapide
                </div>
                {QUICK_LINKS.map((link) => (
                  <button
                    key={link.href}
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/50"
                    onClick={() => navigateToResult(link.href)}
                    role="option"
                    aria-selected={false}
                  >
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{link.label}</span>
                  </button>
                ))}

                {/* Recent searches */}
                {recentSearches.length > 0 && (
                  <>
                    <div className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Recherches récentes
                    </div>
                    {recentSearches.map((recent) => (
                      <button
                        key={recent.timestamp}
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/50"
                        onClick={() => setQuery(recent.query)}
                        role="option"
                        aria-selected={false}
                      >
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{recent.query}</span>
                      </button>
                    ))}
                  </>
                )}
              </>
            ) : (
              <>
                {!isLoading && !hasResults && query.length >= MIN_QUERY_LENGTH && (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Aucun résultat pour « {query} »
                  </div>
                )}

                {results.map((category) => (
                  <div key={category.key}>
                    <div className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {category.label}
                    </div>
                    {category.results.map((result) => {
                      const currentIndex = flatIndex++;
                      const isSelected = currentIndex === selectedIndex;
                      return (
                        <button
                          key={result.href}
                          id={`result-${currentIndex}`}
                          data-result-index={currentIndex}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={cn(
                            "flex min-h-[44px] w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors",
                            isSelected ? "bg-accent" : "hover:bg-accent/50"
                          )}
                          onClick={() => navigateToResult(result.href)}
                        >
                          {result.avatarUrl !== undefined ? (
                            <ResultAvatar avatarUrl={result.avatarUrl} name={result.primary} />
                          ) : (
                            <CategoryIcon categoryKey={category.key} />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-base font-medium">{result.primary}</div>
                            {result.secondary && (
                              <div className="text-xs text-muted-foreground">
                                {result.secondary}
                              </div>
                            )}
                          </div>
                          {result.badge && (
                            <span
                              className="ml-auto shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                              style={
                                result.badgeColor
                                  ? {
                                      backgroundColor: `${result.badgeColor}20`,
                                      color: result.badgeColor,
                                    }
                                  : undefined
                              }
                            >
                              {result.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Live region for screen readers */}
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {!showInitialState && !isLoading && totalResults > 0
              ? `${totalResults} résultat${totalResults > 1 ? "s" : ""}`
              : ""}
            {!showInitialState && !isLoading && totalResults === 0 ? "Aucun résultat" : ""}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
            <span className="hidden items-center gap-1 sm:flex">
              <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">
                {"\u2191\u2193"}
              </kbd>{" "}
              naviguer{" "}
              <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">{"\u21B5"}</kbd>{" "}
              ouvrir <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">esc</kbd>{" "}
              fermer
            </span>
            {query.length >= MIN_QUERY_LENGTH && (
              <button
                type="button"
                className="ml-auto flex items-center gap-1 text-primary hover:underline"
                onClick={() => {
                  saveRecentSearch(query);
                  router.push(`/recherche?q=${encodeURIComponent(query)}`);
                  close();
                }}
              >
                Voir tous les résultats
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
