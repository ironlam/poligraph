export interface GroupAtStakeCount {
  atStake: number;
}

export interface GroupAttributionCoverage {
  unattributedAtStake: number;
  isConsistent: boolean;
}

/** Compare dynamic attribution with the statutory total without filling any gap. */
export function getGroupAttributionCoverage(
  groups: readonly GroupAtStakeCount[],
  statutorySeatsAtStake: number
): GroupAttributionCoverage {
  const attributed = groups.reduce((total, group) => total + group.atStake, 0);
  return {
    unattributedAtStake: Math.max(0, statutorySeatsAtStake - attributed),
    isConsistent: attributed <= statutorySeatsAtStake,
  };
}
