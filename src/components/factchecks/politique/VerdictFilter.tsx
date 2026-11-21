"use client";

import { useState, type ReactNode } from "react";
import { VERDICT_GROUP_COLORS, VERDICT_GROUP_LABELS } from "@/config/labels";

type Group = "vrai" | "trompeur" | "faux" | "inverifiable";

/**
 * Filters the server-rendered list by verdict without a URL: the rows are children rendered on the
 * server, tagged `data-verdict`, and this component only sets `data-filter` on their wrapper. The
 * page stays one cached document, with no filtered address for crawlers. Without JavaScript every
 * row shows.
 */
export function VerdictFilter({
  counts,
  total,
  children,
}: {
  counts: { group: Group; count: number }[];
  total: number;
  children: ReactNode;
}) {
  const [filter, setFilter] = useState<Group | null>(null);
  const shown = filter ? (counts.find((c) => c.group === filter)?.count ?? 0) : total;
  const chipClass =
    "inline-flex items-center gap-2 min-h-11 px-3 rounded-full border text-sm hover:bg-muted transition-colors aria-pressed:bg-muted aria-pressed:font-semibold aria-pressed:border-foreground";

  return (
    <>
      <div role="group" aria-label="Filtrer par verdict" className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={filter === null}
          onClick={() => setFilter(null)}
          className={chipClass}
        >
          Tous <b className="tabular-nums">{total}</b>
        </button>
        {counts.map(({ group, count }) => (
          <button
            key={group}
            type="button"
            aria-pressed={filter === group}
            onClick={() => setFilter(group)}
            className={chipClass}
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: VERDICT_GROUP_COLORS[group] }}
            />
            {VERDICT_GROUP_LABELS[group]} <b className="tabular-nums">{count}</b>
          </button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {shown} déclaration{shown > 1 ? "s" : ""} affichée{shown > 1 ? "s" : ""}
      </p>
      <div
        data-filter={filter ?? "tous"}
        className={[
          "[&[data-filter=vrai]_[data-verdict]:not([data-verdict=vrai])]:hidden",
          "[&[data-filter=trompeur]_[data-verdict]:not([data-verdict=trompeur])]:hidden",
          "[&[data-filter=faux]_[data-verdict]:not([data-verdict=faux])]:hidden",
          "[&[data-filter=inverifiable]_[data-verdict]:not([data-verdict=inverifiable])]:hidden",
          "[&[data-filter=vrai]_[data-year]:not(:has([data-verdict=vrai]))]:hidden",
          "[&[data-filter=trompeur]_[data-year]:not(:has([data-verdict=trompeur]))]:hidden",
          "[&[data-filter=faux]_[data-year]:not(:has([data-verdict=faux]))]:hidden",
          "[&[data-filter=inverifiable]_[data-year]:not(:has([data-verdict=inverifiable]))]:hidden",
        ].join(" ")}
      >
        {children}
      </div>
    </>
  );
}
