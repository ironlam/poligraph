/**
 * Keeps the first row of each candidacy, in input order, up to `limit`.
 *
 * Publication order follows our editorial backlog as much as the campaigns: a batch reviewed for
 * one candidate would otherwise fill a "latest" block on its own. One row per candidacy keeps the
 * block from favouring anyone (non-partisanship, AGENTS.md §2).
 */
export function keepOnePerCandidacy<T extends { candidacyId: string | null }>(
  rows: readonly T[],
  limit: number
): T[] {
  const kept: T[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (kept.length === limit) break;
    if (row.candidacyId === null || seen.has(row.candidacyId)) continue;
    seen.add(row.candidacyId);
    kept.push(row);
  }
  return kept;
}
