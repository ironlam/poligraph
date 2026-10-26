/**
 * Keeps an article only when it cites at least one candidate no kept article cites yet, in input
 * order, up to `limit`.
 *
 * Coverage concentrates on a few candidates; a raw "latest articles" list would repeat that
 * concentration on a page meant to treat every candidacy alike (non-partisanship, AGENTS.md §2).
 */
export function keepArticlesCitingNewCandidates<T extends { candidateIds: readonly string[] }>(
  articles: readonly T[],
  limit: number
): T[] {
  const kept: T[] = [];
  const cited = new Set<string>();
  for (const article of articles) {
    if (kept.length === limit) break;
    const fresh = article.candidateIds.filter((id) => !cited.has(id));
    if (fresh.length === 0) continue;
    for (const id of article.candidateIds) cited.add(id);
    kept.push(article);
  }
  return kept;
}
