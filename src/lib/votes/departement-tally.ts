/**
 * Tally of one department on one scrutin, in words. Pure. Fixed order, the same for every
 * department; a count of zero is left out. Only recorded positions are counted: this says who
 * voted what, never who was missing.
 */
export interface DepartementTally {
  pour: number;
  contre: number;
  abstention: number;
  nonVotant: number;
}

export function tallyEnMots(t: DepartementTally): string {
  const parts: [number, string][] = [
    [t.pour, "pour"],
    [t.contre, "contre"],
    [t.abstention, t.abstention > 1 ? "abstentions" : "abstention"],
    [t.nonVotant, t.nonVotant > 1 ? "non-votants" : "non-votant"],
  ];
  return parts
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(", ");
}
