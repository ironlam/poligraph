/**
 * Control invariants for the pre-ballot capture of the Senate's composition.
 *
 * The capture happens once and can never be redone, so it has to be checked before it
 * is trusted rather than after. These predicates are pure so they can be tested
 * without a database, and they are the same ones the capture script runs.
 *
 * They are stated as (held, atStake) pairs and never as group names. Two reasons: a
 * group can be renamed between now and the ballot, and naming parties in verification
 * code is the first step towards party-asymmetric logic, which AGENTS.md §2 forbids
 * outright. The pairs identify the groups without designating them.
 */

import type { OutgoingSenateComposition } from "@/types/stats-snapshots";

export const EXPECTED_TOTAL_SEATS = 348;
export const EXPECTED_SEATS_AT_STAKE = 178;

/**
 * Group exposures that must be present, from the figures published for this renewal:
 * 77 of 131, 30 of 59, and 4 of 18.
 *
 * The 107-of-190 figure for the outgoing senatorial majority is the sum of the first
 * two, so it is not checked separately: verifying both pairs already pins it, and
 * 131 + 59 = 190 needs no assertion.
 *
 * An earlier version derived the majority as "the two groups holding the most seats".
 * That is wrong: the second largest group by seats held (64) is not the one in the
 * majority (59), so the rank-based sum gives 195, not 190. It happened to match on
 * seats at stake because both groups have 30, which is exactly how a wrong invariant
 * survives review. Identify a group by its pair, never by its rank.
 */
export const EXPECTED_GROUP_EXPOSURES: Array<{ held: number; atStake: number }> = [
  { held: 131, atStake: 77 },
  { held: 59, atStake: 30 },
  { held: 18, atStake: 4 },
];

/**
 * Everything wrong with a candidate capture. Empty means it is safe to write.
 */
export function verifyComposition(composition: OutgoingSenateComposition): string[] {
  const problems: string[] = [];

  if (composition.totalSeats !== EXPECTED_TOTAL_SEATS) {
    problems.push(`total des sièges : ${composition.totalSeats}, attendu ${EXPECTED_TOTAL_SEATS}`);
  }
  if (composition.seatsAtStake !== EXPECTED_SEATS_AT_STAKE) {
    problems.push(
      `sièges remis en jeu : ${composition.seatsAtStake}, attendu ${EXPECTED_SEATS_AT_STAKE}`
    );
  }
  if (composition.seats.length !== EXPECTED_SEATS_AT_STAKE) {
    problems.push(
      `sièges capturés : ${composition.seats.length}, attendu ${EXPECTED_SEATS_AT_STAKE}`
    );
  }

  const wrongSeries = composition.seats.filter((seat) => seat.series !== 2);
  if (wrongSeries.length > 0) {
    problems.push(
      `${wrongSeries.length} siège(s) capturé(s) hors de la série renouvelée, dont ${wrongSeries[0]!.fullName}`
    );
  }

  const duplicates =
    composition.seats.length - new Set(composition.seats.map((s) => s.politicianId)).size;
  if (duplicates > 0) {
    problems.push(`${duplicates} sénateur(s) capturé(s) deux fois`);
  }

  const missingId = composition.seats.filter((s) => !s.politicianId || !s.fullName);
  if (missingId.length > 0) {
    problems.push(`${missingId.length} siège(s) sans identifiant ou sans nom`);
  }

  // Group exposures must add up to the seat counts, otherwise the aggregate and the
  // individual rows disagree and neither can be trusted.
  const groupHeld = composition.groups.reduce((sum, g) => sum + g.held, 0);
  const groupAtStake = composition.groups.reduce((sum, g) => sum + g.atStake, 0);
  if (groupHeld !== composition.totalSeats) {
    problems.push(
      `somme des sièges par groupe : ${groupHeld}, incohérente avec le total ${composition.totalSeats}`
    );
  }
  if (groupAtStake !== composition.seatsAtStake) {
    problems.push(
      `somme des sièges remis en jeu par groupe : ${groupAtStake}, incohérente avec ${composition.seatsAtStake}`
    );
  }

  // Each expected pair must be matched by a distinct group row, so one group cannot
  // satisfy two expectations at once.
  const unmatched = [...composition.groups];
  for (const expected of EXPECTED_GROUP_EXPOSURES) {
    const index = unmatched.findIndex(
      (g) => g.held === expected.held && g.atStake === expected.atStake
    );
    if (index === -1) {
      problems.push(`aucun groupe à ${expected.atStake} sièges remis en jeu sur ${expected.held}`);
      continue;
    }
    unmatched.splice(index, 1);
  }

  return problems;
}
