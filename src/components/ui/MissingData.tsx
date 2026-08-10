import type { ReactNode } from "react";

/**
 * MissingData: dire une absence sans la déguiser en information.
 *
 * Implements docs/design/patterns/MissingData.md. On a public-data platform an
 * absence is itself information: it is stated, never filled in and never hidden to
 * make a page look complete.
 *
 * Three rules this primitive enforces by construction:
 *
 * - It is not a `Skeleton`. A skeleton says "this is loading"; this says "this does
 *   not exist yet, and here is why". Rendering one for the other misleads.
 * - No `0`, no dash, no "N/A". Zero is a fact, unknown is a gap, and the two must not
 *   look alike (invariant I8).
 * - The tone is never evaluative. "Aucune déclaration publiée", not "n'a pas déclaré".
 *
 * The dashed border comes from `--muted-foreground` rather than `--border` because
 * `--border` drops to `oklch(1 0 0 / 10%)` in dark mode, where a dashed rule at that
 * opacity reads as a broken box rather than an empty one.
 */

interface MissingDataProps {
  /** What is missing. Optional: omit when the body carries it. */
  title?: ReactNode;
  /**
   * Why it is missing and, when possible, where to look instead. One message per
   * absence: two sentences that contradict each other are worth less than nothing.
   */
  children: ReactNode;
  /** Discreet leading glyph. Unicode only, never an emoji, never an illustration. */
  glyph?: string;
  className?: string;
}

export function MissingData({ title, children, glyph, className }: MissingDataProps) {
  return (
    <div
      className={`rounded-md border border-dashed border-muted-foreground/30 px-4 py-3 ${className ?? ""}`.trim()}
    >
      {title && (
        <p className="flex items-baseline gap-2 text-sm font-medium">
          {glyph && (
            <span aria-hidden="true" className="text-muted-foreground">
              {glyph}
            </span>
          )}
          <span>{title}</span>
        </p>
      )}
      <div
        className={`text-sm leading-relaxed text-muted-foreground ${title ? "mt-1" : ""}`.trim()}
      >
        {children}
      </div>
    </div>
  );
}
