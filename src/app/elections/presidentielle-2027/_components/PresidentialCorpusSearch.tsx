"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, Loader2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import {
  CANDIDACY_STATUS_LABELS,
  MEASURE_SOURCE_KIND_LABELS,
  THEME_CATEGORY_LABELS,
} from "@/config/labels";
import type {
  PresidentialCandidacySearchResult,
  PresidentialMeasureSearchResult,
  PresidentialSubjectSearchResult,
} from "@/lib/presidentielle/corpus-search";
import { cn } from "@/lib/utils";

const MIN_QUERY_LENGTH = 2;
const AUTOCOMPLETE_DELAY_MS = 500;
const RESULTS_PATH = "/elections/presidentielle-2027/recherche";

type ApiResponse = {
  state: "too_short" | "results" | "empty";
  query: string;
  total: number;
  groups: {
    subjects: PresidentialSubjectSearchResult[];
    candidacies: PresidentialCandidacySearchResult[];
    measures: PresidentialMeasureSearchResult[];
  };
};

type Option =
  | { kind: "subject"; value: PresidentialSubjectSearchResult }
  | { kind: "candidacy"; value: PresidentialCandidacySearchResult }
  | { kind: "measure"; value: PresidentialMeasureSearchResult };

export function PresidentialCorpusSearch() {
  const router = useRouter();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const selectedIndexRef = useRef(-1);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [hydrated, setHydrated] = useState(false);
  const options = useMemo<Option[]>(
    () => [
      ...(response?.groups.subjects.map((value) => ({
        kind: "subject" as const,
        value,
      })) ?? []),
      ...(response?.groups.candidacies.map((value) => ({
        kind: "candidacy" as const,
        value,
      })) ?? []),
      ...(response?.groups.measures.map((value) => ({
        kind: "measure" as const,
        value,
      })) ?? []),
    ],
    [response]
  );

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    const trimmed = query.trim();
    const currentRequest = ++requestId.current;
    selectedIndexRef.current = -1;
    setSelectedIndex(-1);
    setResponse(null);
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setStatus("idle");
      setOpen(false);
      return;
    }

    setStatus("loading");
    setOpen(true);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const url =
          "/api/elections/presidentielle-2027/recherche?q=" +
          encodeURIComponent(trimmed) +
          "&limit=8";
        const result = await fetch(url, { signal: controller.signal });
        if (!result.ok) throw new Error("search_failed");
        const body = (await result.json()) as ApiResponse;
        if (currentRequest !== requestId.current) return;
        setResponse(body);
        setStatus("idle");
      } catch (error) {
        if ((error as Error).name === "AbortError" || currentRequest !== requestId.current) return;
        setStatus("error");
      }
    }, AUTOCOMPLETE_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  function navigate(url: string) {
    setOpen(false);
    router.push(url);
  }

  function submitFullResults() {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      inputRef.current?.focus();
      return;
    }
    navigate(RESULTS_PATH + "?q=" + encodeURIComponent(trimmed));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (!open || options.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = (selectedIndexRef.current + 1) % options.length;
      selectedIndexRef.current = next;
      setSelectedIndex(next);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const next =
        selectedIndexRef.current <= 0 ? options.length - 1 : selectedIndexRef.current - 1;
      selectedIndexRef.current = next;
      setSelectedIndex(next);
    } else if (event.key === "Enter" && selectedIndexRef.current >= 0) {
      event.preventDefault();
      const selected = options[selectedIndexRef.current];
      if (selected) navigate(selected.value.url);
    }
  }

  let optionIndex = 0;
  const showPanel = open && query.trim().length >= MIN_QUERY_LENGTH;
  const liveMessage =
    status === "loading"
      ? "Recherche en cours"
      : status === "error"
        ? "La recherche est momentanément indisponible"
        : response?.total
          ? response.total + " résultat" + (response.total > 1 ? "s" : "")
          : response?.state === "empty"
            ? "Aucun résultat"
            : "";

  return (
    <section aria-labelledby="corpus-search-title" className="mx-auto w-full max-w-3xl">
      <h2 id="corpus-search-title" className="font-display text-2xl font-extrabold tracking-tight">
        Chercher dans le corpus 2027
      </h2>
      <div ref={rootRef} className="relative mt-4">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            submitFullResults();
          }}
        >
          <label htmlFor="presidential-corpus-query" className="mb-2 block font-bold">
            Rechercher un thème, une mesure ou une personnalité suivie
          </label>
          <div className="flex min-h-14 items-center rounded-2xl border border-border bg-card shadow-sm focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2">
            <Search aria-hidden="true" className="ml-4 h-5 w-5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              id="presidential-corpus-query"
              type="text"
              inputMode="search"
              disabled={!hydrated}
              value={query}
              placeholder="logement, retraites, une personnalité…"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-expanded={showPanel}
              aria-activedescendant={
                selectedIndex >= 0 ? listboxId + "-option-" + selectedIndex : undefined
              }
              className="min-h-14 min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-muted-foreground"
              onFocus={() => {
                if (query.trim().length >= MIN_QUERY_LENGTH) setOpen(true);
              }}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            {status === "loading" && (
              <Loader2
                aria-hidden="true"
                className="h-5 w-5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
              />
            )}
            {query.length > 0 && (
              <button
                type="button"
                aria-label="Effacer la recherche"
                title="Effacer la recherche"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                onClick={() => {
                  setQuery("");
                  setResponse(null);
                  setOpen(false);
                  inputRef.current?.focus();
                }}
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            )}
            <button
              type="submit"
              aria-label="Lancer la recherche"
              title="Lancer la recherche"
              className="mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ArrowRight aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
        </form>

        {showPanel && (
          <div
            id={listboxId}
            role="listbox"
            aria-label="Résultats de la recherche présidentielle"
            className="absolute inset-x-0 top-full z-30 mt-2 max-h-[min(70vh,32rem)] overflow-y-auto rounded-2xl border border-border bg-popover shadow-xl"
          >
            {status === "loading" && (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                Recherche en cours…
              </p>
            )}
            {status === "error" && (
              <p className="px-5 py-8 text-center text-sm text-destructive">
                La recherche est momentanément indisponible. Réessayez dans quelques instants.
              </p>
            )}
            {status === "idle" && response?.state === "empty" && (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                Aucune suggestion pour « {query.trim()} ».
              </p>
            )}
            {status === "idle" && response && options.length > 0 && (
              <>
                {response.groups.subjects.length > 0 && (
                  <div role="group" aria-labelledby={listboxId + "-subjects"}>
                    <h3
                      id={listboxId + "-subjects"}
                      className="px-4 pb-1 pt-4 text-xs font-bold uppercase tracking-wide text-muted-foreground"
                    >
                      Thématiques
                    </h3>
                    {response.groups.subjects.map((result) => {
                      const currentIndex = optionIndex++;
                      return (
                        <button
                          key={result.theme}
                          id={listboxId + "-option-" + currentIndex}
                          type="button"
                          role="option"
                          aria-selected={selectedIndex === currentIndex}
                          className={cn(
                            "min-h-14 w-full px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-primary",
                            selectedIndex === currentIndex ? "bg-accent" : "hover:bg-accent/60"
                          )}
                          onMouseEnter={() => {
                            selectedIndexRef.current = currentIndex;
                            setSelectedIndex(currentIndex);
                          }}
                          onClick={() => navigate(result.url)}
                        >
                          <span className="block font-bold">{result.label}</span>
                          <span className="mt-1 block text-sm text-muted-foreground">
                            Thème du corpus 2027
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {response.groups.candidacies.length > 0 && (
                  <div role="group" aria-labelledby={listboxId + "-candidacies"}>
                    <h3
                      id={listboxId + "-candidacies"}
                      className={cn(
                        "px-4 pb-1 pt-4 text-xs font-bold uppercase tracking-wide text-muted-foreground",
                        response.groups.subjects.length > 0 && "border-t border-border"
                      )}
                    >
                      Personnalités suivies
                    </h3>
                    {response.groups.candidacies.map((result) => {
                      const currentIndex = optionIndex++;
                      return (
                        <button
                          key={result.id}
                          id={listboxId + "-option-" + currentIndex}
                          type="button"
                          role="option"
                          aria-selected={selectedIndex === currentIndex}
                          className={cn(
                            "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-primary",
                            selectedIndex === currentIndex ? "bg-accent" : "hover:bg-accent/60"
                          )}
                          onMouseEnter={() => {
                            selectedIndexRef.current = currentIndex;
                            setSelectedIndex(currentIndex);
                          }}
                          onClick={() => navigate(result.url)}
                        >
                          <PoliticianAvatar
                            photoUrl={result.photoUrl}
                            blobPhotoUrl={result.blobPhotoUrl}
                            fullName={result.name}
                            size="sm"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-bold">{result.name}</span>
                            <span className="block text-sm text-muted-foreground">
                              {CANDIDACY_STATUS_LABELS[result.status]}
                              {result.party ? " · " + result.party : ""}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {response.groups.measures.length > 0 && (
                  <div role="group" aria-labelledby={listboxId + "-measures"}>
                    <h3
                      id={listboxId + "-measures"}
                      className="border-t border-border px-4 pb-1 pt-4 text-xs font-bold uppercase tracking-wide text-muted-foreground"
                    >
                      Mesures
                    </h3>
                    {response.groups.measures.map((result) => {
                      const currentIndex = optionIndex++;
                      const source = result.sourceLabel
                        ? MEASURE_SOURCE_KIND_LABELS[result.sourceLabel]
                        : null;
                      return (
                        <button
                          key={result.id}
                          id={listboxId + "-option-" + currentIndex}
                          type="button"
                          role="option"
                          aria-selected={selectedIndex === currentIndex}
                          className={cn(
                            "min-h-14 w-full px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-primary",
                            selectedIndex === currentIndex ? "bg-accent" : "hover:bg-accent/60"
                          )}
                          onMouseEnter={() => {
                            selectedIndexRef.current = currentIndex;
                            setSelectedIndex(currentIndex);
                          }}
                          onClick={() => navigate(result.url)}
                        >
                          <span className="line-clamp-2 block font-bold leading-snug">
                            {result.text}
                          </span>
                          <span className="mt-1 block text-sm text-muted-foreground">
                            {result.candidateName} · {THEME_CATEGORY_LABELS[result.theme]}
                            {source ? " · " + source : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
                  <span aria-live="polite">
                    {response.total} résultat{response.total > 1 ? "s" : ""}
                  </span>
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 font-bold text-primary hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    onClick={submitFullResults}
                  >
                    Voir tous les résultats
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Recherche limitée aux thématiques et contenus publics de l{"'"}élection présidentielle 2027.
        Une absence de résultat ne prouve pas qu{"'"}une proposition n{"'"}existe pas.
      </p>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>
    </section>
  );
}
