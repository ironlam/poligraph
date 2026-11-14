/**
 * Pure display rules for the Open Graph cards of a parliamentary group. The routes fetch and
 * draw; every choice a reader sees (which figure leads, how the bar splits, how large a name is
 * set) is made here, testable without Satori, and identical for every group.
 */
import { GROUP_POSITION_LABELS } from "@/config/labels";
import type { GovernmentProjectPosition } from "@/lib/scrutins/government-project-positions";

export const POSITION_ORDER: readonly GovernmentProjectPosition[] = [
  "POUR",
  "ABSTENTION",
  "CONTRE",
];

export interface PositionSegment {
  key: GovernmentProjectPosition;
  label: string;
  count: number;
  /** Share of the retained scrutins, 0 to 100, unrounded: it sizes the bar. */
  share: number;
  /** The share as the page prints it, rounded to a whole percent. */
  percent: number;
}

/**
 * Pour, abstention, contre, in that order (the abstention sits between the two sides). Each
 * share comes from its own count, so the three printed percents are the page's own.
 */
export function positionSegments(counts: Record<GovernmentProjectPosition, number>): {
  total: number;
  segments: PositionSegment[];
} {
  const total = POSITION_ORDER.reduce((sum, key) => sum + counts[key], 0);
  const segments = POSITION_ORDER.map((key) => {
    let share = 0;
    if (total > 0) share = (counts[key] / total) * 100;
    return {
      key,
      label: GROUP_POSITION_LABELS[key],
      count: counts[key],
      share,
      percent: Math.round(share),
    };
  });
  return { total, segments };
}

/**
 * The position the card sets in large type: the group's most frequent one, by the same rule for
 * every group. A tie leads with nothing rather than with whichever position is listed first.
 */
export function leadingSegment(segments: PositionSegment[]): PositionSegment | null {
  const max = Math.max(...segments.map((segment) => segment.count));
  if (max <= 0) return null;
  const leaders = segments.filter((segment) => segment.count === max);
  if (leaders.length > 1) return null;
  return leaders[0]!;
}

/** Largest size keeping the group's name within two lines of its column. */
export function groupNameSize(name: string): number {
  if (name.length <= 24) return 50;
  if (name.length <= 34) return 42;
  return 34;
}

/** The monogram is a fixed square: long codes (LFI-NFP) are set smaller to stay inside it. */
export function monogramSize(code: string): number {
  if (code.length <= 3) return 38;
  if (code.length <= 4) return 32;
  return 24;
}

/**
 * "au 13 nov. 2026". Platforms cache a preview for as long as they like, so a card printing
 * counts that change says when they were read. Null when the source gave no date.
 */
export function asOfLabel(date: Date | null): string | null {
  if (!date) return null;
  const formatted = date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
  return `au ${formatted.replace(/^1 /, "1er ")}`;
}

export function scrutinCountLabel(count: number): string {
  if (count > 1) return `${count} scrutins`;
  return `${count} scrutin`;
}
