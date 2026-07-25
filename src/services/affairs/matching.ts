/**
 * Affair Matching Service
 *
 * Multi-criteria deduplication for judicial affairs from multiple sources.
 * Matches affairs by judicial identifiers (ECLI, pourvoi number, case numbers)
 * and falls back to fuzzy title matching when identifiers are unavailable.
 */

import { db } from "@/lib/db";
import type { AffairCategory } from "@/generated/prisma";

export type MatchConfidence = "CERTAIN" | "HIGH" | "POSSIBLE";

/**
 * Category families for fuzzy duplicate clustering.
 * Affairs from the same news event are often imported with sibling categories
 * (e.g. DETOURNEMENT_FONDS_PUBLICS vs FAVORITISME vs CONFLIT_INTERETS for the
 * same probity investigation), so duplicate detection compares families
 * rather than exact categories. AUTRE acts as a wildcard.
 */
const CATEGORY_FAMILIES: Record<string, string[]> = {
  probite: [
    "CORRUPTION",
    "CORRUPTION_PASSIVE",
    "TRAFIC_INFLUENCE",
    "PRISE_ILLEGALE_INTERETS",
    "FAVORITISME",
    "DETOURNEMENT_FONDS_PUBLICS",
    "EMPLOI_FICTIF",
    "CONFLIT_INTERETS",
    "RECEL",
    "ABUS_BIENS_SOCIAUX",
    "ABUS_CONFIANCE",
    "BLANCHIMENT",
    "FRAUDE_FISCALE",
    "FINANCEMENT_ILLEGAL_CAMPAGNE",
    "FINANCEMENT_ILLEGAL_PARTI",
    "FAUX_ET_USAGE_FAUX",
  ],
  personnes: [
    "VIOLENCE",
    "MENACE",
    "AGRESSION_SEXUELLE",
    "HARCELEMENT_SEXUEL",
    "HARCELEMENT_MORAL",
  ],
  expression: ["DIFFAMATION", "INJURE", "INCITATION_HAINE"],
};

function categoryFamily(category: string): string | null {
  for (const [family, categories] of Object.entries(CATEGORY_FAMILIES)) {
    if (categories.includes(category)) return family;
  }
  return null;
}

/**
 * Check whether two affair categories belong to the same family.
 * AUTRE matches any family (imports frequently fall back to AUTRE
 * when the legal qualification is unclear).
 */
/** Whether a named family pairs these two categories, wildcard aside. */
function sameNamedFamily(a: string, b: string): boolean {
  const familyA = categoryFamily(a);
  const familyB = categoryFamily(b);
  return familyA !== null && familyA === familyB;
}

export function sameCategoryFamily(a: string, b: string): boolean {
  if (a === b) return true;
  if (a === "AUTRE" || b === "AUTRE") return true;
  return sameNamedFamily(a, b);
}

/**
 * Whether the AUTRE wildcard is the only reason these categories pair up.
 *
 * A shared family is evidence about the facts; the wildcard is not, since AUTRE
 * means "no legal qualification was established". Callers ask for a second signal
 * before pairing on it (issue #521). Two AUTRE categories are equal, not paired by
 * the wildcard, so they are excluded here.
 */
export function pairingRestsOnWildcard(a: string, b: string): boolean {
  if (a === b) return false;
  if (a !== "AUTRE" && b !== "AUTRE") return false;
  return !sameNamedFamily(a, b);
}

/**
 * Words that appear in affair titles regardless of which facts they describe:
 * French function words of four letters or more (shorter ones are already dropped
 * by the length filter) and judicial or editorial boilerplate.
 *
 * They must not count as shared vocabulary. "Affaire X" and "Affaire Y" have
 * nothing in common but the word "affaire", and the procedural stage is carried by
 * the status field, not by the title.
 */
const TITLE_NOISE_WORDS = new Set([
  // Function words
  "pour",
  "dans",
  "avec",
  "sans",
  "sous",
  "mais",
  "leur",
  "leurs",
  "cette",
  "entre",
  "contre",
  "apres",
  "avant",
  "chez",
  "meme",
  "aussi",
  "donc",
  "ainsi",
  "plus",
  "tout",
  "tous",
  "toute",
  "toutes",
  // Judicial and editorial boilerplate
  "affaire",
  "affaires",
  "dossier",
  "dossiers",
  "enquete",
  "enquetes",
  "preliminaire",
  "procedure",
  "procedures",
  "plainte",
  "plaintes",
  "plainte",
  "proces",
  "examen",
  "soupcon",
  "soupcons",
  "suspicion",
  "suspicions",
  "accusation",
  "accusations",
  "presume",
  "presumee",
  "presumes",
  "presumees",
  "ouverte",
  "cours",
  "deposee",
  "rendue",
]);

/**
 * The words of a title that can identify which facts it describes.
 *
 * Accents are folded so the same word matches across import spellings.
 */
export function significantTitleWords(title: string): Set<string> {
  return new Set(
    title
      .normalize("NFD")
      // \p{Mn} keeps this ASCII-only: a literal combining-mark range is invisible in source.
      .replace(/\p{Mn}/gu, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4 && !TITLE_NOISE_WORDS.has(word))
  );
}

/**
 * Whether two titles share at least one word that names the facts.
 *
 * Deliberately a single shared word rather than a ratio: measured on production
 * data, the pairs worth keeping shared several words and the ones worth dropping
 * shared none, so any threshold in between would be an unmeasurable knob. One
 * shared word is a lead a reviewer can follow; zero is not.
 */
export function titlesShareVocabulary(a: string, b: string): boolean {
  const wordsA = significantTitleWords(a);
  for (const word of significantTitleWords(b)) {
    if (wordsA.has(word)) return true;
  }
  return false;
}

export interface MatchResult {
  affairId: string;
  confidence: MatchConfidence;
  score: number;
  matchedBy: string;
}

/**
 * Signals that identify a shared court decision or proceeding: official numbers
 * assigned by a court, not words a title happens to share.
 *
 * What they prove is narrower than it looks. Measured on real data (issue #525):
 * two Carignon convictions share a pourvoi number, a facts date, a verdict date
 * and one cassation ruling, yet they are two separate counts — subornation of a
 * witness and misuse of company assets — and therefore two Poligraph affairs.
 *
 * So a shared identifier says "same decision or same proceeding". It does NOT say
 * "same editorial affair", and on its own it may never authorise a merge.
 */
export const OFFICIAL_JUDICIAL_IDENTIFIER_SIGNALS: ReadonlySet<string> = new Set([
  "ecli",
  "pourvoiNumber",
  "caseNumbers",
]);

/**
 * Whether a match rests on a court-assigned identifier rather than resemblance.
 *
 * Useful to tell a reviewer why a pair is worth reading — the two fiches cite the
 * same decision — never to conclude that they are duplicates.
 */
export function isOfficialJudicialIdentifierMatch(matchedBy: string): boolean {
  return OFFICIAL_JUDICIAL_IDENTIFIER_SIGNALS.has(matchedBy);
}

/**
 * Minimum share of the longer title that the shorter one must cover for
 * containment to count as a duplicate signal.
 *
 * Measured on production data (issue #520):
 *   0.71  "violences volontaires en réunion" inside
 *         "condamnation violences volontaires en réunion"
 *         → same fact, two import formats. This is what containment protects.
 *   0.17  "diffamation" inside
 *         "condamnation definitive pour diffamation envers patrick klugman"
 *   0.10  "injure" inside
 *         "condamnation pour injure envers les mineurs isoles etrangers"
 *
 * Below the threshold, containment only means the two titles share vocabulary,
 * which is expected within a category and is not evidence of duplication. The
 * Wikidata offense labels are short ("Injure", "Diffamation"), so without this
 * guard a single label matched every affair of that category in HIGH.
 */
export const TITLE_CONTAINMENT_MIN_RATIO = 0.6;

/**
 * Two decisions on the same offense are the same event only if they were handed
 * down at around the same time. Beyond this window they are distinct convictions.
 */
export const VERDICT_DATE_TOLERANCE_DAYS = 30;

/**
 * Whether two verdict dates rule out that the affairs are the same one.
 *
 * Only conclusive when both dates are known: a missing date proves nothing, so it
 * never blocks a match (issue #520).
 */
export function verdictDatesConflict(
  a: Date | null | undefined,
  b: Date | null | undefined,
  toleranceDays: number = VERDICT_DATE_TOLERANCE_DAYS
): boolean {
  if (!a || !b) return false;
  const deltaDays = Math.abs(a.getTime() - b.getTime()) / 86_400_000;
  return deltaDays > toleranceDays;
}

/**
 * Confidence of a bidirectional-containment title match, or null when the titles
 * do not contain one another.
 *
 * Extracted from findMatchingAffairs to be testable without a database.
 */
export function titleContainmentMatch(
  normalizedCandidate: string,
  normalizedExisting: string,
  sameCategory: boolean
): Omit<MatchResult, "affairId"> | null {
  // An empty normalized title contains and is contained by everything.
  if (normalizedCandidate.length === 0 || normalizedExisting.length === 0) return null;

  const contains =
    normalizedExisting.includes(normalizedCandidate) ||
    normalizedCandidate.includes(normalizedExisting);
  if (!contains) return null;

  const shorter = Math.min(normalizedCandidate.length, normalizedExisting.length);
  const longer = Math.max(normalizedCandidate.length, normalizedExisting.length);
  const substantial = shorter / longer >= TITLE_CONTAINMENT_MIN_RATIO;

  if (sameCategory && substantial) {
    return { confidence: "HIGH", score: 0.75, matchedBy: "title+category" };
  }

  // Downgraded, not dropped: reconcile-affairs counts POSSIBLE duplicates.
  return { confidence: "POSSIBLE", score: substantial ? 0.5 : 0.3, matchedBy: "title-partial" };
}

export type ConfidentMatch =
  | { kind: "match"; match: MatchResult }
  | { kind: "none" }
  | { kind: "ambiguous"; candidates: MatchResult[] };

/**
 * Picks the one match an importer may act on, or reports that there is none.
 *
 * Design priority for this project: a wrong match costs more than a duplicate
 * draft to triage. A draft is not public and merge tooling can fold it in; an
 * affair enriched from the wrong decision silently corrupts a published record.
 *
 * So ambiguity never resolves silently. Several affairs tied at HIGH means the
 * evidence does not identify one, and the caller must treat it as "no match"
 * rather than take the first row. CERTAIN is exempt from ties by construction
 * (it comes from the unique ECLI), but is still checked.
 */
export function pickConfidentMatch(matches: MatchResult[]): ConfidentMatch {
  const certain = matches.filter((m) => m.confidence === "CERTAIN");
  if (certain.length === 1) return { kind: "match", match: certain[0]! };
  if (certain.length > 1) return { kind: "ambiguous", candidates: certain };

  const high = matches.filter((m) => m.confidence === "HIGH");
  if (high.length === 1) return { kind: "match", match: high[0]! };
  if (high.length > 1) return { kind: "ambiguous", candidates: high };

  return { kind: "none" };
}

export interface MatchCandidate {
  politicianId: string;
  title: string;
  ecli?: string | null;
  pourvoiNumber?: string | null;
  caseNumbers?: string[];
  category?: AffairCategory;
  verdictDate?: Date | null;
  /**
   * Set when the candidate IS an existing row, so it cannot match itself.
   *
   * Importers leave this empty: they match a candidate that has no row yet.
   * Duplicate detection must set it, otherwise the ECLI branch below returns the
   * affair's own id and stops, hiding every other signal (issue #525).
   */
  excludeAffairId?: string;
}

/**
 * Normalize affair title for deduplication.
 * Strips "[À VÉRIFIER]" prefix, politician name, common decorators, and normalizes whitespace.
 * Stripping the politician name is essential because different import pipelines
 * format titles differently (e.g., "Crime — Name" vs "Condamnation de Name pour Crime").
 */
function normalizeAffairTitle(title: string, politicianName?: string): string {
  let normalized = title
    .normalize("NFC")
    .replace(/^\[À VÉRIFIER\]\s*/i, "")
    .trim()
    .toLowerCase();

  if (politicianName) {
    const name = politicianName.toLowerCase().normalize("NFC");
    // Escape regex special chars in name
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Strip " — Name" suffix (discover-affairs format)
    normalized = normalized.replace(new RegExp(`\\s*[—–-]\\s*${escaped}\\s*$`), "");
    // Strip "de Name pour" (manual/press format: "Condamnation de X pour Y")
    normalized = normalized.replace(new RegExp(`\\bde\\s+${escaped}\\s+pour\\s+`, "g"), "");
    // Strip "contre Name" (complaint format)
    normalized = normalized.replace(new RegExp(`\\bcontre\\s+${escaped}\\s*`, "g"), "");
    // Strip remaining occurrences of the name
    normalized = normalized.replace(new RegExp(`\\b${escaped}\\b`, "g"), "");
    // Clean up leftover whitespace
    normalized = normalized.replace(/\s{2,}/g, " ").trim();
  }

  return normalized;
}

/**
 * Find existing affairs that match a candidate affair.
 * Returns matches ordered by confidence score (highest first).
 */
export async function findMatchingAffairs(candidate: MatchCandidate): Promise<MatchResult[]> {
  const matches: MatchResult[] = [];

  // Priority 1: ECLI (unique European identifier) — CERTAIN match
  if (candidate.ecli) {
    const ecliMatch = await db.affair.findUnique({
      where: { ecli: candidate.ecli },
      select: { id: true },
    });
    // A self-match proves nothing and must not short-circuit: ecli is unique, so
    // when the candidate is an existing row this lookup finds that row itself.
    if (ecliMatch && ecliMatch.id !== candidate.excludeAffairId) {
      matches.push({
        affairId: ecliMatch.id,
        confidence: "CERTAIN",
        score: 1.0,
        matchedBy: "ecli",
      });
      return matches; // ECLI is definitive, no need to check further
    }
  }

  // Priority 2: Pourvoi number + same politician — HIGH confidence
  if (candidate.pourvoiNumber) {
    const pourvoiMatches = await db.affair.findMany({
      where: {
        pourvoiNumber: candidate.pourvoiNumber,
        politicianId: candidate.politicianId,
      },
      select: { id: true },
    });
    for (const match of pourvoiMatches) {
      if (match.id === candidate.excludeAffairId) continue;
      matches.push({
        affairId: match.id,
        confidence: "HIGH",
        score: 0.95,
        matchedBy: "pourvoiNumber",
      });
    }
  }

  // Priority 3: Case numbers intersection + same politician — HIGH confidence
  if (candidate.caseNumbers && candidate.caseNumbers.length > 0) {
    const caseNumberMatches = await db.affair.findMany({
      where: {
        politicianId: candidate.politicianId,
        caseNumbers: { hasSome: candidate.caseNumbers },
      },
      select: { id: true },
    });
    for (const match of caseNumberMatches) {
      if (match.id === candidate.excludeAffairId) continue;
      // Avoid duplicating matches already found by pourvoi
      if (!matches.some((m) => m.affairId === match.id)) {
        matches.push({
          affairId: match.id,
          confidence: "HIGH",
          score: 0.8,
          matchedBy: "caseNumbers",
        });
      }
    }
  }

  // Priority 4: Normalized title matching — bidirectional
  // Strips "[À VÉRIFIER]" prefix, politician name, and common decorators,
  // then compares both directions to catch duplicates from successive
  // import waves with different title formats (e.g., "Crime — Name" vs
  // "Condamnation de Name pour Crime").
  if (candidate.title) {
    // Fetch politician name for title normalization
    const politician = await db.politician.findUnique({
      where: { id: candidate.politicianId },
      select: { fullName: true },
    });
    const politicianName = politician?.fullName ?? undefined;

    const normalizedCandidate = normalizeAffairTitle(candidate.title, politicianName);

    const samePoliticianAffairs = await db.affair.findMany({
      where: { politicianId: candidate.politicianId },
      // verdictDate discriminates repeated convictions for the same offense,
      // which titles alone cannot (issue #520).
      select: { id: true, title: true, category: true, verdictDate: true },
    });

    for (const existing of samePoliticianAffairs) {
      if (existing.id === candidate.excludeAffairId) continue;
      if (matches.some((m) => m.affairId === existing.id)) continue;

      const normalizedExisting = normalizeAffairTitle(existing.title, politicianName);

      // Two convictions for the same offense carry the same title once the
      // politician name is stripped, so the title alone cannot separate them.
      // A materially different verdict date can.
      const datesRuleOutSameAffair = verdictDatesConflict(
        candidate.verdictDate,
        existing.verdictDate
      );

      // Exact normalized title → HIGH, unless the verdict dates say otherwise
      if (normalizedExisting === normalizedCandidate) {
        matches.push({
          affairId: existing.id,
          confidence: datesRuleOutSameAffair ? "POSSIBLE" : "HIGH",
          score: datesRuleOutSameAffair ? 0.45 : 0.85,
          matchedBy: datesRuleOutSameAffair ? "title-exact-date-conflict" : "title-exact",
        });
        continue;
      }

      // One contains the other (bidirectional). HIGH only when the containment is
      // substantial: a short offense label buried in a long descriptive title is
      // shared vocabulary, not a duplicate (issue #520).
      const containment = titleContainmentMatch(
        normalizedCandidate,
        normalizedExisting,
        Boolean(candidate.category && existing.category === candidate.category) &&
          !datesRuleOutSameAffair
      );
      if (containment) {
        matches.push({ affairId: existing.id, ...containment });
      }
    }
  }

  // Priority 5: Same politician + category + date ±30 days — POSSIBLE
  if (candidate.category && candidate.verdictDate) {
    const dateMin = new Date(candidate.verdictDate);
    dateMin.setDate(dateMin.getDate() - 30);
    const dateMax = new Date(candidate.verdictDate);
    dateMax.setDate(dateMax.getDate() + 30);

    const categoryDateMatches = await db.affair.findMany({
      where: {
        politicianId: candidate.politicianId,
        category: candidate.category,
        verdictDate: { gte: dateMin, lte: dateMax },
      },
      select: { id: true },
    });
    for (const match of categoryDateMatches) {
      if (match.id === candidate.excludeAffairId) continue;
      if (!matches.some((m) => m.affairId === match.id)) {
        matches.push({
          affairId: match.id,
          confidence: "POSSIBLE",
          score: 0.4,
          matchedBy: "category+date",
        });
      }
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

/**
 * Check if a candidate affair is a duplicate of an existing one.
 * Returns true if any match has HIGH or CERTAIN confidence.
 */
export async function isDuplicate(candidate: MatchCandidate): Promise<boolean> {
  const matches = await findMatchingAffairs(candidate);
  return matches.some((m) => m.confidence === "CERTAIN" || m.confidence === "HIGH");
}
