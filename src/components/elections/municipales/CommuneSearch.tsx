"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useIsMounted } from "@/hooks/useIsMounted";

interface CommuneResult {
  id: string;
  name: string;
  departmentCode: string;
  departmentName: string;
  population: number | null;
  totalSeats: number | null;
  listCount: number;
  candidateCount: number;
}

interface CommuneSearchProps {
  className?: string;
  placeholder?: string;
  /** Base path for API and routing. Default: "/elections/municipales-2026" */
  basePath?: string;
  /** Label above the search input. Default: "Qui se présente chez moi ?" */
  label?: string;
  /** Optional department code to restrict results (e.g. "75", "2A") */
  departmentFilter?: string;
}

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "border-2 border-current border-t-transparent rounded-full animate-spin",
        className
      )}
      role="status"
      aria-label="Chargement"
    >
      <span className="sr-only">Chargement...</span>
    </div>
  );
}

export function CommuneSearch({
  className,
  placeholder = "Rechercher une commune...",
  basePath = "/elections/municipales-2026",
  label = "Découvrez les candidats dans votre commune",
  departmentFilter,
}: CommuneSearchProps) {
  const mounted = useIsMounted();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CommuneResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeolocating, setIsGeolocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [resultatsOnly, setResultatsOnly] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Debounced text search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);

    const timeoutId = setTimeout(async () => {
      try {
        const deptParam = departmentFilter ? `&dept=${encodeURIComponent(departmentFilter)}` : "";
        const resultatsParam = resultatsOnly ? "&resultats=1" : "";
        const response = await fetch(
          `/api${basePath}/communes?q=${encodeURIComponent(query)}${deptParam}${resultatsParam}`
        );
        if (!response.ok) throw new Error("Erreur réseau");
        const data: CommuneResult[] = await response.json();
        const limited = data.slice(0, 8);
        setResults(limited);
        setIsOpen(limited.length > 0);
        setSelectedIndex(-1);
      } catch {
        setResults([]);
        setIsOpen(false);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      setIsLoading(false);
    };
  }, [query, basePath, departmentFilter, resultatsOnly]);

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
    (result: CommuneResult) => {
      setQuery(result.name);
      setIsOpen(false);
      router.push(`${basePath}/communes/${result.id}`);
    },
    [router, basePath]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

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
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
    }
  };

  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("La géolocalisation n'est pas supportée par votre navigateur");
      return;
    }

    setIsGeolocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await fetch(`/api${basePath}/communes?lat=${latitude}&lon=${longitude}`);
          if (!response.ok) throw new Error("Erreur réseau");
          const data: CommuneResult[] = await response.json();
          if (data.length === 1) {
            // Single result: redirect directly
            router.push(`${basePath}/communes/${data[0]!.id}`);
          } else if (data.length > 0) {
            const limited = data.slice(0, 8);
            setResults(limited);
            setIsOpen(true);
            setSelectedIndex(-1);
            setQuery("");
          } else {
            setResults([]);
            setIsOpen(true);
          }
        } catch {
          setGeoError("Impossible de trouver votre commune");
        } finally {
          setIsGeolocating(false);
        }
      },
      (error) => {
        const messages: Record<number, string> = {
          1: "Vous avez refusé l'accès à votre position",
          2: "Votre position n'a pas pu être déterminée",
          3: "La demande de géolocalisation a expiré",
        };
        setGeoError(messages[error.code] ?? "La géolocalisation a échoué");
        setIsGeolocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, [router, basePath]);

  const formatPopulation = (pop: number | null) => {
    if (pop === null) return null;
    return pop.toLocaleString("fr-FR");
  };

  const hasNoResults =
    isOpen && results.length === 0 && !isLoading && (query.length >= 2 || isGeolocating === false);

  return (
    <section className={cn("w-full", className)}>
      <label
        htmlFor="commune-search-input"
        className="block text-lg md:text-xl font-display font-semibold mb-3"
      >
        {label}
      </label>

      <div ref={containerRef} className="relative w-full max-w-lg">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              id="commune-search-input"
              type="search"
              role="combobox"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setGeoError(null);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => results.length > 0 && setIsOpen(true)}
              placeholder={placeholder}
              className="w-full"
              autoComplete="off"
              aria-expanded={isOpen}
              aria-controls="commune-search-results"
              aria-autocomplete="list"
              aria-activedescendant={
                selectedIndex >= 0 ? `commune-result-${selectedIndex}` : undefined
              }
            />

            {isLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Spinner className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
          </div>

          {mounted && "geolocation" in navigator && (
            <button
              type="button"
              onClick={handleGeolocate}
              disabled={isGeolocating}
              className={cn(
                "inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-md border border-input bg-background",
                "hover:bg-accent hover:text-accent-foreground transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:pointer-events-none disabled:opacity-50"
              )}
              aria-label="Utiliser ma position"
              title="Autour de moi"
            >
              {isGeolocating ? (
                <Spinner className="w-4 h-4" />
              ) : (
                <LocationIcon className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {/* Filter toggle */}
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={() => setResultatsOnly(!resultatsOnly)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition-colors",
              resultatsOnly
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-muted border-border text-muted-foreground"
            )}
          >
            Résultats disponibles
          </button>
        </div>

        {geoError && (
          <p className="mt-1.5 text-sm text-destructive" role="alert">
            {geoError}
          </p>
        )}

        {/* Screen reader announcements */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {isLoading && "Recherche en cours..."}
          {!isLoading &&
            results.length > 0 &&
            `${results.length} résultat${results.length > 1 ? "s" : ""} trouvé${results.length > 1 ? "s" : ""}`}
          {hasNoResults && "Aucune commune trouvée"}
        </div>

        {/* Dropdown */}
        {isOpen && (
          <div
            id="commune-search-results"
            role="listbox"
            className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg z-50 overflow-hidden"
          >
            {results.length > 0 ? (
              <ul className="py-1">
                {results.map((result, index) => (
                  <li key={result.id}>
                    <button
                      id={`commune-result-${index}`}
                      type="button"
                      role="option"
                      aria-selected={index === selectedIndex}
                      onClick={() => handleSelect(result)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={cn(
                        "w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left transition-colors",
                        index === selectedIndex ? "bg-accent" : "hover:bg-accent/50"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {result.name}
                          <span className="text-muted-foreground font-normal ml-1">
                            ({result.departmentName})
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatPopulation(result.population) !== null && (
                            <span>{formatPopulation(result.population)} hab.</span>
                          )}
                          {/* listCount tombe à zéro sur un scrutin plurinominal, où aucune liste
                              n'est déclarée. Le nombre de candidats, lui, reste exact : le
                              conditionner au premier faisait disparaître les deux. */}
                          {result.candidateCount > 0 && (
                            <>
                              {formatPopulation(result.population) !== null && (
                                <span className="mx-1">&middot;</span>
                              )}
                              <span>
                                {result.listCount > 0 && (
                                  <>
                                    {result.listCount} liste
                                    {result.listCount > 1 ? "s" : ""} &middot;{" "}
                                  </>
                                )}
                                {result.candidateCount} candidat
                                {result.candidateCount > 1 ? "s" : ""}
                              </span>
                            </>
                          )}
                        </p>
                      </div>

                      <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                        {result.departmentCode}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                Aucune commune trouvée
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
