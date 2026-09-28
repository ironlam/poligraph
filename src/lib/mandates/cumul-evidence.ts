/**
 * Deciding which of two incompatible mandates has actually ended.
 *
 * A sitting member of parliament cannot also be mayor. LO 141-1, LO 151 II and LO 297 set no
 * population threshold: the holder has thirty days to choose, and at the end of that period the
 * older mandate ends by operation of law.
 *
 * In practice the register lags and nobody tells us which way the choice went, so the database
 * shows both mandates as current. Measured on 2026-09-28, twelve people are in that state.
 *
 * A parliamentary vote cast after the option period closed proves the seat was kept. It proves
 * NOTHING about the local mandate, and that distinction cost a mistake: nine mayoral mandates
 * were closed on 2026-09-28 on the strength of a vote, including Éric Ciotti's, while the
 * register published on 2026-08-11 names him mayor of Nice since 27 March. They were restored
 * the same evening.
 *
 * So the vote only settles anything when nothing else speaks for the local mandate. A local
 * mandate its own source confirms after the deadline is two recent sources contradicting each
 * other, which is a question for a human and never a write.
 *
 * What this also refuses to do: infer an end from the absence of a vote. Our Senate vote
 * coverage stops in July 2025, so a senator with no recent vote is a gap in our data, not a
 * resignation.
 *
 * With no `lastConfirmedAt` on a mandate, a caller that cannot establish `localConfirmedAt` for
 * itself passes null and gets the vote-only reading. That is why the plan made this task depend
 * on the field: without it, almost everything should come out as skip.
 */

/** Thirty days from taking local office, after which the older mandate ends by law. */
const OPTION_PERIOD_MS = 30 * 86_400_000;

export function optionDeadline(localStartDate: Date): Date {
  return new Date(localStartDate.getTime() + OPTION_PERIOD_MS);
}

export type CumulDecision =
  | { action: "close-local"; endDate: Date; reason: string }
  | { action: "skip"; reason: string };

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Whether the evidence lets us close the local mandate, and on what date.
 *
 * The end date is the option deadline itself, not the day we noticed: that is the date the law
 * attaches to, and it keeps the mandate's history honest rather than stamping it with the day a
 * script happened to run.
 */
export function decideCumul(input: {
  localStartDate: Date;
  lastParliamentaryVote: Date | null;
  /** When the local mandate's own source last said this person holds it. */
  localConfirmedAt: Date | null;
  now?: Date;
}): CumulDecision {
  const deadline = optionDeadline(input.localStartDate);
  const now = input.now ?? new Date();

  if (now.getTime() < deadline.getTime()) {
    return {
      action: "skip",
      reason: `délai d'option en cours jusqu'au ${day(deadline)}, le cumul est légal`,
    };
  }

  if (input.localConfirmedAt !== null && input.localConfirmedAt.getTime() > deadline.getTime()) {
    return {
      action: "skip",
      reason: `mandat local confirmé par sa source le ${day(input.localConfirmedAt)}, postérieur au délai d'option du ${day(deadline)} : deux sources se contredisent`,
    };
  }

  if (input.lastParliamentaryVote === null) {
    return { action: "skip", reason: "aucun vote parlementaire connu" };
  }

  if (input.lastParliamentaryVote.getTime() <= deadline.getTime()) {
    return {
      action: "skip",
      reason: `dernier vote du ${day(input.lastParliamentaryVote)}, antérieur au délai d'option du ${day(deadline)}`,
    };
  }

  return {
    action: "close-local",
    endDate: deadline,
    reason: `vote parlementaire du ${day(input.lastParliamentaryVote)}, postérieur au délai d'option du ${day(deadline)}`,
  };
}
