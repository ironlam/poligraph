/**
 * `deriveVoteRelation()` : the nine descriptive states of a measure's relation to recorded votes.
 *
 * Authority: spec §9.2. This is a PURE aggregation over links that already carry a resolved position.
 * It does NOT read a scrutin nor compute favorable/défavorable from a vote: that resolution (including
 * the suppression-amendment polarity trap) happens upstream, at link creation in admin, and is written
 * into `position`. Keeping it pure lets the render path stay fast and testable, and lets the attachment
 * engine evolve without touching what the badge shows.
 *
 * The governing rule (§9.2): no available vote datum ever renders as "recherche non effectuée". That
 * state is reserved for the case where no link exists in the database at all. The derivation is
 * independent of the order of the links.
 */

export type MeasureVotePosition = "FAVORABLE" | "DEFAVORABLE" | "ABSTENTION" | "ABSENCE";
export type MeasureVoteLinkKind = "SAME_OBJECT" | "BROADER_TEXT" | "NO_VOTE_IDENTIFIED";

export type VoteRelationLink = {
  linkKind: MeasureVoteLinkKind;
  applicableRevisionId: string;
  /** Resolved at write time for a SAME_OBJECT link tied to a scrutin; null otherwise. */
  position: MeasureVotePosition | null;
};

export type VoteRelation =
  | "FAVORABLE_SAME_OBJECT"
  | "DEFAVORABLE_SAME_OBJECT"
  | "ABSTENTION_SAME_OBJECT"
  | "ABSENCE_SAME_OBJECT"
  | "DIFFERENT_POSITIONS"
  | "BROADER_TEXT"
  | "NOT_RECHECKED_SINCE_REFORMULATION"
  | "NO_VOTE_IN_SCOPE"
  | "SEARCH_NOT_DONE";

const POSITION_STATE: Record<MeasureVotePosition, VoteRelation> = {
  FAVORABLE: "FAVORABLE_SAME_OBJECT",
  DEFAVORABLE: "DEFAVORABLE_SAME_OBJECT",
  ABSTENTION: "ABSTENTION_SAME_OBJECT",
  ABSENCE: "ABSENCE_SAME_OBJECT",
};

export function deriveVoteRelation(
  links: VoteRelationLink[],
  publishedRevisionId: string
): VoteRelation {
  // Priority 1: zero links is the only path to "recherche non effectuée".
  if (links.length === 0) return "SEARCH_NOT_DONE";

  const applicable = links.filter((l) => l.applicableRevisionId === publishedRevisionId);
  // Links exist, but none on the published revision: the measure was reformulated since.
  if (applicable.length === 0) return "NOT_RECHECKED_SINCE_REFORMULATION";

  // Priority 2-3: any SAME_OBJECT on the published revision decides, by its distinct positions.
  const sameObject = applicable.filter((l) => l.linkKind === "SAME_OBJECT");
  if (sameObject.length > 0) {
    const positions = new Set<MeasureVotePosition>();
    for (const l of sameObject) {
      if (l.position !== null) positions.add(l.position);
    }
    if (positions.size >= 2) return "DIFFERENT_POSITIONS";
    // Exactly one distinct position, whether it came from one link or several.
    const [only] = positions;
    if (only !== undefined) return POSITION_STATE[only];
    // Degenerate input: SAME_OBJECT links without any resolved position. The write constraints
    // (§5.8) forbid it, so treat it as no usable same-object signal and fall through.
  }

  // Priority 4: a vote on a broader text is a datum; it outranks a mere "no vote identified".
  if (applicable.some((l) => l.linkKind === "BROADER_TEXT")) return "BROADER_TEXT";

  // Priority 5: only NO_VOTE_IDENTIFIED remains, a bounded, dated constatation.
  return "NO_VOTE_IN_SCOPE";
}
