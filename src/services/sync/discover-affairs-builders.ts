/**
 * Builders purs pour discover-affairs. Volontairement sans import de db,
 * Wikidata ou IA : testables sans mock.
 *
 * Invariant I1 (RGPD article 10) : aucune source automatisée ne publie
 * directement une affaire pénale, même une condamnation Wikidata P1399.
 * Le type `publicationStatus: "DRAFT"` rend toute republication automatique
 * impossible à la compilation. La publication exige une validation humaine
 * (Phase 2 : publish-guard).
 */

import { clampConfidenceScore } from "@/services/affairs/confidence";
import type { AffairCategory, AffairStatus, Involvement } from "@/generated/prisma";

export interface ExtractedPenaltyData {
  prisonMonths?: number;
  /**
   * `number | null` and not `number`: absent means the extractor said nothing, null means
   * it looked and the source does not establish the split. Both land on null downstream,
   * but the extractor needs to be able to state the second one (#576).
   */
  prisonFirmMonths?: number | null;
  hasFine?: boolean;
  ineligibilityMonths?: number;
  communityService?: number;
  otherSentence?: string;
  verdictDate?: Date;
  courtQid?: string;
}

export interface DiscoveredAffair {
  politicianId: string;
  politicianName: string;
  title: string;
  description: string;
  category: AffairCategory;
  status: AffairStatus;
  involvement: Involvement;
  /** Date of the alleged facts. Never a decision date. */
  factsDate: Date | null;
  /** Date of the court decision. Wikidata P1399 qualifiers carry this, not factsDate. */
  verdictDate: Date | null;
  court: string | null;
  prisonMonths: number | null;
  prisonFirmMonths: number | null;
  ineligibilityMonths: number | null;
  communityService: number | null;
  otherSentence: string | null;
  courtQid: string | null;
  charges: string[];
  confidenceScore: number;
  publicationStatus: "DRAFT";
  /** Décision du resolver (AffairPoliticianDecision.id) à relier à l'affaire créée. */
  decisionId: string | null;
  sources: Array<{
    url: string;
    title: string;
    publisher: string;
    sourceType: "WIKIDATA" | "WIKIPEDIA" | "PRESSE";
    publishedAt: Date | null;
    excerpt?: string | null;
  }>;
  phase: "wikidata" | "wikipedia";
}

export interface WikidataDiscoveredAffairInput {
  politicianId: string;
  politicianName: string;
  qid: string;
  prop: "P1399" | "P1595";
  offenseLabel: string;
  category: AffairCategory;
  status: AffairStatus;
  penaltyData: ExtractedPenaltyData;
  decisionId: string | null;
}

export function buildWikidataDiscoveredAffair(
  input: WikidataDiscoveredAffairInput
): DiscoveredAffair {
  const isConviction = input.prop === "P1399";
  const confidence = isConviction ? 95 : 75;
  const titlePrefix = isConviction ? "" : "[À VÉRIFIER] ";

  // The offense label alone is not a title: a person convicted three times for the
  // same offense produced three identical titles, unreadable for a moderator and
  // indistinguishable for title-based deduplication (issue #520). The decision
  // year is the discriminator Wikidata gives us.
  const verdictYear = input.penaltyData.verdictDate?.getUTCFullYear();
  const labelWithYear = verdictYear ? `${input.offenseLabel} (${verdictYear})` : input.offenseLabel;

  return {
    politicianId: input.politicianId,
    politicianName: input.politicianName,
    title: `${titlePrefix}${labelWithYear} — ${input.politicianName}`,
    description: `${input.offenseLabel} (${isConviction ? "condamnation" : "mise en cause"}) — source Wikidata (${input.qid}, propriété ${input.prop}).`,
    category: input.category,
    status: input.status,
    involvement: isConviction ? "DIRECT" : "MENTIONED_ONLY",
    // Wikidata gives us a decision date, not a facts date. Storing it in
    // factsDate is what made the reconciliation path read it back out into
    // verdictDate, and made every created affair carry a wrong factsDate.
    factsDate: null,
    verdictDate: input.penaltyData.verdictDate ?? null,
    court: null,
    prisonMonths: input.penaltyData.prisonMonths ?? null,
    prisonFirmMonths: input.penaltyData.prisonFirmMonths ?? null,
    ineligibilityMonths: input.penaltyData.ineligibilityMonths ?? null,
    communityService: input.penaltyData.communityService ?? null,
    otherSentence: input.penaltyData.otherSentence ?? null,
    courtQid: input.penaltyData.courtQid ?? null,
    charges: [input.offenseLabel],
    confidenceScore: clampConfidenceScore(confidence),
    publicationStatus: "DRAFT",
    decisionId: input.decisionId,
    sources: [
      {
        url: `https://www.wikidata.org/wiki/${input.qid}`,
        title: `Wikidata — ${input.politicianName}`,
        publisher: "Wikidata",
        sourceType: "WIKIDATA",
        publishedAt: null,
      },
    ],
    phase: "wikidata",
  };
}
