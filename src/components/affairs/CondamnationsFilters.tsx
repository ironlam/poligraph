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
  { key: "gouvernement", label: "Ministres" },
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
      const next = { ...current, ...patch };
      if (next.mandat) params.set("mandat", next.mandat);
      if (next.certainty && next.certainty !== "tous") params.set("certainty", next.certainty);
      if (next.parti) params.set("parti", next.parti);
      if (next.view === "stats") params.set("view", "stats");
      const qs = params.toString();
      return `/affaires/condamnations${qs ? `?${qs}` : ""}`;
    },
    [current]
  );

  return (
    <div className="flex flex-col gap-3 mb-6" role="group" aria-label="Filtres de la liste">
      <FilterGroup
        legend="Type de mandat"
        options={MANDAT_OPTIONS}
        currentKey={current.mandat ?? ""}
        onHref={(key) => buildHref({ mandat: key || undefined })}
      />
      <FilterGroup
        legend="Niveau de décision"
        options={CERTAINTY_OPTIONS}
        currentKey={current.certainty}
        onHref={(key) => buildHref({ certainty: key })}
      />
      <FilterGroup
        legend="Mode d'affichage"
        options={VIEW_OPTIONS}
        currentKey={current.view}
        onHref={(key) => buildHref({ view: key })}
      />
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
      <legend className="text-xs font-medium text-muted-foreground mb-1">{legend}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={legend}>
        {options.map((opt) => {
          const active = currentKey === opt.key;
          return (
            <Link
              key={opt.key || "__empty"}
              href={onHref(opt.key)}
              role="radio"
              aria-checked={active}
              className={`inline-flex items-center justify-center min-h-11 px-4 rounded-full border text-sm transition-colors hover:bg-muted ${
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
