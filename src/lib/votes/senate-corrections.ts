import {
  SENATE_VOTE_CORRECTIONS,
  type SenateVoteCorrection,
} from "@/config/senate-vote-corrections";
import type { SenateSourceVote } from "@/lib/votes/senate-participation";

/**
 * Apply the corrections of one scrutin to the rows of the Senate file. A row is changed only
 * if it still carries the vote the correction expects, so a file fixed by the Senate is left
 * as published.
 */
export function applySenateVoteCorrections(
  scrutin: string,
  votes: SenateSourceVote[],
  corrections: SenateVoteCorrection[] = SENATE_VOTE_CORRECTIONS
): SenateSourceVote[] {
  const applicable = corrections.filter((correction) => correction.scrutin === scrutin);
  if (applicable.length === 0) return votes;

  return votes.map((vote) => {
    const correction = applicable.find(
      (candidate) =>
        candidate.matricule === vote.matricule &&
        typeof vote.vote === "string" &&
        candidate.from === vote.vote.toLowerCase()
    );
    return correction ? { ...vote, vote: correction.to } : vote;
  });
}
