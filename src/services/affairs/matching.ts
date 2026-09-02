/**
 * Affair Matching Service
 *
 * Multi-criteria deduplication for judicial affairs from multiple sources.
 * Matches affairs by judicial identifiers (ECLI, pourvoi number, case numbers)
 * and falls back to fuzzy title matching when identifiers are unavailable.
 */

import { db } from "@/lib/db";
import { foldJudicialReference } from "@/lib/affairs/judicial-reference";
import type { AffairCategory, AffairStatus, Prisma } from "@/generated/prisma";

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
 * Statuses where the affair is still moving and no court has ruled yet.
 *
 * These are the stages an investigation passes through as the press covers it, and
 * the ones where the matcher is blind: an affair here has no ECLI, no pourvoi
 * number and no verdictDate, so priorities 1, 2 and 5 below can never fire and
 * title text is the only signal left (issue #763).
 *
 * APPEL_EN_COURS and POURVOI_EN_CASSATION are deliberately excluded: a first
 * decision has been handed down, so they carry a verdictDate that discriminates
 * them properly.
 */
const PRE_DECISION_STATUSES = new Set<string>([
  "ENQUETE_PRELIMINAIRE",
  "INSTRUCTION",
  "MISE_EN_EXAMEN",
  "RENVOI_TRIBUNAL",
  "PROCES_EN_COURS",
]);

export function isPreDecisionStatus(status: string | null | undefined): boolean {
  return status != null && PRE_DECISION_STATUSES.has(status);
}

/**
 * Shared significant vocabulary between two titles, as a Jaccard ratio.
 *
 * Jaccard rather than the overlap coefficient (shared / smaller set) on purpose:
 * the overlap coefficient scores 1.0 whenever the shorter title's words all appear
 * in the longer one, which is exactly the short-offense-label false positive that
 * issue #520 fixed ("diffamation" inside "condamnation definitive pour diffamation
 * envers patrick klugman"). Jaccard scores that pair 0.17.
 */
export function titleVocabularyOverlap(a: string, b: string): { shared: number; ratio: number } {
  const wordsA = significantTitleWords(a);
  const wordsB = significantTitleWords(b);

  let shared = 0;
  for (const word of wordsB) {
    if (wordsA.has(word)) shared++;
  }

  const union = wordsA.size + wordsB.size - shared;
  return { shared, ratio: union === 0 ? 0 : shared / union };
}

/**
 * Minimum Jaccard ratio and shared-word count for two pre-decision affairs to be
 * reported as successive states of one investigation.
 *
 * Measured over the 189 pre-decision affairs in production, scoring every
 * same-politician pair (issue #763). Ranked by ratio, the list is clean down to
 * 0.40 — every pair at or above it is one story fragmented across imports:
 *
 *   1.00  "Enquête sur un emploi présumé fictif au Parlement européen en 2015"
 *         vs "Enquête pour emploi présumé fictif au Parlement européen en 2015"
 *   0.80  "Enquête pour détournement de fonds publics à la RATP"
 *         vs "Enquête pour détournement de fonds publics lié à l'emploi à la RATP"
 *   0.43  "Enquête pour détournement de fonds publics et cumul d'emplois"
 *         vs "Enquête pour détournement de fonds publics lié à l'emploi à la RATP"
 *   0.40  "Signalement de trafics d'enfants présumés sur Vinted"
 *         vs "Soupçons de trafic d'enfants sur Vinted"
 *
 * The first genuine false positives appear just below it, where two distinct
 * probity cases share only the generic vocabulary of their category:
 *
 *   0.30  "Détournement de fonds publics visant Ciotti et ses collaborateurs (mai 2024)"
 *         vs "Détournement de fonds publics lors de la campagne législative de 2022"
 *   0.25  "Soupçons d'emploi fictif de Jordan Bardella au Parlement européen"
 *         vs "Dépenses irrégulières du groupe Patriots au Parlement européen"
 *
 * Two shared words are required on top of the ratio: with a single shared word the
 * ratio only clears 0.40 when both titles are two words long, which is too little
 * to name anything.
 */
export const EVOLUTION_MIN_OVERLAP_RATIO = 0.4;
export const EVOLUTION_MIN_SHARED_WORDS = 2;

/**
 * Whether two pre-decision affairs look like successive states of one investigation.
 *
 * Reported at POSSIBLE deliberately, never HIGH. POSSIBLE is below the bar
 * `pickConfidentMatch` uses to enrich, so this signal changes no importer's
 * behaviour on its own: it surfaces the pair for review. Acting on it — filing an
 * update proposal instead of creating a second draft — is the caller's decision,
 * made explicitly through `findEvolutionCandidates`.
 *
 * The AUTRE wildcard is accepted here, unlike in the duplicate path guarded by
 * `pairingRestsOnWildcard` (#521). That guard asks for a second signal before
 * pairing on the wildcard, and the vocabulary threshold is one: measured on
 * production, wildcard-paired hits at or above the threshold are real
 * ("Propos racistes et menaces envers Kylian Mbappé" against "Enquête pour propos
 * racistes envers Kylian Mbappé", 0.83, AUTRE vs INCITATION_HAINE). Importers
 * routinely fall back to AUTRE on an early-stage story precisely because the
 * qualification is not established yet, so excluding it would blind the signal to
 * the cases it exists for.
 */
export function evolutionMatch(
  normalizedCandidate: string,
  normalizedExisting: string,
  sameFamily: boolean
): Omit<MatchResult, "affairId"> | null {
  if (!sameFamily) return null;

  const { shared, ratio } = titleVocabularyOverlap(normalizedCandidate, normalizedExisting);
  if (shared < EVOLUTION_MIN_SHARED_WORDS) return null;
  if (ratio < EVOLUTION_MIN_OVERLAP_RATIO) return null;

  return { confidence: "POSSIBLE", score: 0.55, matchedBy: "evolution-title-overlap" };
}

/**
 * Re-exported so callers keep importing the match vocabulary from the matcher, next
 * to the code that produces the signals. The definitions live in a database-free
 * module because the merge planner that consumes them is pure (#557).
 */
export {
  classifyMatchEvidence,
  isOfficialJudicialIdentifierMatch,
  EDITORIAL_IDENTITY_SIGNALS,
  OFFICIAL_JUDICIAL_IDENTIFIER_SIGNALS,
  type MatchEvidence,
} from "@/lib/affairs/match-evidence";

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
  /**
   * References of the decisions the candidate is linked to (#545).
   *
   * A list, because an affair can cite several decisions, and because these no
   * longer come from columns on the affair: `Affair.ecli` and
   * `Affair.pourvoiNumber` stopped being written, so reading them would only ever
   * return what a past backfill left behind.
   */
  decisionRefs?: Array<{ ecli?: string | null; pourvoiNumber?: string | null }>;
  category?: AffairCategory;
  verdictDate?: Date | null;
  /**
   * Procedural stage of the candidate, when known.
   *
   * Only consulted by the evolution signal (priority 6), which needs both sides to
   * be pre-decision. Absent, that signal stays silent and matching behaves exactly
   * as before.
   */
  status?: AffairStatus;
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
 * Affairs linked to a decision matching `where`, optionally scoped to one politician.
 *
 * Reads through `AffairCourtDecision` rather than through columns on `Affair`: the
 * identifiers live on the decision now (#545), and the same decision legitimately
 * reaches several affairs.
 */
async function findAffairsLinkedToDecision(
  where: Prisma.CourtDecisionWhereInput,
  politicianId?: string
): Promise<string[]> {
  const links = await db.affairCourtDecision.findMany({
    where: {
      courtDecision: where,
      ...(politicianId ? { affair: { politicianId } } : {}),
    },
    select: { affairId: true },
  });
  return [...new Set(links.map((l) => l.affairId))];
}

/**
 * Find existing affairs that match a candidate affair.
 * Returns matches ordered by confidence score (highest first).
 */
export async function findMatchingAffairs(candidate: MatchCandidate): Promise<MatchResult[]> {
  const matches: MatchResult[] = [];

  const refs = candidate.decisionRefs ?? [];
  const ecliRefs = refs.map((r) => r.ecli).filter((v): v is string => Boolean(v));
  const pourvoiRefs = refs.map((r) => r.pourvoiNumber).filter((v): v is string => Boolean(v));

  // Priority 1: shared ECLI, read through the linked decisions.
  //
  // It no longer short-circuits. An ECLI identifies a decision, and one decision can
  // carry several counts, so it is a reason to read the pair rather than the end of
  // the enquiry — the other signals may say something the reviewer needs (#557).
  if (ecliRefs.length > 0) {
    const ecliMatches = await findAffairsLinkedToDecision({ ecli: { in: ecliRefs } });
    for (const affairId of ecliMatches) {
      if (affairId === candidate.excludeAffairId) continue;
      matches.push({ affairId, confidence: "CERTAIN", score: 1.0, matchedBy: "ecli" });
    }
  }

  // Priority 2: shared pourvoi number, read through the linked decisions, on the
  // same politician. A pourvoi is not unique, so this is a lead, never an identity.
  if (pourvoiRefs.length > 0) {
    const pourvoiMatches = await findAffairsLinkedToDecision(
      { pourvoiNumberNormalized: { in: pourvoiRefs.map(foldJudicialReference) } },
      candidate.politicianId
    );
    for (const affairId of pourvoiMatches) {
      if (affairId === candidate.excludeAffairId) continue;
      if (matches.some((m) => m.affairId === affairId)) continue;
      matches.push({ affairId, confidence: "HIGH", score: 0.95, matchedBy: "pourvoiNumber" });
    }
  }

  // No case-number priority any more (#545). It matched on `Affair.caseNumbers`,
  // which was empty on all 463 affairs and has no equivalent on `CourtDecision`:
  // matching on a field that exists nowhere is not a capability worth keeping.

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
      where: {
        politicianId: candidate.politicianId,
        publicationStatus: { in: ["DRAFT", "PUBLISHED"] },
      },
      // verdictDate discriminates repeated convictions for the same offense,
      // which titles alone cannot (issue #520). status gates the evolution
      // signal below, which only applies before a decision is handed down.
      select: { id: true, title: true, category: true, verdictDate: true, status: true },
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
        continue;
      }

      // Priority 6: successive states of one pre-decision investigation.
      //
      // Only reached when containment found nothing, which is the blind spot: a
      // follow-up article rephrases the headline, so neither title contains the
      // other, and with no ECLI, pourvoi or verdict date yet nothing else fires
      // either (issue #763). Requires both sides to be pre-decision — once a court
      // has ruled, the verdict date discriminates and this heuristic would only
      // conflate repeated convictions for the same offense.
      const bothPreDecision =
        isPreDecisionStatus(candidate.status) && isPreDecisionStatus(existing.status);

      if (bothPreDecision && !datesRuleOutSameAffair) {
        const evolution = evolutionMatch(
          normalizedCandidate,
          normalizedExisting,
          Boolean(candidate.category) && sameCategoryFamily(candidate.category!, existing.category)
        );
        if (evolution) {
          matches.push({ affairId: existing.id, ...evolution });
        }
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
        publicationStatus: { in: ["DRAFT", "PUBLISHED"] },
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

/**
 * Existing affairs the candidate looks like a later development of.
 *
 * Separate from `findMatchingAffairs` on purpose. That function answers "is this
 * the same affair?", and its CERTAIN/HIGH tiers authorise an importer to write to
 * an existing row. This one answers a different question — "is this the same story,
 * further along?" — whose answer must never authorise a silent write: the caller is
 * expected to file an `AffairUpdateProposal` for a human, not to enrich in place.
 *
 * Ordered by score, best first. Ambiguity is not collapsed here the way
 * `pickConfidentMatch` collapses it: several candidates on one story is normal
 * once a story has already fragmented, and the reviewer needs to see the whole
 * cluster to pick the survivor.
 */
export async function findEvolutionCandidates(candidate: MatchCandidate): Promise<MatchResult[]> {
  if (!isPreDecisionStatus(candidate.status)) return [];

  const matches = await findMatchingAffairs(candidate);
  return matches.filter((m) => m.matchedBy === "evolution-title-overlap");
}

export type AffairMatchRouting =
  | { kind: "CONFIDENT_MATCH"; match: MatchResult }
  | { kind: "CONFIDENT_AMBIGUOUS"; candidates: MatchResult[] }
  | { kind: "UNIQUE_EVOLUTION"; match: MatchResult }
  | { kind: "POSSIBLE_AMBIGUOUS"; candidates: MatchResult[] }
  | { kind: "NO_MATCH"; looseMatch: MatchResult | null };

/**
 * Classifies one complete matcher result without hiding a competing signal.
 * Importers must call the database matcher once, then route through this helper.
 */
export function classifyAffairMatches(matches: MatchResult[]): AffairMatchRouting {
  const confident = pickConfidentMatch(matches);
  if (confident.kind === "match") return { kind: "CONFIDENT_MATCH", match: confident.match };
  if (confident.kind === "ambiguous") {
    return { kind: "CONFIDENT_AMBIGUOUS", candidates: confident.candidates };
  }

  const possibleByAffair = new Map<string, MatchResult>();
  for (const match of matches) {
    if (match.confidence === "POSSIBLE" && !possibleByAffair.has(match.affairId)) {
      possibleByAffair.set(match.affairId, match);
    }
  }
  const possible = [...possibleByAffair.values()];
  if (possible.length > 1) return { kind: "POSSIBLE_AMBIGUOUS", candidates: possible };
  if (possible.length === 0) return { kind: "NO_MATCH", looseMatch: null };

  const only = possible[0]!;
  const evolution = matches.find(
    (match) => match.affairId === only.affairId && match.matchedBy === "evolution-title-overlap"
  );
  if (evolution) return { kind: "UNIQUE_EVOLUTION", match: evolution };
  return { kind: "NO_MATCH", looseMatch: only };
}
