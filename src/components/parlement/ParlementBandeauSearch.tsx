"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

interface Suggestions {
  parlementaires: { slug: string; fullName: string; role: string }[];
  groupes: { slug: string; name: string; code: string; chamber: string }[];
  scrutins: { slug: string; title: string; votingDate: string }[];
  dossiers: { slug: string; title: string }[];
}

interface Option {
  href: string;
  label: string;
  detail: string;
}

/** Flattens the families in display order; the order also drives keyboard navigation. */
export function suggestionGroups(s: Suggestions): { label: string; options: Option[] }[] {
  return [
    {
      label: "Parlementaires",
      options: s.parlementaires.map((p) => ({
        href: `/politiques/${p.slug}/votes`,
        label: p.fullName,
        detail: `${p.role}, ses votes`,
      })),
    },
    {
      label: "Groupes",
      options: s.groupes.map((g) => ({
        href: ROUTES.groupeDetail(g.slug),
        label: g.name,
        detail: `${g.code}, ${g.chamber === "SENAT" ? "Sénat" : "Assemblée nationale"}`,
      })),
    },
    {
      label: "Scrutins",
      options: s.scrutins.map((v) => ({
        href: ROUTES.voteDetail(v.slug),
        label: v.title,
        detail: new Date(v.votingDate).toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
      })),
    },
    {
      label: "Dossiers",
      options: s.dossiers.map((d) => ({
        href: ROUTES.dossierDetail(d.slug),
        label: d.title,
        detail: "Dossier législatif",
      })),
    },
  ].filter((g) => g.options.length > 0);
}

/**
 * Search of the Parlement landing banner. Typing suggests deputies and senators (to their votes),
 * groups, scrutins and dossiers; submitting without picking one lists the matching scrutins. A
 * plain GET form underneath, so it still works without JavaScript.
 */
export function ParlementBandeauSearch() {
  const router = useRouter();
  const baseId = useId();
  const inputId = `${baseId}-q`;
  const listId = `${baseId}-liste`;
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<{ label: string; options: Option[] }[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  const options = groups.flatMap((g) => g.options);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/parlement?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        setGroups(suggestionGroups((await res.json()) as Suggestions));
        setActive(-1);
        setOpen(true);
      } catch {
        // Aborted by a newer keystroke, or offline: the form submit still works.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

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
      go(options[active].href);
    }
  };

  const expanded = open && options.length > 0;
  // Position of each family's first option in the flat keyboard order.
  const starts = groups.map((_, gi) =>
    groups.slice(0, gi).reduce((n, g) => n + g.options.length, 0)
  );

  return (
    <form role="search" action={ROUTES.votes} method="get" className="w-full">
      <label htmlFor={inputId} className="mb-2 block text-sm font-bold text-white">
        Rechercher un parlementaire, un groupe ou un scrutin
      </label>
      <div
        ref={boxRef}
        className="relative"
        onBlur={(e) => {
          if (!boxRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
        }}
      >
        <div className="flex items-stretch gap-2 rounded-xl bg-white p-1.5">
          <input
            id={inputId}
            name="search"
            type="search"
            required
            minLength={2}
            maxLength={100}
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // Suggestions belong to the previous text: Enter must submit what is typed now
              // until the new ones arrive.
              setOpen(false);
              setActive(-1);
              if (e.target.value.trim().length < 2) setGroups([]);
            }}
            onFocus={() => options.length > 0 && setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Nom, groupe, scrutin, loi"
            className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent px-3 text-base text-neutral-900 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
          aria-label="Suggestions"
          hidden={!expanded}
          className="absolute inset-x-0 top-full z-50 mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg"
        >
          {groups.map((group, gi) => (
            <li key={group.label} role="presentation">
              <p className="px-3 pt-2 pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
              <ul role="group" aria-label={group.label}>
                {group.options.map((option, oi) => {
                  const i = (starts[gi] ?? 0) + oi;
                  return (
                    <li
                      key={option.href}
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
                        <span className="line-clamp-2 text-sm font-medium">{option.label}</span>
                        <span className="text-xs text-muted-foreground">{option.detail}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
      <p className="sr-only" aria-live="polite">
        {expanded ? `${options.length} suggestion${options.length > 1 ? "s" : ""}` : ""}
      </p>
    </form>
  );
}
