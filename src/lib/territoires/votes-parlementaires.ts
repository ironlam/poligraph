/**
 * Wording of the block « Vos parlementaires ont voté » (Territoires v2, D26). Pure.
 *
 * A missing position is never called « absent ». It is « n'a pas pris part au vote » only when
 * the data proves it (see `positionEnMots`), « non enregistrée » otherwise.
 */

export type PositionEnregistree = "POUR" | "CONTRE" | "ABSTENTION" | "NON_VOTANT" | "ABSENT";

const EN_MOTS: Record<PositionEnregistree, string> = {
  POUR: "pour",
  CONTRE: "contre",
  ABSTENTION: "abstention",
  NON_VOTANT: "non-votant",
  ABSENT: "n'a pas pris part au vote",
};

export const POSITION_NON_ENREGISTREE = "position non enregistrée";
export const SANS_VOTE = "n'a pas pris part au vote";

/**
 * `sansVote`: the deputy sat on that day and the recorded positions add up to the official
 * totals of the scrutin, so a missing position means the deputy did not vote. Without that
 * proof the position is only « non enregistrée ».
 */
export function positionEnMots(
  position: PositionEnregistree | undefined,
  sansVote = false
): string {
  if (position) return EN_MOTS[position];
  return sansVote ? SANS_VOTE : POSITION_NON_ENREGISTREE;
}

/**
 * Tally of a group of deputies on one scrutin, without any name: « 5 pour, 3 contre, 1 n'a pas
 * pris part au vote ». Same order for every scrutin and every territory; a count of zero is
 * left out.
 */
export function decompteEnMots(
  positions: Record<string, PositionEnregistree>,
  deputeSlugs: readonly string[],
  sansVote: readonly string[] = []
): string {
  const count = (p: PositionEnregistree) => deputeSlugs.filter((s) => positions[s] === p).length;
  const muets = deputeSlugs.filter((s) => !positions[s]);
  const absents = count("ABSENT") + muets.filter((s) => sansVote.includes(s)).length;
  const inconnus = muets.filter((s) => !sansVote.includes(s)).length;
  const parts: [number, string][] = [
    [count("POUR"), "pour"],
    [count("CONTRE"), "contre"],
    [count("ABSTENTION"), count("ABSTENTION") > 1 ? "abstentions" : "abstention"],
    [count("NON_VOTANT"), count("NON_VOTANT") > 1 ? "non-votants" : "non-votant"],
    [absents, absents > 1 ? "n'ont pas pris part au vote" : SANS_VOTE],
    [inconnus, inconnus > 1 ? "positions non enregistrées" : POSITION_NON_ENREGISTREE],
  ];
  return parts
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(", ");
}
