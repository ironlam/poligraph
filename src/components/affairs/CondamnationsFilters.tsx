"use client";

import Link from "next/link";
import { useMemo } from "react";

type FilterValues = {
  mandat?: string;
  certainty: string;
  parti?: string;
  view: string;
};

const MANDAT_OPTIONS = [
  { key: "", label: "Tous mandats" },
  { key: "depute", label: "Députés" },
  { key: "senateur", label: "Sénateurs" },
  { key: "gouvernement", label: "Gouvernement" },
  { key: "locaux", label: "Élus locaux" },
];

const CERTAINTY_OPTIONS = [
  { key: "tous", label: "Toutes" },
  { key: "etabli", label: "Définitives" },
  { key: "prononcee", label: "Non définitives" },
];

const VIEW_OPTIONS = [
  { key: "list", label: "Liste" },
  { key: "stats", label: "Taux par parti" },
];

export function CondamnationsFilters({
  current,
  parties,
}: {
  current: FilterValues;
  parties: Array<{ slug: string; shortName: string; name: string }>;
}) {
  const buildHref = useMemo(
    () => (patch: Partial<FilterValues>) => {
      const params = new URLSearchParams();
      // The rate view ignores party and certainty: never carry them out of it, or a
      // bookmarked ?view=stats&parti=rn would silently filter the list on the way back.
      const base =
        current.view === "stats" ? { ...current, certainty: "tous", parti: undefined } : current;
      const next = { ...base, ...patch };
      if (next.mandat) params.set("mandat", next.mandat);
      // The per-party rate counts final convictions only (#957).
      if (next.view !== "stats" && next.certainty && next.certainty !== "tous")
        params.set("certainty", next.certainty);
      // The rate table lists every party, so a party filter does not apply there.
      if (next.view !== "stats" && next.parti) params.set("parti", next.parti);
      if (next.view === "stats") params.set("view", "stats");
      const qs = params.toString();
      return `/affaires/condamnations${qs ? `?${qs}` : ""}`;
    },
    [current]
  );

  return (
    <div
      className="mb-4 flex flex-col gap-2 md:mb-6 md:gap-3"
      role="group"
      aria-label="Filtres de la liste"
    >
      <FilterGroup
        legend="Type de mandat"
        options={MANDAT_OPTIONS}
        currentKey={current.mandat ?? ""}
        onHref={(key) => buildHref({ mandat: key || undefined })}
      />
      {current.view !== "stats" && (
        <FilterGroup
          legend="Niveau de décision"
          options={CERTAINTY_OPTIONS}
          currentKey={current.certainty}
          onHref={(key) => buildHref({ certainty: key })}
        />
      )}
      <FilterGroup
        legend="Mode d'affichage"
        options={VIEW_OPTIONS}
        currentKey={current.view}
        onHref={(key) => buildHref({ view: key })}
      />
      {current.view !== "stats" && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium py-2">Filtrer par parti</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {current.parti && (
              <Link
                href={buildHref({ parti: undefined })}
                className="inline-flex items-center gap-1 h-9 px-3 rounded-full border border-primary bg-primary/10 hover:bg-primary/20 text-sm"
                aria-label="Retirer le filtre parti"
              >
                ✕ {parties.find((p) => p.slug === current.parti)?.shortName ?? current.parti}
              </Link>
            )}
            {parties.slice(0, 20).map((p) => (
              <Link
                key={p.slug}
                href={buildHref({ parti: p.slug })}
                aria-current={current.parti === p.slug ? "true" : undefined}
                className={`inline-flex items-center h-9 px-3 rounded-full border text-sm hover:bg-muted ${
                  current.parti === p.slug ? "border-primary bg-primary/10" : ""
                }`}
                prefetch={false}
              >
                {p.shortName}
              </Link>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function FilterGroup({
  legend,
  options,
  currentKey,
  onHref,
}: {
  legend: string;
  options: Array<{ key: string; label: string }>;
  currentKey: string;
  onHref: (key: string) => string;
}) {
  return (
    <fieldset>
      {/* Below md each group is one line that scrolls sideways, its legend left to screen readers:
          three stacked groups with visible legends filled the first screen of a phone. */}
      <legend className="mb-1 text-xs font-medium text-muted-foreground max-md:sr-only">
        {legend}
      </legend>
      <div
        className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
        role="radiogroup"
        aria-label={legend}
      >
        {options.map((opt) => {
          const active = currentKey === opt.key;
          return (
            <Link
              key={opt.key || "__empty"}
              href={onHref(opt.key)}
              role="radio"
              aria-checked={active}
              className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap min-h-11 px-4 rounded-full border text-sm transition-colors hover:bg-muted ${
                active ? "border-primary bg-primary/10 font-medium" : ""
              }`}
              prefetch={false}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>
    </fieldset>
  );
}
