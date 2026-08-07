/**
 * What the field says about each candidacy's measures, as a pure function.
 *
 * Pure and here rather than inline in `hub.ts` so the invariant below can be tested without a
 * database: it is the kind of rule that reads as obviously correct and is silently wrong.
 */

export type RollupMeasure = { candidacyId: string | null; theme: string };

export type CandidacyRollup = { measureCount: number; themesCoveredCount: number };

/**
 * Counts a candidacy's measures, but ONLY for candidacies the public surfaces can actually show.
 *
 * The intersection with `publicCandidacyIds` is the whole point, and it is the same invariant
 * `loadThemesIndex` enforces: a measure attached to a candidacy whose `CandidacyPresidential`
 * extension is still DRAFT is rendered by no subject page and reachable on no fiche. Counting it
 * here would announce "3 mesures dépouillées" on a row that leads the reader to nothing, and would
 * do it in the one column added to show what we have actually done.
 *
 * This is not hypothetical: measures are written and published BEFORE the editorial extension is,
 * so the un-intersected count is wrong during the normal editorial flow rather than in some edge
 * case.
 */
export function rollupMeasuresByCandidacy(
  measures: readonly RollupMeasure[],
  publicCandidacyIds: ReadonlySet<string>
): Map<string, CandidacyRollup> {
  const themesByCandidacy = new Map<string, Set<string>>();
  const counts = new Map<string, number>();

  for (const measure of measures) {
    const id = measure.candidacyId;
    if (id === null || !publicCandidacyIds.has(id)) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    const themes = themesByCandidacy.get(id) ?? new Set<string>();
    themes.add(measure.theme);
    themesByCandidacy.set(id, themes);
  }

  return new Map(
    [...counts].map(([id, measureCount]) => [
      id,
      { measureCount, themesCoveredCount: themesByCandidacy.get(id)?.size ?? 0 },
    ])
  );
}

/**
 * Why a candidacy shows no measure, and never a bare zero.
 *
 * `aucun_programme` documents the CANDIDACY: nothing published for this election. `non_depouille`
 * documents US: a programme exists and we have not extracted it. Presenting our own backlog as a
 * candidate's silence is a false claim about a person, which is why these are two values and not a
 * boolean.
 */
export function resolveProgrammeAbsence(
  measureCount: number,
  hasPublishedProgramme: boolean
): "aucun_programme" | "non_depouille" | null {
  if (measureCount > 0) return null;
  return hasPublishedProgramme ? "non_depouille" : "aucun_programme";
}
