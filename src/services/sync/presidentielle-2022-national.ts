/**
 * National results of the 2022 presidential election, as proclaimed by the Conseil
 * constitutionnel. Pure data and planning: the script scripts/fix-presidentielle-2022-national.ts
 * reads the base, prints the plan and writes it.
 *
 * Round 1: décision n° 2022-195 PDR du 13 avril 2022 (déclaration des résultats du premier tour).
 * Round 2: décision n° 2022-197 PDR du 27 avril 2022 (proclamation des résultats).
 * Qualified for round 2: décision n° 2022-196 PDR du 13 avril 2022.
 */

import { normalizeCandidateName } from "./presidentielle-communes";

export const CC_ROUND1_URL = "https://www.conseil-constitutionnel.fr/decision/2022/2022195PDR.htm";
export const CC_ROUND2_URL = "https://www.conseil-constitutionnel.fr/decision/2022/2022197PDR.htm";

export interface RoundTotals {
  registeredVoters: number;
  actualVoters: number;
  blankVotes: number;
  nullVotes: number;
  validVotes: number;
}

export const ROUND_TOTALS_2022: Record<1 | 2, RoundTotals> = {
  1: {
    registeredVoters: 48_747_876,
    actualVoters: 35_923_707,
    blankVotes: 543_609,
    nullVotes: 247_151,
    validVotes: 35_132_947,
  },
  2: {
    registeredVoters: 48_752_339,
    actualVoters: 35_096_478,
    blankVotes: 2_233_904,
    nullVotes: 805_249,
    validVotes: 32_057_325,
  },
};

export interface Candidate2022 {
  candidateName: string;
  /** Wikidata item of the candidate: a fiche is linked only if it carries this exact item. */
  wikidataId: string;
  partyLabel: string;
  /** Party slug used only when the candidacy has to be created. */
  partySlug: string | null;
  round1Votes: number;
  round2Votes: number | null;
  isElected: boolean;
}

/** Order of the 2022-195 PDR declaration (ballot order). */
export const CANDIDATES_2022: Candidate2022[] = [
  {
    candidateName: "Nathalie Arthaud",
    wikidataId: "Q439490",
    partyLabel: "LO",
    partySlug: "lutte-ouvriere",
    round1Votes: 197_094,
    round2Votes: null,
    isElected: false,
  },
  {
    candidateName: "Fabien Roussel",
    wikidataId: "Q30388733",
    partyLabel: "PCF",
    partySlug: null,
    round1Votes: 802_422,
    round2Votes: null,
    isElected: false,
  },
  {
    candidateName: "Emmanuel Macron",
    wikidataId: "Q3052772",
    partyLabel: "Renaissance",
    partySlug: null,
    round1Votes: 9_783_058,
    round2Votes: 18_768_639,
    isElected: true,
  },
  {
    candidateName: "Jean Lassalle",
    wikidataId: "Q3173022",
    partyLabel: "Résistons !",
    partySlug: null,
    round1Votes: 1_101_387,
    round2Votes: null,
    isElected: false,
  },
  {
    candidateName: "Marine Le Pen",
    wikidataId: "Q12927",
    partyLabel: "RN",
    partySlug: null,
    round1Votes: 8_133_828,
    round2Votes: 13_288_686,
    isElected: false,
  },
  {
    candidateName: "Éric Zemmour",
    wikidataId: "Q288477",
    partyLabel: "Reconquête",
    partySlug: null,
    round1Votes: 2_485_226,
    round2Votes: null,
    isElected: false,
  },
  {
    candidateName: "Jean-Luc Mélenchon",
    wikidataId: "Q5829",
    partyLabel: "LFI",
    partySlug: null,
    round1Votes: 7_712_520,
    round2Votes: null,
    isElected: false,
  },
  {
    candidateName: "Anne Hidalgo",
    wikidataId: "Q2851133",
    partyLabel: "PS",
    partySlug: null,
    round1Votes: 616_478,
    round2Votes: null,
    isElected: false,
  },
  {
    candidateName: "Yannick Jadot",
    wikidataId: "Q441791",
    partyLabel: "EELV",
    partySlug: null,
    round1Votes: 1_627_853,
    round2Votes: null,
    isElected: false,
  },
  {
    candidateName: "Valérie Pécresse",
    wikidataId: "Q455023",
    partyLabel: "LR",
    partySlug: null,
    round1Votes: 1_679_001,
    round2Votes: null,
    isElected: false,
  },
  {
    candidateName: "Philippe Poutou",
    wikidataId: "Q2631198",
    partyLabel: "NPA",
    partySlug: "nouveau-parti-anticapitaliste",
    round1Votes: 268_904,
    round2Votes: null,
    isElected: false,
  },
  {
    candidateName: "Nicolas Dupont-Aignan",
    wikidataId: "Q12961",
    partyLabel: "DLF",
    partySlug: null,
    round1Votes: 725_176,
    round2Votes: null,
    isElected: false,
  },
];

/** Share of the valid votes, two decimals, as the ministry and the Conseil publish it. */
export function sharePct(votes: number, validVotes: number): number {
  return Math.round((votes / validVotes) * 10_000) / 100;
}

export function participationPct(totals: RoundTotals): number {
  return Math.round((totals.actualVoters / totals.registeredVoters) * 10_000) / 100;
}

export interface CandidacyResultFields {
  round1Votes: number;
  round1Pct: number;
  round1Qualified: boolean;
  round2Votes: number | null;
  round2Pct: number | null;
  isElected: boolean;
}

export function targetFields(c: Candidate2022): CandidacyResultFields {
  return {
    round1Votes: c.round1Votes,
    round1Pct: sharePct(c.round1Votes, ROUND_TOTALS_2022[1].validVotes),
    round1Qualified: c.round2Votes != null,
    round2Votes: c.round2Votes,
    round2Pct:
      c.round2Votes != null ? sharePct(c.round2Votes, ROUND_TOTALS_2022[2].validVotes) : null,
    isElected: c.isElected,
  };
}

export interface ExistingCandidacy {
  id: string;
  candidateName: string;
  politicianId: string | null;
  /** Wikidata items carried by the linked fiche, empty when none or no fiche. */
  politicianWikidataIds: string[];
}

export type LinkDecision =
  | { action: "keep" }
  | { action: "unlink"; reason: string }
  | { action: "link"; politicianId: string }
  | { action: "none"; reason: string };

/**
 * A candidacy stays linked to a fiche only when that fiche carries the candidate's Wikidata item.
 * A new candidacy is linked only to a fiche with the exact same name AND that item.
 */
export function decideLink(
  candidate: Candidate2022,
  existing: ExistingCandidacy | null,
  sameNameFiches: Array<{ id: string; wikidataIds: string[] }>
): LinkDecision {
  if (existing?.politicianId) {
    return existing.politicianWikidataIds.includes(candidate.wikidataId)
      ? { action: "keep" }
      : {
          action: "unlink",
          reason: `fiche liée sans l'élément Wikidata ${candidate.wikidataId} (porte ${existing.politicianWikidataIds.join(", ") || "aucun"})`,
        };
  }
  const certain = sameNameFiches.filter((f) => f.wikidataIds.includes(candidate.wikidataId));
  if (certain.length === 1) return { action: "link", politicianId: certain[0]!.id };
  return {
    action: "none",
    reason:
      certain.length > 1
        ? "plusieurs fiches portent le même élément Wikidata"
        : `aucune fiche au nom exact portant ${candidate.wikidataId}`,
  };
}

export function findExisting<T extends { candidateName: string }>(
  candidate: Candidate2022,
  rows: T[]
): T | null {
  const key = normalizeCandidateName(candidate.candidateName);
  const matches = rows.filter((r) => normalizeCandidateName(r.candidateName) === key);
  if (matches.length > 1) {
    throw new Error(`Plusieurs candidatures pour ${candidate.candidateName}`);
  }
  return matches[0] ?? null;
}
