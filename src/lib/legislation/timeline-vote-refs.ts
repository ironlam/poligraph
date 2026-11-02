const VOTE_REF_RE = /^VTANR5L\d+V\d+$/;

function collectVoteRefs(value: unknown, refs: Set<string>): void {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (VOTE_REF_RE.test(normalized)) refs.add(normalized);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectVoteRefs(item, refs);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const nested of Object.values(value as Record<string, unknown>)) {
    collectVoteRefs(nested, refs);
  }
}

/** Extract exact official scrutin references from one AN legislative act. */
export function extractDossierVoteRefs(value: unknown): string[] {
  const refs = new Set<string>();
  collectVoteRefs(value, refs);
  return [...refs];
}

/** Check the vote references preserved in the public dossier timeline. */
export function timelineContainsVoteRef(timeline: unknown, voteRef: string): boolean {
  if (!VOTE_REF_RE.test(voteRef)) return false;
  return extractDossierVoteRefs(timeline).includes(voteRef);
}
