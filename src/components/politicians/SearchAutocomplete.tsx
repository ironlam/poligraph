"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { MANDATE_TYPE_LABELS } from "@/config/labels";
import { cn, normalizeImageUrl } from "@/lib/utils";

interface SearchResult {
  id: string;
  fullName: string;
  slug: string;
  photoUrl: string | null;
  party: string | null;
  partyColor: string | null;
  mandate: string | null;
}

interface SearchAutocompleteProps {
  defaultValue?: string;
  placeholder?: string;
  onSearch?: (query: string) => void;
  className?: string;
}

// Avatar component with error handling
function ResultAvatar({ photoUrl, fullName }: { photoUrl: string | null; fullName: string }) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  // Reset error and loaded state when photoUrl changes
  /* eslint-disable react-hooks/set-state-in-effect -- reset on prop change */
  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
  }, [photoUrl]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const normalizedUrl = normalizeImageUrl(photoUrl);

  if (!normalizedUrl || hasError) {
    return (
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
        <span className="text-xs font-medium text-muted-foreground">{getInitials(fullName)}</span>
      </div>
    );
  }

  return (
    <div className="w-8 h-8 rounded-full overflow-hidden bg-muted shrink-0 relative">
      {!isLoaded && <div className="absolute inset-0 animate-pulse rounded-full bg-muted" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={normalizedUrl}
        alt={fullName}
        className={cn(
          "w-full h-full object-cover transition-opacity duration-200",
          isLoaded ? "opacity-100" : "opacity-0"
        )}
        onError={() => setHasError(true)}
        onLoad={() => setIsLoaded(true)}
      />
    </div>
  );
}

export function SearchAutocomplete({
  defaultValue = "",
  placeholder = "Rechercher un représentant...",
  onSearch,
  className,
}: SearchAutocompleteProps) {
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/search/politicians?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        setResults(data);
        setIsOpen(data.length > 0);
        setSelectedIndex(-1);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [query]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setQuery(result.fullName);
      setIsOpen(false);
      router.push(`/politiques/${result.slug}`);
    },
    [router]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter") {
        e.preventDefault();
        onSearch?.(query);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        } else {
          setIsOpen(false);
          onSearch?.(query);
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
    }
  };

  return (
    <div ref={containerRef} className={cn("relative w-full max-w-sm", className)}>
      <Input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setIsOpen(true)}
        placeholder={placeholder}
        className="h-11 w-full"
        autoComplete="off"
        aria-expanded={isOpen}
        aria-controls="search-results"
        aria-autocomplete="list"
        aria-activedescendant={selectedIndex >= 0 ? `search-result-${selectedIndex}` : undefined}
      />

      {/* Screen reader announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {isLoading && "Recherche en cours..."}
        {!isLoading &&
          results.length > 0 &&
          `${results.length} résultat${results.length > 1 ? "s" : ""} trouvé${results.length > 1 ? "s" : ""}`}
        {!isLoading && query.length >= 2 && results.length === 0 && "Aucun résultat"}
      </div>

      {isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {isOpen && results.length > 0 && (
        <div
          id="search-results"
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg z-50 overflow-hidden"
        >
          <ul className="py-1">
            {results.map((result, index) => (
              <li key={result.id}>
                <button
                  id={`search-result-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === selectedIndex}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-colors ${
                    index === selectedIndex ? "bg-accent" : "hover:bg-accent/50"
                  }`}
                >
                  {/* Avatar with fallback */}
                  <ResultAvatar photoUrl={result.photoUrl} fullName={result.fullName} />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{result.fullName}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      {result.mandate && (
                        <span>
                          {MANDATE_TYPE_LABELS[
                            result.mandate as keyof typeof MANDATE_TYPE_LABELS
                          ] || result.mandate}
                        </span>
                      )}
                      {result.party && (
                        <>
                          {result.mandate && <span>-</span>}
                          <span
                            style={{ color: result.partyColor || undefined }}
                            className="font-medium"
                          >
                            {result.party}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {/* Search all link */}
          <div className="border-t px-3 py-2">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onSearch?.(query);
              }}
              className="text-sm text-primary hover:underline"
            >
              Voir tous les résultats pour &quot;{query}&quot;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
