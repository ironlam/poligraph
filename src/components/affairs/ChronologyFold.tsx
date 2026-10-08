"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ChronologyFoldProps {
  /** `<li>` déjà rendus côté serveur, dans l'ordre du rail. */
  items: ReactNode[];
  head?: number;
  tail?: number;
  threshold?: number;
  className?: string;
}

/**
 * Rail repliable : au delà de `threshold` étapes, seules les `head` premières et les `tail`
 * dernières restent visibles, séparées par un item qui dit combien sont masquées.
 */
export function ChronologyFold({
  items,
  head = 1,
  tail = 4,
  threshold = 8,
  className = "",
}: ChronologyFoldProps) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const foldable = items.length > threshold && head + tail < items.length;
  const hidden = items.length - head - tail;
  const collapsed = foldable && !expanded;

  return (
    <>
      <ol id={listId} className={className}>
        {collapsed ? (
          <>
            {items.slice(0, head)}
            <li className="relative pl-6 text-sm italic text-muted-foreground">
              <span
                aria-hidden="true"
                className="absolute -left-[9px] top-0.5 flex h-4 w-4 items-center justify-center bg-background font-bold not-italic leading-none"
              >
                ⋮
              </span>
              {hidden}{" "}
              {hidden > 1 ? "étapes intermédiaires masquées" : "étape intermédiaire masquée"}
            </li>
            {items.slice(items.length - tail)}
          </>
        ) : (
          items
        )}
      </ol>
      {foldable && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
          {expanded ? "Réduire" : `Afficher les ${items.length} étapes`}
        </button>
      )}
    </>
  );
}
