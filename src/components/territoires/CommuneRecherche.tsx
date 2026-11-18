"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { TERRITOIRES_SEARCH_PATH } from "@/lib/territoires/paths";
import { cn } from "@/lib/utils";

interface Suggestion {
  code: string;
  name: string;
  postalCodes: string[];
  population: number | null;
  href: string;
}

/** "29000 · 63 000 hab.", from what the commune row carries. */
export function suggestionDetail(suggestion: Suggestion): string {
  return [
    suggestion.postalCodes[0] ?? null,
    suggestion.population != null ? `${suggestion.population.toLocaleString("fr-FR")} hab.` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Commune search of a department page. Typing suggests communes of this department only; picking
 * one opens its page. A plain GET form underneath: without JavaScript, or when nothing is picked,
 * it lands on the Territoires search with the text typed.
 */
export function CommuneRecherche({
  departmentCode,
  departmentName,
}: {
  departmentCode: string;
  departmentName: string;
}) {
  const baseId = useId();
  const inputId = `${baseId}-q`;
  const listId = `${baseId}-liste`;
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Suggestion[]>([]);
  const [searched, setSearched] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const url = `/api/search/communes?departement=${encodeURIComponent(departmentCode)}&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return;
        setOptions((await res.json()) as Suggestion[]);
        setSearched(true);
        setActive(-1);
        setOpen(true);
      } catch {
        // Aborted by the next keystroke, or offline: the form still submits.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, departmentCode]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    } else if (e.key === "ArrowDown" && options.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp" && options.length > 0) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === "Enter" && open && active >= 0 && options[active]) {
      e.preventDefault();
      // Follow the suggestion's own link: one navigation path for keyboard, mouse and new tab.
      document.getElementById(`${listId}-${active}`)?.querySelector("a")?.click();
    }
  };

  const expanded = open && options.length > 0;
  const empty = open && searched && options.length === 0;

  return (
    <form role="search" action={TERRITOIRES_SEARCH_PATH} method="get" className="w-full">
      <label htmlFor={inputId} className="mb-2 block text-sm font-bold">
        Chercher une commune du département
      </label>
      <div
        ref={boxRef}
        className="relative"
        onBlur={(e) => {
          if (!boxRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
        }}
      >
        <div className="flex items-stretch gap-2 rounded-xl border border-border bg-card p-1.5">
          <input
            id={inputId}
            name="q"
            type="search"
            required
            minLength={2}
            maxLength={80}
            autoComplete="off"
            role="combobox"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // Suggestions belong to the text that produced them: dropped at once, so the
              // arrow keys or a refocus cannot reopen them while the next answer is pending,
              // nor after a failed or rate-limited request.
              setOptions([]);
              setOpen(false);
              setActive(-1);
              setSearched(false);
            }}
            onFocus={() => (options.length > 0 || searched) && setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Nom ou code postal"
            className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
          <button
            type="submit"
            aria-label="Rechercher"
            title="Rechercher"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-primary px-3 font-bold text-primary-foreground hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-5"
          >
            <Search className="h-5 w-5 sm:hidden" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Rechercher</span>
          </button>
        </div>
        <ul
          id={listId}
          role="listbox"
          aria-label={`Communes, ${departmentName}`}
          hidden={!expanded}
          className="absolute inset-x-0 top-full z-50 mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg"
        >
          {options.map((option, i) => (
            <li
              key={option.code}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
            >
              {/* A real link (AGENTS.md: <a> for navigation): new tab and copy work. */}
              <Link
                href={option.href}
                prefetch={false}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-11 flex-col justify-center rounded-lg px-3 py-2",
                  i === active && "bg-muted"
                )}
              >
                <span className="text-sm font-medium">{option.name}</span>
                <span className="text-xs text-muted-foreground">{suggestionDetail(option)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <p
        className={cn("mt-2 text-sm text-muted-foreground", !empty && "sr-only")}
        aria-live="polite"
      >
        {expanded
          ? `${options.length} commune${options.length > 1 ? "s" : ""} proposée${options.length > 1 ? "s" : ""}`
          : empty
            ? `Aucune commune de ce département ne correspond. La touche Entrée cherche dans toute la France.`
            : ""}
      </p>
    </form>
  );
}
