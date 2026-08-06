import type { VoteRelation } from "@/lib/measures/vote-relation";
import {
  VOTE_RELATION_BASIS_LABELS,
  VOTE_RELATION_PILL_CLASS,
  VOTE_RELATION_POSITION_LABELS,
} from "@/config/labels";

/**
 * The nine states of `deriveVoteRelation()` on two axes (spec §9.2): a short position pill (only when
 * there is a position to state) and a longer, sourced basis line. Keeping the two on separate lines is
 * what let the column fit; the decomposition does not change the nine states.
 *
 * `basisDetails` carries the sourced detail (scrutin number, chamber, legislatures, verification date).
 * It is composed by the caller from the reference link, since `deriveVoteRelation()` is pure and does
 * not carry link metadata.
 */
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
  const pill = VOTE_RELATION_PILL_CLASS[relation];

  return (
    <span className={className ? `flex flex-col gap-0.5 ${className}` : "flex flex-col gap-0.5"}>
      {position !== null && (
        <span
          data-vote-position
          className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${pill}`}
        >
          {position}
        </span>
      )}
      <span className="text-xs text-muted-foreground">
        {basisDetails ? `${basis} : ${basisDetails}` : basis}
      </span>
    </span>
  );
}
