"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ActiveFilterChips, type ActiveFilter } from "./ActiveFilterChips";

interface MobileFilterRowProps {
  /** The control that opens the filter sheet. It stays put while the chips scroll. */
  trigger: ReactNode;
  filters: ActiveFilter[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
  className?: string;
}

/**
 * One line for a mobile listing: the filter trigger pinned on the left, the active filters
 * scrolling sideways next to it.
 *
 * The chips run to the edge of the surrounding card (`-mr-4 pr-4` undoes its padding), so the last
 * visible one is cut off: that is what tells a reader the row scrolls, without a fade or an arrow.
 */
export function MobileFilterRow({
  trigger,
  filters,
  onRemove,
  onClearAll,
  className,
}: MobileFilterRowProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="shrink-0">{trigger}</div>
      {filters.length > 0 && (
        <>
          <span aria-hidden="true" className="h-7 w-px shrink-0 bg-border" />
          <div
            role="group"
            aria-label="Filtres actifs"
            className="-mr-4 min-w-0 flex-1 overflow-x-auto pr-4 [scrollbar-width:none]"
          >
            <ActiveFilterChips
              layout="row"
              filters={filters}
              onRemove={onRemove}
              onClearAll={onClearAll}
            />
          </div>
        </>
      )}
    </div>
  );
}
