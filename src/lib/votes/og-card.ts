/**
 * Pure display rules for a scrutin's Open Graph card. The route only fetches and draws; every
 * decision a reader sees (which headline, how large, how the bar splits) is made here, testable
 * without Satori.
 */
import type { PublicTitleView } from "./resolve-public-title";

const HEADLINE_MAX_LENGTH = 150;

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  let base = cut;
  if (lastSpace > max * 0.6) base = cut.slice(0, lastSpace);
  return `${base.replace(/[\s,;:.]+$/, "")}…`;
}

/**
 * The card's headline. An approved policy title reads as a sentence already. An official title
 * is an object fragment ("la première partie du projet de loi…"), which reads as broken once
 * shared alone in a feed: it gets a "Vote sur" lead and loses its closing period. Titles that
 * already start with a capital are kept as the source wrote them.
 */
export function scrutinOgHeadline(view: PublicTitleView): string {
  if (view.mode === "policy") return truncateAtWord(view.policyTitle, HEADLINE_MAX_LENGTH);
  const official = view.officialTitle.trim().replace(/\.$/, "");
  const first = official.charAt(0);
  const isFragment = first !== "" && first === first.toLowerCase() && first !== first.toUpperCase();
  if (isFragment) return truncateAtWord(`Vote sur ${official}`, HEADLINE_MAX_LENGTH);
  return truncateAtWord(official, HEADLINE_MAX_LENGTH);
}

/** Largest size that keeps the headline within three lines of the 1072 px text column. */
export function scrutinOgHeadlineSize(headline: string): number {
  if (headline.length <= 90) return 54;
  if (headline.length <= 120) return 46;
  return 40;
}

export type VoteSegmentKey = "pour" | "contre" | "abstention";

export interface VoteSegment {
  key: VoteSegmentKey;
  label: string;
  count: number;
  /** Share of the votes cast, 0 to 100, unrounded: it sizes the bar, it is never printed. */
  share: number;
}

/**
 * Each share comes from its own count. Deriving the last one as `100 - a - b` from rounded
 * values can go negative and shifts the error onto whichever position is listed last.
 */
export function scrutinOgSegments(votes: {
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
}): { total: number; segments: VoteSegment[] } {
  const total = votes.votesFor + votes.votesAgainst + votes.votesAbstain;
  const share = (count: number) => {
    if (total === 0) return 0;
    return (count / total) * 100;
  };
  return {
    total,
    segments: [
      { key: "pour", label: "Pour", count: votes.votesFor, share: share(votes.votesFor) },
      {
        key: "contre",
        label: "Contre",
        count: votes.votesAgainst,
        share: share(votes.votesAgainst),
      },
      {
        key: "abstention",
        label: "Abstention",
        count: votes.votesAbstain,
        share: share(votes.votesAbstain),
      },
    ],
  };
}
