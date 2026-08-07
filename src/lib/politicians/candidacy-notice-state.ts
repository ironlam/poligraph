import { isFicheCandidatPublishable } from "@/config/publication-gates";
import type { PoliticianCandidacy } from "@/lib/data/politician-candidacy";
import { deriveElectionBannerState } from "@/lib/elections/banner-state";

/**
 * The five states of the candidacy notice on a politician's fiche.
 *
 * The rule that matters is the ORDER of evaluation: status first, date second. After the second
 * round, "withdrawn", "merely rumoured" and "the ballot is over" are all true at once, and letting
 * the date win would turn someone who dropped out in February into a former candidate with a results
 * block. That would be wrong twice over: they did not run, and the results are not theirs.
 *
 * Unlike the homepage banner, this state has NO archive window. The 30 days of
 * `FEATURED_ELECTION_ARCHIVE_DAYS` decide what is featured on the homepage; a person's candidacy
 * stays a fact of their career, and the notice keeps it indefinitely.
 */

export type CandidacyResults = {
  round1Pct: number | null;
  round2Pct: number | null;
  isElected: boolean;
};

export type CandidacyNoticeState =
  | { kind: "DECLARED_WITH_MEASURES" }
  | { kind: "DECLARED_EMPTY" }
  | { kind: "POSSIBLE" }
  | { kind: "WITHDRAWN" }
  | { kind: "PAST"; results: CandidacyResults | null };

export function deriveCandidacyNoticeState(
  candidacy: PoliticianCandidacy,
  now: Date
): CandidacyNoticeState {
  // Status before date. A withdrawal and a press mention are both facts about what the person did,
  // and no amount of elapsed time turns either into a participation.
  if (candidacy.status === "RETIRE") return { kind: "WITHDRAWN" };
  if (candidacy.status === "PRESSENTI" || candidacy.status === "ENVISAGE") {
    return { kind: "POSSIBLE" };
  }

  // Reusing the banner derivation rather than re-implementing "is the ballot over": the 20:00 Paris
  // boundary and the no-second-round case are already settled there, and two answers to the same
  // question would eventually disagree.
  const ballot = deriveElectionBannerState({
    round1Date: candidacy.round1Date,
    round2Date: candidacy.round2Date,
    now,
    round1Scores: [],
    winner: null,
  });

  if (ballot?.kind === "AFTER") {
    const hasScore = candidacy.round1Pct !== null || candidacy.round2Pct !== null;
    return {
      kind: "PAST",
      // Strictly conditional. A null score means either "never reached the ballot" or "results not
      // imported yet", and the database has no field distinguishing them. Rendering nothing asserts
      // neither.
      results: hasScore
        ? {
            round1Pct: candidacy.round1Pct,
            round2Pct: candidacy.round2Pct,
            isElected: candidacy.isElected,
          }
        : null,
    };
  }

  return isFicheCandidatPublishable({
    statusSourced: true,
    verifiedMeasuresWithPrimarySource: candidacy.primarySourceMeasureCount,
  })
    ? { kind: "DECLARED_WITH_MEASURES" }
    : { kind: "DECLARED_EMPTY" };
}
