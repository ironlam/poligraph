import {
  MEASURE_REJECTION_REASON_LABELS,
  MEASURE_PRECISION_LABELS,
  MEASURE_SOURCE_KIND_LABELS,
  SOURCE_TIER_LABELS,
} from "@/config/labels";
import type {
  MeasurePrecision,
  MeasureRejectionReason,
  MeasureSourceKind,
  SourceTier,
} from "@/generated/prisma";

/**
 * Shared chrome for the measure action panel and the confirmation forms it opens.
 *
 * `min-h-11` is 44px, the touch target AGENTS.md requires. Keep it on every control here.
 */

export const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50";
export const DANGER =
  "inline-flex min-h-11 items-center justify-center rounded border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300";
export const FIELD =
  "mt-1 min-h-11 w-full rounded border border-border bg-background px-3 py-2 text-sm";
export const LABEL = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

export const SOURCE_KINDS = Object.keys(MEASURE_SOURCE_KIND_LABELS) as MeasureSourceKind[];
export const TIERS = Object.keys(SOURCE_TIER_LABELS) as SourceTier[];
export const REJECTION_REASONS = Object.keys(
  MEASURE_REJECTION_REASON_LABELS
) as MeasureRejectionReason[];
export const PRECISIONS = Object.keys(MEASURE_PRECISION_LABELS) as MeasurePrecision[];

/** Name the revision a dangerous action is about to touch, short enough to sit in a sentence. */
export function excerpt(text: string | undefined): string {
  if (text === undefined) return "révision inconnue";
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}
