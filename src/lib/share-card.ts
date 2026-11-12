/**
 * Pure layout helpers for the share cards drawn in the browser (see `src/components/share`).
 * Nothing here touches the DOM: text measurement is injected, so the wrapping is testable.
 */

export interface VoteCardInput {
  title: string;
  chamberLabel: string;
  dateLabel: string;
  adopted: boolean;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
}

const ELLIPSIS = "…";

/**
 * Greedy word wrap on `maxWidth`, capped at `maxLines`. A text that does not fit ends on an
 * ellipsis instead of being cut mid-air: a share card has no "read more".
 */
export function wrapLines(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || measure(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;

  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1]!;
  while (last.includes(" ") && measure(`${last}${ELLIPSIS}`) > maxWidth) {
    last = last.slice(0, last.lastIndexOf(" "));
  }
  kept[maxLines - 1] = `${last}${ELLIPSIS}`;
  return kept;
}

/** Share of each position among the votes cast, in [0, 1]. All zero when nobody voted. */
export function voteShares(
  input: Pick<VoteCardInput, "votesFor" | "votesAgainst" | "votesAbstain">
) {
  const total = input.votesFor + input.votesAgainst + input.votesAbstain;
  if (total <= 0) return { pour: 0, contre: 0, abstention: 0 };
  return {
    pour: input.votesFor / total,
    contre: input.votesAgainst / total,
    abstention: input.votesAbstain / total,
  };
}

export interface FitStep {
  size: number;
  maxLines: number;
}

/**
 * The largest type size whose wrapped text holds on its allowed lines, so a short text fills the
 * card and a long one still fits. The last step always wins, ellipsis included.
 */
export function fitLines(
  measureAt: (size: number, text: string) => number,
  text: string,
  maxWidth: number,
  steps: readonly FitStep[]
): { size: number; lines: string[] } {
  const last = steps[steps.length - 1]!;
  for (const step of steps.slice(0, -1)) {
    const lines = wrapLines((t) => measureAt(step.size, t), text, maxWidth, step.maxLines + 1);
    if (lines.length <= step.maxLines) return { size: step.size, lines };
  }
  return {
    size: last.size,
    lines: wrapLines((t) => measureAt(last.size, t), text, maxWidth, last.maxLines),
  };
}

export interface CardStat {
  value: number;
  label: string;
  /** Printed after the figure, e.g. " %". */
  suffix?: string;
}

/** A stat as it reads on the card and in its text alternative. */
export function formatCardStat(stat: CardStat): string {
  return `${stat.value.toLocaleString("fr-FR")}${stat.suffix ?? ""}`;
}

/** "17e législature". French ordinals take "re" for the first, "e" for every other. */
export function legislatureLabel(legislature: number): string {
  const ordinal = legislature === 1 ? "re" : "e";
  return `${legislature}${ordinal} législature`;
}

/**
 * The counters a card may print. A zero is dropped, for every person and every party alike: on an
 * image that travels alone, "0" reads as a verdict where it only states the limit of our coverage.
 */
export function pickCardStats(stats: readonly CardStat[], max: number): CardStat[] {
  return stats.filter((stat) => stat.value > 0).slice(0, max);
}

/** Two initials for the portrait fallback, from the first and the last word of the name. */
export function initialsOf(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0]![0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? "") : "";
  return `${first}${last}`.toLocaleUpperCase("fr");
}

/** Where a group sits in its chamber: seats before it on the benches, its own, and all of them. */
export interface HemicyclePlacement {
  before: number;
  seats: number;
  total: number;
}

export interface HemicycleDot {
  /** Unit coordinates: centre of the arcs at (0, 0), x in [-1, 1], y in [0, 1] going up. */
  x: number;
  y: number;
  on: boolean;
}

const HEMICYCLE_ROWS = [0.46, 0.57, 0.68, 0.79, 0.9, 1];
const HEMICYCLE_DOT_SPACING = 0.074;

/**
 * A hemicycle as rows of dots, the group's share lit where it sits, benches read left to right.
 *
 * The dots are a picture of a proportion, not one dot per seat: the card prints the exact count
 * beside it. A group too small to light a dot still gets the nearest one, so it never vanishes.
 */
export function hemicycleDots(placement: HemicyclePlacement): HemicycleDot[] {
  const from = placement.before / placement.total;
  const to = (placement.before + placement.seats) / placement.total;
  const middle = (from + to) / 2;
  const dots: HemicycleDot[] = [];
  let nearest = 0;
  let nearestGap = Infinity;

  for (const radius of HEMICYCLE_ROWS) {
    const count = Math.round((Math.PI * radius) / HEMICYCLE_DOT_SPACING);
    for (let k = 0; k < count; k++) {
      const fraction = (k + 0.5) / count;
      const angle = Math.PI * (1 - fraction);
      const gap = Math.abs(fraction - middle);
      if (gap < nearestGap) {
        nearestGap = gap;
        nearest = dots.length;
      }
      dots.push({
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
        on: fraction >= from && fraction < to,
      });
    }
  }
  if (placement.seats > 0 && !dots.some((dot) => dot.on)) dots[nearest]!.on = true;
  return dots;
}

/** Share of the filled seats, as a whole percentage, never rounded down to a misleading zero. */
export function seatSharePct(placement: HemicyclePlacement): number {
  if (placement.total <= 0 || placement.seats <= 0) return 0;
  return Math.max(1, Math.round((placement.seats / placement.total) * 100));
}

export type ShareCardKind = "vote" | "candidat" | "mesure" | "parti" | "groupe" | "elu";

/** File name of the downloaded card: stable, ASCII, tied to what it shows. */
export function shareCardFileName(kind: ShareCardKind, slug: string): string {
  const safe = slug
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `poligraph-${kind}-${safe || "carte"}.png`;
}
