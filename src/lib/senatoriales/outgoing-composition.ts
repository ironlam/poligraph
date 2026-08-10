/**
 * Control invariants for the pre-ballot capture of the Senate's composition.
 *
 * The capture happens once and can never be redone, so it is checked before it is
 * trusted rather than after. These predicates are pure, so they run in tests without a
 * database, and the capture script runs exactly the same ones.
 *
 * Validation is **exhaustive and symmetric**: every one of the nine Senate groups is
 * declared by `ParliamentaryGroup.code`, and every one is checked the same way. Naming
 * groups in reference data is not partisan logic; applying a different rule to one
 * group would be, and none of that happens here.
 *
 * An earlier version listed only three anonymous `(held, atStake)` pairs, to avoid
 * writing group names. That was weaker on two counts: a pair is an unlabelled
 * fingerprint that survives an identity permutation between two groups with the same
 * numbers, and six groups went unchecked entirely. It also produced an outright wrong
 * invariant when the majority was derived by rank: the second largest group by seats
 * held has 64, the majority partner has 59, so ranking sums to 195 rather than 190. It
 * matched on seats at stake because both have 30, which is how a wrong invariant
 * survives review.
 */

import type { OutgoingSenateComposition } from "@/types/stats-snapshots";

export const EXPECTED_TOTAL_SEATS = 348;
export const EXPECTED_SEATS_AT_STAKE = 178;

export interface GroupExposureExpectation {
  held: number;
  atStake: number;
}

/**
 * The full Senate as it stands before the 27 September 2026 renewal, by group code.
 *
 * Sums to 348 held and 178 at stake, and reproduces the published figures: 77 of 131
 * for Les Républicains, 4 of 18 for the communist group, and 107 of 190 for the
 * outgoing majority (LR plus Union Centriste, 77 + 30 of 131 + 59).
 */
export const EXPECTED_SENATE_COMPOSITION: Record<string, GroupExposureExpectation> = {
  LR: { held: 131, atStake: 77 }, // Les Républicains
  SER: { held: 64, atStake: 30 }, // Socialiste, Écologiste et Républicain
  UC: { held: 59, atStake: 30 }, // Union Centriste
  LIRT: { held: 20, atStake: 9 }, // Les Indépendants - République et Territoires
  RDPI: { held: 19, atStake: 11 }, // Rassemblement des démocrates, progressistes et indépendants
  "CRCE-K": { held: 18, atStake: 4 }, // Communiste, Républicain, Citoyen et Écologiste - Kanaky
  RDSE: { held: 17, atStake: 9 }, // Rassemblement Démocratique et Social Européen
  GEST: { held: 16, atStake: 7 }, // Écologiste - Solidarité et Territoires
  NI: { held: 4, atStake: 1 }, // Non-inscrits
};

/** Groups whose seats form the outgoing senatorial majority, for reporting only. */
export const OUTGOING_MAJORITY_CODES = ["LR", "UC"] as const;

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

  const incomplete = composition.seats.filter((s) => !s.politicianId || !s.fullName);
  if (incomplete.length > 0) {
    problems.push(`${incomplete.length} siège(s) sans identifiant ou sans nom`);
  }

  const seatsWithoutGroup = composition.seats.filter((s) => !s.groupCode);
  if (seatsWithoutGroup.length > 0) {
    problems.push(
      `${seatsWithoutGroup.length} siège(s) sans code de groupe, dont ${seatsWithoutGroup[0]!.fullName}`
    );
  }

  // ─── Aggregate: every group, same check, both directions ───

  const duplicateGroups =
    composition.groups.length - new Set(composition.groups.map((g) => g.groupCode)).size;
  if (duplicateGroups > 0) {
    problems.push(`${duplicateGroups} groupe(s) présent(s) deux fois dans l'agrégat`);
  }

  const byCode = new Map(composition.groups.map((g) => [g.groupCode, g]));

  for (const [code, expected] of Object.entries(EXPECTED_SENATE_COMPOSITION)) {
    const actual = byCode.get(code);
    if (!actual) {
      problems.push(`groupe ${code} absent de l'agrégat`);
      continue;
    }
    if (actual.held !== expected.held || actual.atStake !== expected.atStake) {
      problems.push(
        `groupe ${code} : ${actual.atStake} sur ${actual.held}, attendu ` +
          `${expected.atStake} sur ${expected.held}`
      );
    }
  }

  for (const group of composition.groups) {
    if (!(group.groupCode in EXPECTED_SENATE_COMPOSITION)) {
      problems.push(`groupe ${group.groupCode} inattendu dans l'agrégat`);
    }
  }

  const groupHeld = composition.groups.reduce((sum, g) => sum + g.held, 0);
  const groupAtStake = composition.groups.reduce((sum, g) => sum + g.atStake, 0);
  if (groupHeld !== EXPECTED_TOTAL_SEATS) {
    problems.push(`somme des sièges par groupe : ${groupHeld}, attendu ${EXPECTED_TOTAL_SEATS}`);
  }
  if (groupAtStake !== EXPECTED_SEATS_AT_STAKE) {
    problems.push(
      `somme des sièges remis en jeu par groupe : ${groupAtStake}, attendu ${EXPECTED_SEATS_AT_STAKE}`
    );
  }

  // ─── The 178 individual rows must agree with the aggregate ───

  const seatsPerCode = new Map<string, number>();
  for (const seat of composition.seats) {
    if (!seat.groupCode) continue;
    seatsPerCode.set(seat.groupCode, (seatsPerCode.get(seat.groupCode) ?? 0) + 1);
  }
  for (const [code, count] of seatsPerCode) {
    const aggregate = byCode.get(code);
    if (!aggregate) {
      problems.push(`groupe ${code} présent sur des sièges capturés mais absent de l'agrégat`);
      continue;
    }
    if (aggregate.atStake !== count) {
      problems.push(
        `groupe ${code} : ${count} siège(s) capturé(s) contre ${aggregate.atStake} annoncé(s) dans l'agrégat`
      );
    }
  }
  for (const group of composition.groups) {
    if (group.atStake > 0 && !seatsPerCode.has(group.groupCode)) {
      problems.push(
        `groupe ${group.groupCode} annonce ${group.atStake} siège(s) remis en jeu mais aucun n'est capturé`
      );
    }
  }

  return problems;
}

/** Held and at-stake seats of the outgoing majority, for the operator's report. */
export function summariseOutgoingMajority(composition: OutgoingSenateComposition): {
  held: number;
  atStake: number;
} {
  const codes = new Set<string>(OUTGOING_MAJORITY_CODES);
  return composition.groups
    .filter((g) => codes.has(g.groupCode))
    .reduce((acc, g) => ({ held: acc.held + g.held, atStake: acc.atStake + g.atStake }), {
      held: 0,
      atStake: 0,
    });
}
