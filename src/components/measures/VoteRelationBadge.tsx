import { Clock, History, SearchX } from "lucide-react";
import type { VoteRelation } from "@/lib/measures/vote-relation";
import {
  VOTE_RELATION_BADGE_TIER,
  VOTE_RELATION_BASIS_LABELS,
  VOTE_RELATION_PILL_CLASS,
  VOTE_RELATION_POSITION_LABELS,
} from "@/config/labels";
import { MeasureBadge } from "./MeasureBadge";

/**
 * The nine states of `deriveVoteRelation()` on two axes (spec §9.2): a short position pill (only when
 * there is a position to state) and a longer, sourced basis line. Keeping the two on separate lines is
 * what let the column fit; the decomposition does not change the nine states.
 *
 * `basisDetails` carries the sourced detail (scrutin number, chamber, legislatures, verification date).
 * It is composed by the caller from the reference link, since `deriveVoteRelation()` is pure and does
 * not carry link metadata.
 *
 * Two renderings, decided by whether a position exists:
 *
 * A state WITH a position keeps the pill it always had, now on the `verdict` tier, with the basis
 * and its sourced detail as a line underneath. That is the strongest fact the page can state and it
 * stays the loudest thing in the row.
 *
 * A state WITHOUT a position used to be bare grey text, so a reader could not tell it was a
 * qualification at all. It now carries the badge form on the tier its content deserves:
 * `qualification` for a vote found on a broader text, and `verification` for the three states that
 * describe where our own search stands. The sourced detail moves under the badge instead of being
 * glued to the label behind a colon, so a badge never has to hold a date and a chamber list.
 */
const VERIFICATION_ICON: Partial<Record<VoteRelation, typeof Clock>> = {
  SEARCH_NOT_DONE: Clock,
  NO_VOTE_IN_SCOPE: SearchX,
  NOT_RECHECKED_SINCE_REFORMULATION: History,
};

export function VoteRelationBadge({
  relation,
  basisDetails,
  className,
}: {
  relation: VoteRelation;
  basisDetails?: string;
  className?: string;
}) {
  const position = VOTE_RELATION_POSITION_LABELS[relation];
  const basis = VOTE_RELATION_BASIS_LABELS[relation];
  const wrapper = className
    ? `flex flex-col items-start gap-1 ${className}`
    : "flex flex-col items-start gap-1";

  if (position !== null) {
    return (
      <span className={wrapper}>
        <MeasureBadge
          tier="verdict"
          className={VOTE_RELATION_PILL_CLASS[relation]}
          attrs={{ "data-vote-position": relation }}
        >
          {position}
        </MeasureBadge>
        <span className="text-xs text-muted-foreground-strong">
          {basisDetails ? `${basis} : ${basisDetails}` : basis}
        </span>
      </span>
    );
  }

  const Icon = VERIFICATION_ICON[relation];

  return (
    <span className={wrapper}>
      <MeasureBadge
        tier={VOTE_RELATION_BADGE_TIER[relation]}
        icon={
          Icon ? <Icon aria-hidden="true" className="h-3 w-3 shrink-0 opacity-70" /> : undefined
        }
      >
        {basis}
      </MeasureBadge>
      {basisDetails !== undefined && (
        <span className="text-xs text-muted-foreground-strong">{basisDetails}</span>
      )}
    </span>
  );
}
