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

/** File name of the downloaded card: stable, ASCII, tied to the scrutin. */
export function voteCardFileName(slug: string): string {
  const safe = slug
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `poligraph-vote-${safe || "scrutin"}.png`;
}
