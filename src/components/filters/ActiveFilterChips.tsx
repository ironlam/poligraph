"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActiveFilter {
  /** Param key, used for removal */
  key: string;
  /** Human-readable label shown in the chip */
  label: string;
  /** Optional raw value, kept for future needs (not required for removal) */
  value?: string;
}

interface ActiveFilterChipsProps {
  filters: ActiveFilter[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
  className?: string;
  /** Leading label (default: "Filtres actifs :") */
  label?: string;
  /**
   * `wrap` flows onto as many lines as needed. `row` keeps one line for a parent that scrolls
   * sideways: no leading label, and 44px targets since it is the mobile form.
   */
  layout?: "wrap" | "row";
}

export function ActiveFilterChips({
  filters,
  onRemove,
  onClearAll,
  className,
  label = "Filtres actifs :",
  layout = "wrap",
}: ActiveFilterChipsProps) {
  if (filters.length === 0) return null;

  const isRow = layout === "row";

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm",
        isRow ? "w-max whitespace-nowrap" : "flex-wrap",
        className
      )}
    >
      {!isRow && <span className="text-muted-foreground">{label}</span>}
      {filters.map((f) => (
        <span
          key={f.key}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border bg-muted/40 pl-3 pr-1 py-0.5",
            isRow && "min-h-11 bg-background"
          )}
        >
          {f.label}
          <button
            type="button"
            onClick={() => onRemove(f.key)}
            className={cn(
              "flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground",
              isRow ? "size-10" : "size-8"
            )}
            aria-label={`Retirer le filtre ${f.label}`}
          >
            <X className="h-4 w-4" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className={cn("ml-1 text-primary hover:underline", isRow && "min-h-11 px-2")}
      >
        Tout effacer
      </button>
    </div>
  );
}
