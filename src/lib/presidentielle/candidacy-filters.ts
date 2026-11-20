import type { CandidacyStatus } from "@/generated/prisma";

/**
 * What the field's filter chips mean, as a policy rather than as inline predicates.
 *
 * Here rather than in the component because these are editorial definitions, not presentation:
 * "pressenties" covering both PRESSENTI and ENVISAGE is a decision about what the reader is being
 * shown, and it deserves a test that does not have to render a list to make its point.
 *
 * The default order is the one the section announces, by surname. Two other orders are offered:
 * by latest update, which says when we last wrote about a candidacy (a measure published or
 * revised, or a change of status such as a declaration or a withdrawal), and by published
 * measures. The second was long refused, because it ranks candidacies by the volume of OUR
 * extraction and can read as a leaderboard of programme quality. It was accepted on 2026-11-19 on
 * one condition, which the label and `CANDIDACY_SORT_NOTES` carry: the reader is told that the
 * count is Poligraph's coverage, not the size of the programme. Do not drop either wording.
 */

export const CANDIDACY_FILTERS = [
  "toutes",
  "officielles",
  "annoncees",
  "pressenties",
  "retirees",
] as const;

export type CandidacyFilter = (typeof CANDIDACY_FILTERS)[number];

export const CANDIDACY_FILTER_LABELS: Record<CandidacyFilter, string> = {
  toutes: "Toutes",
  officielles: "Candidatures officielles",
  annoncees: "Candidatures annoncées",
  pressenties: "Personnalités pressenties",
  retirees: "Retirées ou non retenues",
};

/** The fields a filter reads, so a caller can pass its own row type unchanged. */
export type FilterableCandidacy = {
  candidateName: string;
  status: CandidacyStatus | null;
  partyLabel: string | null;
  partyShortName: string | null;
  measureCount: number;
};

export function parseCandidacyFilter(raw: string | null): CandidacyFilter {
  return (CANDIDACY_FILTERS as readonly string[]).includes(raw ?? "")
    ? (raw as CandidacyFilter)
    : "toutes";
}

export function matchesCandidacyFilter(
  candidacy: FilterableCandidacy,
  filter: CandidacyFilter
): boolean {
  switch (filter) {
    case "toutes":
      return true;
    case "officielles":
      return candidacy.status === "OFFICIAL";
    case "annoncees":
      return candidacy.status === "DECLARE";
    // Both, because the difference between "pressentie" and "évoquée" is a degree of sourcing and
    // not a different thing: a reader filtering on "pressenties" wants everyone not yet declared.
    case "pressenties":
      return candidacy.status === "PRESSENTI" || candidacy.status === "ENVISAGE";
    case "retirees":
      return candidacy.status === "RETIRE";
    default: {
      const exhaustive: never = filter;
      return exhaustive;
    }
  }
}

export function matchesPublishedProposals(
  candidacy: FilterableCandidacy,
  publishedOnly: boolean
): boolean {
  return !publishedOnly || candidacy.measureCount > 0;
}

export type CandidacyFieldCounts = {
  total: number;
  official: number;
  announced: number;
  expected: number;
  withdrawn: number;
};

export function countCandidacyField(candidacies: FilterableCandidacy[]): CandidacyFieldCounts {
  return {
    total: candidacies.length,
    official: candidacies.filter((c) => c.status === "OFFICIAL").length,
    announced: candidacies.filter((c) => c.status === "DECLARE").length,
    expected: candidacies.filter((c) => c.status === "PRESSENTI" || c.status === "ENVISAGE").length,
    withdrawn: candidacies.filter((c) => c.status === "RETIRE").length,
  };
}

export function formatCandidacyFieldSummary(candidacies: FilterableCandidacy[]): string {
  const counts = countCandidacyField(candidacies);
  return `${counts.total} ${counts.total === 1 ? "personne suivie" : "personnes suivies"} pour 2027 : ${counts.official} ${counts.official === 1 ? "candidature officielle" : "candidatures officielles"}, ${counts.announced} ${counts.announced === 1 ? "candidature annoncée" : "candidatures annoncées"}, ${counts.expected} ${counts.expected === 1 ? "personnalité pressentie" : "personnalités pressenties"} et ${counts.withdrawn} ${counts.withdrawn === 1 ? "candidature retirée ou non retenue" : "candidatures retirées ou non retenues"}.`;
}

/** Accent and case insensitive, so "melenchon" finds "Mélenchon" and "lo" finds "Lutte ouvrière". */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function matchesFoldedValue(value: string, needle: string): boolean {
  const haystack = fold(value);
  if (haystack.includes(needle)) return true;

  const haystackWords = haystack.split(/[^\p{Letter}\p{Number}]+/u).filter(Boolean);
  const needleWords = needle.split(/[^\p{Letter}\p{Number}]+/u).filter(Boolean);
  return needleWords.every((word) => haystackWords.some((candidate) => candidate.startsWith(word)));
}

export function matchesCandidacyQuery(candidacy: FilterableCandidacy, query: string): boolean {
  const needle = fold(query);
  if (needle === "") return true;
  return (
    matchesFoldedValue(candidacy.candidateName, needle) ||
    matchesFoldedValue(candidacy.partyLabel ?? "", needle) ||
    matchesFoldedValue(candidacy.partyShortName ?? "", needle)
  );
}

export const CANDIDACY_SORTS = ["alphabetique", "recentes", "mesures"] as const;

export type CandidacySort = (typeof CANDIDACY_SORTS)[number];

export const CANDIDACY_SORT_LABELS: Record<CandidacySort, string> = {
  alphabetique: "Ordre alphabétique",
  recentes: "Dernières mises à jour",
  mesures: "Mesures publiées par Poligraph",
};

/** Shown under the control while the order is active. None for the orders that need no caveat. */
export const CANDIDACY_SORT_NOTES: Partial<Record<CandidacySort, string>> = {
  mesures:
    "Ce tri suit le nombre de mesures que Poligraph a publiées à ce jour. Il ne dit rien de l'ampleur ni de la qualité d'un programme.",
};

export function parseCandidacySort(raw: string | null): CandidacySort {
  return (CANDIDACY_SORTS as readonly string[]).includes(raw ?? "")
    ? (raw as CandidacySort)
    : "alphabetique";
}

/**
 * `candidacies` arrives by surname and that order is kept as is, and as the tie-break: candidacies
 * with nothing published yet, and no change of status on record, close the two other orders, still
 * by surname.
 */
export function sortCandidacies<
  T extends {
    lastMeasurePublishedAt?: Date | null;
    statusChangedAt?: Date | null;
    measureCount: number;
  },
>(candidacies: readonly T[], sort: CandidacySort): T[] {
  if (sort === "alphabetique") return [...candidacies];
  const rank =
    sort === "mesures"
      ? (candidacy: T) => candidacy.measureCount
      : (candidacy: T) =>
          Math.max(
            candidacy.lastMeasurePublishedAt?.getTime() ?? -Infinity,
            candidacy.statusChangedAt?.getTime() ?? -Infinity
          );
  return candidacies
    .map((candidacy, index) => ({ candidacy, index }))
    .sort((a, b) => rank(b.candidacy) - rank(a.candidacy) || a.index - b.index)
    .map(({ candidacy }) => candidacy);
}
