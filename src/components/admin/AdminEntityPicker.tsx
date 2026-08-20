"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";

export interface AdminEntityPickerResult {
  id: string;
}

export interface AdminEntityPickerProps<T extends AdminEntityPickerResult> {
  value: string | null;
  onChange: (value: string | null, result: T | null) => void;
  onResolved?: (result: T | null) => void;
  search: (query: string, signal: AbortSignal) => Promise<T[]>;
  resolve: (id: string, signal: AbortSignal) => Promise<T | null>;
  renderResult: (result: T) => React.ReactNode;
  renderSelected?: (result: T) => React.ReactNode;
  label: string;
  placeholder: string;
  clearable?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  maxResults?: number;
  description?: string;
}

export function AdminEntityPicker<T extends AdminEntityPickerResult>({
  value,
  onChange,
  onResolved,
  search,
  resolve,
  renderResult,
  renderSelected = renderResult,
  label,
  placeholder,
  clearable = true,
  disabled = false,
  readOnly = false,
  maxResults = 20,
  description,
}: AdminEntityPickerProps<T>) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);
  const resolveControllerRef = useRef<AbortController | null>(null);
  const searchControllerRef = useRef<AbortController | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<T | null>(null);
  const [results, setResults] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (!value) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize controlled value removal
      setSelected(null);
      return;
    }
    if (selected?.id === value) return;
    resolveControllerRef.current?.abort();
    const controller = new AbortController();
    resolveControllerRef.current = controller;
    setLoading(true);
    setError(null);
    void resolve(value, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setSelected(result);
          onResolved?.(result);
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Impossible de charger la sélection");
          setSelected(null);
          onResolved?.(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [onResolved, resolve, selected?.id, value]);

  useEffect(() => {
    function closeOnOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, []);

  useEffect(() => {
    if (!open || readOnly || query.trim().length < 2) {
      searchControllerRef.current?.abort();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale results when the query is no longer searchable
      setResults([]);
      setActiveIndex(-1);
      return;
    }
    const timer = window.setTimeout(() => {
      searchControllerRef.current?.abort();
      const controller = new AbortController();
      searchControllerRef.current = controller;
      const requestId = ++requestRef.current;
      setLoading(true);
      setError(null);
      void search(query.trim(), controller.signal)
        .then((items) => {
          if (controller.signal.aborted || requestId !== requestRef.current) return;
          const bounded = items.slice(0, maxResults);
          setResults(bounded);
          setActiveIndex(bounded.length ? 0 : -1);
          setAnnouncement(
            bounded.length ? `${bounded.length} résultats disponibles` : "Aucun résultat"
          );
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted && requestId === requestRef.current) {
            setError(
              reason instanceof Error ? reason.message : "Impossible de charger les résultats"
            );
            setResults([]);
            setAnnouncement("Impossible de charger les résultats");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted && requestId === requestRef.current) setLoading(false);
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [maxResults, open, query, readOnly, search]);

  function selectResult(result: T) {
    setSelected(result);
    setQuery("");
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    setAnnouncement("Sélection enregistrée");
    onChange(result.id, result);
  }

  function clearSelection() {
    setSelected(null);
    setQuery("");
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    setAnnouncement("Sélection effacée");
    onResolved?.(null);
    onChange(null, null);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (results.length ? (index + 1) % results.length : -1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        results.length ? (index - 1 + results.length) % results.length : -1
      );
    } else if (event.key === "Enter" && open && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault();
      selectResult(results[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setResults([]);
      setActiveIndex(-1);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  const activeOptionId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  return (
    <div ref={containerRef} className="space-y-2">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      {description && (
        <p id={`${inputId}-description`} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {selected && (
        <div
          className="flex items-start gap-3 rounded-lg border bg-muted/50 p-3"
          aria-label="Sélection actuelle"
        >
          <div className="min-w-0 flex-1">{renderSelected(selected)}</div>
          {clearable && !disabled && !readOnly && (
            <button
              type="button"
              onClick={clearSelection}
              className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-md hover:bg-accent"
              aria-label="Effacer la sélection"
              title="Effacer la sélection"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {!readOnly && !disabled && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-describedby={description ? `${inputId}-description` : undefined}
            className="min-h-11 w-full rounded-lg border bg-background py-2 pl-10 pr-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {loading ? (
            <Loader2
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          ) : (
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          {open && (query.trim().length >= 2 || loading || error) && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-md">
              <div className="sr-only" aria-live="polite">
                {announcement}
              </div>
              {error && (
                <p role="alert" className="p-3 text-sm text-destructive">
                  Impossible de charger les résultats
                </p>
              )}
              {!error && loading && <p className="p-3 text-sm text-muted-foreground">Recherche…</p>}
              {!error && !loading && query.trim().length >= 2 && results.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">Aucun résultat</p>
              )}
              {!error && results.length > 0 && (
                <ul
                  id={listboxId}
                  role="listbox"
                  aria-label={label}
                  className="max-h-80 overflow-auto py-1"
                >
                  {results.map((result, index) => (
                    <li
                      key={result.id}
                      id={`${listboxId}-option-${index}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      className={index === activeIndex ? "bg-accent" : ""}
                    >
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectResult(result)}
                        className="min-h-11 w-full px-3 py-2 text-left"
                      >
                        {renderResult(result)}
                        {index === activeIndex && (
                          <Check className="float-right mt-1 h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      {readOnly && <p className="text-xs text-muted-foreground">Sélection en lecture seule.</p>}
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
