/**
 * Prev/next resolution within a listing perimeter, kept pure so it can be unit
 * tested without a database. The ordered list is produced by the same WHERE +
 * ORDER BY as /affaires (see getAffairNeighborsList), so the neighbours match the
 * order the reader was browsing.
 */

export interface AffairNeighborRef {
  slug: string;
  title: string;
}

export interface AffairNeighbors {
  prev: AffairNeighborRef | null;
  next: AffairNeighborRef | null;
  /** 1-based position in the perimeter, or null when the current affair is not in it. */
  position: number | null;
  total: number;
}

export function pickNeighbors(ordered: AffairNeighborRef[], currentSlug: string): AffairNeighbors {
  const index = ordered.findIndex((a) => a.slug === currentSlug);
  const total = ordered.length;

  if (index === -1) {
    // The affair is not in the current filter perimeter (filters changed, or it
    // was reached without a listing). No neighbours to offer.
    return { prev: null, next: null, position: null, total };
  }

  return {
    prev: index > 0 ? ordered[index - 1]! : null,
    next: index < total - 1 ? ordered[index + 1]! : null,
    position: index + 1,
    total,
  };
}
