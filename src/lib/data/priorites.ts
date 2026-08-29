import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import {
  SEGMENTATION_DOCTRINE_PUBLISHED,
  isPrioritesCandidacyEligible,
  isPrioritesPublishable,
} from "@/config/publication-gates";
import { getHubCandidacyField } from "./hub";
import {
  getLatestPresidentialReviewDate,
  getPublicMeasuresByElection,
  type PublicMeasure,
} from "./measures";
import { getPublicPresidentialCandidates } from "./presidential-candidates-public";
import { loadThemesIndex } from "./themes-index";
import { isPresidentialTheme } from "@/lib/presidentielle/themes";

/**
 * The read authority for `/priorites`, the most sensitive surface of the hub: a distribution in
 * percentages looks like a scientific measurement, so below its gate the page renders its own
 * eligibility calculation and never a greyed-out version of the comparison.
 *
 * This file computes the calculation and nothing else. It returns counts, shares and booleans; the
 * sentences that phrase them belong to the component. That split is deliberate: a sentence baked
 * into the data layer is a sentence no test can contradict with a different number.
 *
 * Measures are counted on the SAME population the subject pages render — candidacies whose
 * `CandidacyPresidential` extension is PUBLISHED — for the reason `themes-index.ts` spells out: a
 * measure the public cannot reach must not make a candidacy look documented. Withdrawn measures are
 * excluded by taking `getPublicMeasuresByElection`'s default: a dropped proposal is not a defended
 * one, and counting it would inflate the very ratio the gate exists to police.
 */

export type PrioritesCandidacyRow = {
  candidacyId: string;
  candidateName: string;
  politicianSlug: string | null;
  partyLabel: string | null;
  verifiedMeasureCount: number;
  themesCoveredCount: number;
  primarySourceMeasureCount: number;
  /** Share of verified measures carrying at least one primary source. Null with no measure. */
  primarySourceShare: number | null;
  /** How many of those measures come from a published programme edition rather than a speech. */
  programmeMeasureCount: number;
  eligible: boolean;
};

export type PrioritesData = {
  electionSlug: string;
  /** One row per candidacy holding at least one verified measure, in the field's own order. */
  documentedRows: PrioritesCandidacyRow[];
  /** Everyone else in the sourced field, folded into the mockup's single trailing row. */
  undocumentedCount: number;
  eligibleCount: number;
  /** Best over least documented, among ELIGIBLE candidacies only. Null below two of them. */
  coverageRatio: number | null;
  coverageExtremes: { most: number; least: number } | null;
  /** Every eligible candidacy draws all its counted measures from a published programme edition. */
  corpusSameNature: boolean;
  segmentationDoctrinePublished: boolean;
  publishable: boolean;
  publishableThemes: { slug: string; label: string }[];
  lastReviewedAt: Date | null;
};

function summarize(
  candidacy: {
    id: string;
    candidateName: string;
    politicianSlug: string | null;
    partyLabel: string | null;
  },
  measures: PublicMeasure[],
  publishedEditionIds: Set<string>
): PrioritesCandidacyRow {
  const primarySourceMeasureCount = measures.filter((m) =>
    m.sources.some((s) => s.tier === "PRIMARY")
  ).length;
  const programmeMeasureCount = measures.filter(
    (m) => m.programEditionId !== null && publishedEditionIds.has(m.programEditionId)
  ).length;
  const metrics = {
    verifiedMeasureCount: measures.length,
    themesCoveredCount: new Set(measures.map((m) => m.theme).filter(isPresidentialTheme)).size,
    primarySourceShare: measures.length === 0 ? null : primarySourceMeasureCount / measures.length,
  };

  return {
    candidacyId: candidacy.id,
    candidateName: candidacy.candidateName,
    politicianSlug: candidacy.politicianSlug,
    partyLabel: candidacy.partyLabel,
    ...metrics,
    primarySourceMeasureCount,
    programmeMeasureCount,
    eligible: isPrioritesCandidacyEligible(metrics),
  };
}

/**
 * Plain async, integration-testable. Pages call `getPrioritesData`, which caches this.
 */
export async function loadPrioritesData(
  electionId: string,
  electionSlug: string
): Promise<PrioritesData> {
  const [field, measures, publicCandidates, themesIndex, lastReviewedAt, publishedEditions] =
    await Promise.all([
      getHubCandidacyField(electionSlug),
      getPublicMeasuresByElection(electionId),
      getPublicPresidentialCandidates(electionSlug),
      loadThemesIndex(electionId, electionSlug),
      getLatestPresidentialReviewDate(electionId),
      db.programEdition.findMany({
        where: { electionId, publicationStatus: "PUBLISHED" },
        select: { id: true },
      }),
    ]);

  const publicIds = new Set(publicCandidates.map((c) => c.id));
  const publishedEditionIds = new Set(publishedEditions.map((e) => e.id));

  const byCandidacy = new Map<string, PublicMeasure[]>();
  for (const m of measures) {
    if (m.candidacyId === null || !publicIds.has(m.candidacyId)) continue;
    const list = byCandidacy.get(m.candidacyId) ?? [];
    list.push(m);
    byCandidacy.set(m.candidacyId, list);
  }

  // The field is the display order (already sorted by surname) AND the denominator of the trailing
  // "N other candidacies" row. It is not, however, guaranteed to CONTAIN every candidacy carrying a
  // public measure: the field requires both source fields, while a measure only requires a published
  // extension. A candidacy in the second set and not the first would otherwise vanish from a page
  // whose entire promise is that an absent candidacy is shown with its reason, so the leftovers are
  // appended rather than dropped. `isFicheCandidatPublishable` makes this combination an editorial
  // error, which is a reason to surface it, not a reason to assume it away.
  const identities = new Map(
    field.map((c) => [
      c.id,
      {
        id: c.id,
        candidateName: c.candidateName,
        politicianSlug: c.politicianSlug,
        partyLabel: c.partyLabel,
      },
    ])
  );
  for (const c of publicCandidates) {
    if (identities.has(c.id) || c.politicianSlug === null) continue;
    identities.set(c.id, {
      id: c.id,
      candidateName: c.candidateName,
      politicianSlug: c.politicianSlug,
      partyLabel: null,
    });
  }

  const fieldOrder = new Map(field.map((c, index) => [c.id, index]));
  const collator = new Intl.Collator("fr", { sensitivity: "base" });
  const documentedIds = [...byCandidacy.keys()].sort((a, b) => {
    const orderA = fieldOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
    const orderB = fieldOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return collator.compare(
      identities.get(a)?.candidateName ?? "",
      identities.get(b)?.candidateName ?? ""
    );
  });

  const documentedRows = documentedIds.map((id) => {
    const identity = identities.get(id);
    // Unreachable: every key of byCandidacy comes from publicIds, and every publicId was just added
    // to `identities`. Kept as a total function rather than a non-null assertion.
    if (identity === undefined) {
      return summarize(
        { id, candidateName: id, politicianSlug: null, partyLabel: null },
        byCandidacy.get(id) ?? [],
        publishedEditionIds
      );
    }
    return summarize(identity, byCandidacy.get(id) ?? [], publishedEditionIds);
  });

  const documentedInField = documentedIds.filter((id) => fieldOrder.has(id)).length;
  const undocumentedCount = Math.max(0, field.length - documentedInField);

  const eligibleRows = documentedRows.filter((r) => r.eligible);
  const counts = eligibleRows.map((r) => r.verifiedMeasureCount);
  // A ratio needs two terms. Below two eligible candidacies it stays null, which blocks publication
  // instead of defaulting to a value that would read as "condition satisfied".
  const coverageExtremes =
    counts.length >= 2 ? { most: Math.max(...counts), least: Math.min(...counts) } : null;
  const coverageRatio =
    coverageExtremes === null || coverageExtremes.least === 0
      ? null
      : coverageExtremes.most / coverageExtremes.least;

  // `[].every()` is true, so the length guard is what stops an empty set from reporting a satisfied
  // condition. The comparison only holds between complete official programmes: fifteen measures
  // taken from interviews are not comparable to forty-five extracted from a published programme,
  // even when both clear the 60 % primary-source threshold.
  const corpusSameNature =
    eligibleRows.length >= 2 &&
    eligibleRows.every((r) => r.programmeMeasureCount === r.verifiedMeasureCount);

  return {
    electionSlug,
    documentedRows,
    undocumentedCount,
    eligibleCount: eligibleRows.length,
    coverageRatio,
    coverageExtremes,
    corpusSameNature,
    segmentationDoctrinePublished: SEGMENTATION_DOCTRINE_PUBLISHED,
    publishable: isPrioritesPublishable({
      eligibleCount: eligibleRows.length,
      coverageRatio,
      corpusSameNature,
      segmentationDoctrinePublished: SEGMENTATION_DOCTRINE_PUBLISHED,
    }),
    publishableThemes: themesIndex.themes
      .filter((t) => t.publishable)
      .map((t) => ({ slug: t.slug, label: t.label })),
    lastReviewedAt,
  };
}

export async function getPrioritesData(electionSlug: string): Promise<PrioritesData | null> {
  const election = await db.election.findUnique({
    where: { slug: electionSlug },
    select: { id: true },
  });
  if (election === null) return null;
  return getPrioritesDataCached(election.id, electionSlug);
}

/**
 * Cached read. Tagged like the other measure authorities, so publishing or withdrawing a measure
 * busts the eligibility calculation at the same moment it busts the pages that calculation summarizes.
 */
async function getPrioritesDataCached(
  electionId: string,
  electionSlug: string
): Promise<PrioritesData> {
  "use cache";
  cacheTag(`election-measures:${electionId}`);
  // This read also filters on CandidacyPresidential.publicationStatus. Without this second tag,
  // publishing an extension busted nothing here and the surface stayed closed for 24h.
  cacheTag(`election-candidacies:${electionId}`);
  cacheLife("synced");
  return loadPrioritesData(electionId, electionSlug);
}
