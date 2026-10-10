import type { ReactNode } from "react";
import { ChevronRight, SlidersHorizontal } from "lucide-react";

/**
 * Filter grid behind a native « Filtres (N) » disclosure: usable without JavaScript, like the
 * other GET forms of the section. From `md` up, where `::details-content` is supported, the
 * summary is hidden and the grid always shown (rules in globals.css, `.gouv-filters`); in older
 * browsers the summary stays visible and the panel still opens.
 */
export function FiltersPanel({
  activeCount,
  children,
}: {
  activeCount: number;
  children: ReactNode;
}) {
  return (
    <details className="gouv-filters group">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[10px] border bg-card px-4 text-sm font-bold [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        Filtres{activeCount > 0 ? ` (${activeCount})` : ""}
        <ChevronRight
          className="size-4 transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-3 md:mt-0">{children}</div>
    </details>
  );
}
