/**
 * Public rendering of a court decision (#536).
 *
 * A decision can be identified by a pourvoi number, an ECLI, a Judilibre id, or
 * only an official URL. Rendering just the pourvoi number therefore produced empty
 * list items for perfectly valid rows. This module decides what a reader sees, and
 * guarantees the result is never empty.
 *
 * `judilibreId` is deliberately never rendered: it is an internal key of an external
 * API, meaningless to a reader, and the official URL says the same thing usefully.
 * The Prisma `id` is never rendered either.
 */

/** The subset of a decision this module reads. */
export interface CourtDecisionDisplayInput {
  id: string;
  ecli?: string | null;
  pourvoiNumber?: string | null;
  court?: string | null;
  chamber?: string | null;
  decisionDate?: Date | null;
  solution?: string | null;
  sourceUrl?: string | null;
  /** Read only to know whether a reference exists at all; never rendered. */
  judilibreId?: string | null;
}

export interface CourtDecisionDisplay {
  /** Reference parts, in reading order. Never empty. */
  parts: string[];
  /** Official source, when there is one. `label` is what a reader clicks. */
  link: { href: string; label: string } | null;
  /** True when nothing public is available, so `parts` holds the fallback wording. */
  isPlaceholder: boolean;
}

/** Shown when a decision is attached but carries no publicly meaningful reference. */
export const NO_PUBLIC_REFERENCE = "Décision rattachée, référence publique non renseignée";

function present(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * What to display for one decision.
 *
 * Both the pourvoi number and the ECLI are shown when both exist: they are two
 * different references, and a reader checking one should not have to guess the other
 * was dropped.
 */
export function buildCourtDecisionDisplay(
  decision: CourtDecisionDisplayInput,
  formatDate: (date: Date) => string
): CourtDecisionDisplay {
  const parts: string[] = [];
  if (present(decision.pourvoiNumber)) parts.push(`Pourvoi n° ${decision.pourvoiNumber}`);
  if (present(decision.ecli)) parts.push(decision.ecli);
  if (present(decision.court)) parts.push(decision.court);
  if (present(decision.chamber)) parts.push(decision.chamber);
  if (decision.decisionDate) parts.push(formatDate(decision.decisionDate));
  if (present(decision.solution)) parts.push(decision.solution);

  const link = present(decision.sourceUrl)
    ? { href: decision.sourceUrl, label: "Consulter la décision sur la source officielle" }
    : null;

  // A row with only a source link, or only a Judilibre id, still has to read as
  // something rather than as a blank bullet.
  if (parts.length === 0 && !link) {
    return { parts: [NO_PUBLIC_REFERENCE], link: null, isPlaceholder: true };
  }
  if (parts.length === 0) {
    return { parts: [NO_PUBLIC_REFERENCE], link, isPlaceholder: true };
  }

  return { parts, link, isPlaceholder: false };
}

/**
 * Stable presentation order: date, then pourvoi, then ECLI, then internal id.
 *
 * The internal id is a tie-breaker only, so the list never reshuffles between two
 * renders. **This order designates no decision as the main one** — it exists so a
 * reader sees a predictable sequence, nothing more.
 */
export function compareCourtDecisionsForDisplay(
  a: CourtDecisionDisplayInput,
  b: CourtDecisionDisplayInput
): number {
  const dateA = a.decisionDate?.getTime();
  const dateB = b.decisionDate?.getTime();
  if (dateA !== undefined && dateB !== undefined && dateA !== dateB) return dateA - dateB;
  // A decision without a date sorts after one that has it: an unknown date cannot
  // claim a position in the chronology.
  if (dateA !== undefined && dateB === undefined) return -1;
  if (dateA === undefined && dateB !== undefined) return 1;

  const pourvoiA = a.pourvoiNumber ?? "";
  const pourvoiB = b.pourvoiNumber ?? "";
  if (pourvoiA !== pourvoiB) return pourvoiA.localeCompare(pourvoiB);

  const ecliA = a.ecli ?? "";
  const ecliB = b.ecli ?? "";
  if (ecliA !== ecliB) return ecliA.localeCompare(ecliB);

  return a.id.localeCompare(b.id);
}

/** Sorts a copy, so a caller's array is never mutated. */
export function sortCourtDecisionsForDisplay<T extends CourtDecisionDisplayInput>(
  decisions: readonly T[]
): T[] {
  return [...decisions].sort(compareCourtDecisionsForDisplay);
}
