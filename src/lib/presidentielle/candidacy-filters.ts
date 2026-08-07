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

export const CANDIDACY_FILTERS = ["toutes", "declarees", "pressenties", "depouillees"] as const;

export type CandidacyFilter = (typeof CANDIDACY_FILTERS)[number];

export const CANDIDACY_FILTER_LABELS: Record<CandidacyFilter, string> = {
  toutes: "Toutes",
  declarees: "Déclarées",
  pressenties: "Pressenties",
  depouillees: "Programme dépouillé",
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
    case "declarees":
      return candidacy.status === "DECLARE";
    // Both, because the difference between "pressentie" and "évoquée" is a degree of sourcing and
    // not a different thing: a reader filtering on "pressenties" wants everyone not yet declared.
    case "pressenties":
      return candidacy.status === "PRESSENTI" || candidacy.status === "ENVISAGE";
    // Our own extraction, not a claim about the candidacy. A row with no measure can still have
    // published a programme.
    case "depouillees":
      return candidacy.measureCount > 0;
    default: {
      const exhaustive: never = filter;
      return exhaustive;
    }
  }
}

/** Accent and case insensitive, so "melenchon" finds "Mélenchon" and "lo" finds "Lutte ouvrière". */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function matchesCandidacyQuery(candidacy: FilterableCandidacy, query: string): boolean {
  const needle = fold(query);
  if (needle === "") return true;
  return (
    fold(candidacy.candidateName).includes(needle) ||
    fold(candidacy.partyLabel ?? "").includes(needle) ||
    fold(candidacy.partyShortName ?? "").includes(needle)
  );
}
