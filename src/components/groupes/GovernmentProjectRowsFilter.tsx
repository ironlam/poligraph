"use client";

import { useState, type ReactNode } from "react";

type Position = "POUR" | "ABSTENTION" | "CONTRE";
type Filter = Position | "TOUS";

export interface FilterableRow {
  key: string;
  position: Position;
  year: string;
  node: ReactNode;
}

const FILTERS: { value: Filter; label: string; color: string }[] = [
  { value: "TOUS", label: "Tous", color: "var(--primary)" },
  { value: "POUR", label: "Pour", color: "var(--vote-pour)" },
  { value: "ABSTENTION", label: "Abstention", color: "var(--vote-abstention)" },
  { value: "CONTRE", label: "Contre", color: "var(--vote-contre)" },
];

/**
 * Filters the retained votes by the group's position and groups them by year. The rows are
 * rendered on the server; without JavaScript every row stays visible.
 */
export function GovernmentProjectRowsFilter({ rows }: { rows: FilterableRow[] }) {
  const [filter, setFilter] = useState<Filter>("TOUS");
  const shown = filter === "TOUS" ? rows : rows.filter((row) => row.position === filter);

  const years: { year: string; rows: FilterableRow[] }[] = [];
  for (const row of shown) {
    const last = years[years.length - 1];
    if (last && last.year === row.year) last.rows.push(row);
    else years.push({ year: row.year, rows: [row] });
  }

  return (
    <div>
      <div
        role="group"
        aria-label="Filtrer par position du groupe"
        className="flex flex-wrap gap-2"
      >
        {FILTERS.map(({ value, label, color }) => {
          const count =
            value === "TOUS" ? rows.length : rows.filter((row) => row.position === value).length;
          const pressed = filter === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={pressed}
              disabled={count === 0}
              onClick={() => setFilter(value)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                pressed
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:bg-muted"
              }`}
            >
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              {label}
              <span className="font-normal">{count}</span>
            </button>
          );
        })}
      </div>

      <p className="sr-only" aria-live="polite">
        {shown.length} scrutin{shown.length > 1 ? "s" : ""} affiché{shown.length > 1 ? "s" : ""}
      </p>

      {years.map(({ year, rows: yearRows }) => (
        <div key={year} className="mt-6">
          <h3 className="mb-2 font-display text-lg font-bold text-muted-foreground">{year}</h3>
          <ol className="overflow-hidden rounded-xl border bg-card">
            {yearRows.map((row) => (
              <li key={row.key} className="border-t first:border-t-0">
                {row.node}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
