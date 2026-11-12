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
  /**
   * One-tap filters for the most common picks, shown after the active chips. Buttons, not links:
   * they change the same URL parameters as the sheet and add no address for a crawler to follow.
   */
  shortcuts?: MobileFilterShortcut[];
  className?: string;
}

export interface MobileFilterShortcut {
  key: string;
  label: string;
  onSelect: () => void;
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
  shortcuts = [],
  className,
}: MobileFilterRowProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="shrink-0">{trigger}</div>
      {(filters.length > 0 || shortcuts.length > 0) && (
        <>
          <span aria-hidden="true" className="h-7 w-px shrink-0 bg-border" />
          <div className="-mr-4 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pr-4 [scrollbar-width:none]">
            {filters.length > 0 && (
              <div role="group" aria-label="Filtres actifs" className="shrink-0">
                <ActiveFilterChips
                  layout="row"
                  filters={filters}
                  onRemove={onRemove}
                  onClearAll={onClearAll}
                />
              </div>
            )}
            {shortcuts.length > 0 && (
              <div role="group" aria-label="Filtres rapides" className="flex shrink-0 gap-2">
                {shortcuts.map((shortcut) => (
                  <button
                    key={shortcut.key}
                    type="button"
                    onClick={shortcut.onSelect}
                    className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border bg-background px-4 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {shortcut.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
