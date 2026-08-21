import type { CandidacyStatus } from "@/generated/prisma";

/**
 * What the field's filter chips mean, as a policy rather than as inline predicates.
 *
 * Here rather than in the component because these are editorial definitions, not presentation:
 * "pressenties" covering both PRESSENTI and ENVISAGE is a decision about what the reader is being
 * shown, and it deserves a test that does not have to render a list to make its point.
 *
 * There is deliberately no sort control. The only defensible order is the one the section
 * announces, by surname, and a menu offering one option is furniture. A "par mesures" order would
 * rank candidacies by the volume of OUR extraction, which reads as a leaderboard of programme
 * quality and is exactly the ranking this site does not publish.
 */

export const CANDIDACY_FILTERS = ["toutes", "annoncees", "pressenties", "retirees"] as const;

export type CandidacyFilter = (typeof CANDIDACY_FILTERS)[number];

export const CANDIDACY_FILTER_LABELS: Record<CandidacyFilter, string> = {
  toutes: "Toutes",
  annoncees: "Candidatures annoncées",
  pressenties: "Personnalités pressenties",
  retirees: "Candidatures retirées",
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
  announced: number;
  expected: number;
  withdrawn: number;
};

export function countCandidacyField(candidacies: FilterableCandidacy[]): CandidacyFieldCounts {
  return {
    total: candidacies.length,
    announced: candidacies.filter((c) => c.status === "DECLARE").length,
    expected: candidacies.filter((c) => c.status === "PRESSENTI" || c.status === "ENVISAGE").length,
    withdrawn: candidacies.filter((c) => c.status === "RETIRE").length,
  };
}

export function formatCandidacyFieldSummary(candidacies: FilterableCandidacy[]): string {
  const counts = countCandidacyField(candidacies);
  return `${counts.total} ${counts.total === 1 ? "personne suivie" : "personnes suivies"} pour 2027 : ${counts.announced} ${counts.announced === 1 ? "candidature annoncée" : "candidatures annoncées"}, ${counts.expected} ${counts.expected === 1 ? "personnalité pressentie" : "personnalités pressenties"} et ${counts.withdrawn} ${counts.withdrawn === 1 ? "candidature retirée" : "candidatures retirées"}.`;
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
