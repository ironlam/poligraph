"use client";

import { useId, useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Filter grid that collapses behind a « Filtres (N) » button below `md`. Server-rendered closed:
 * on desktop the grid is always shown by CSS, so nothing shifts after hydration.
 */
export function FiltersPanel({
  activeCount,
  children,
}: {
  activeCount: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border bg-card px-4 text-sm font-bold md:hidden"
      >
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        Filtres{activeCount > 0 ? ` (${activeCount})` : ""}
      </button>
      <div id={id} className={cn("mt-3 md:mt-0 md:block", open ? "block" : "hidden")}>
        {children}
      </div>
    </div>
  );
}
