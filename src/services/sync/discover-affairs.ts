/**
 * Service to discover historical judicial affairs from Wikidata and Wikipedia.
 * Extracted from scripts/discover-affairs.ts for Inngest compatibility.
 *
 * Phase 1: Wikidata — P1399 (convicted of) and P1595 (charge)
 * Phase 2: Wikipedia — Judicial sections + AI extraction
 * Phase 3: Reconciliation — Dedup + persist
 */

import { db } from "@/lib/db";
import { generateAffairSlug } from "@/lib/utils";
import { WikidataService } from "@/lib/api/wikidata";
import { WD_PROPS } from "@/config/wikidata";
import { mapWikidataOffense, getOffenseLabel } from "@/config/wikidata-affairs";
import { mapWikidataPenalty, parseDurationToMonths } from "@/config/wikidata-penalties";
import { classifySentenceSplit, LIFE_SENTENCE_MONTHS } from "@/lib/affairs/sentence-split";
import {
  buildWikidataDiscoveredAffair,
  type DiscoveredAffair,
  type ExtractedPenaltyData,
} from "@/services/sync/discover-affairs-builders";

export type { ExtractedPenaltyData };
import { wikipediaService } from "@/lib/api/wikipedia";
import type { WikidataClaim } from "@/lib/api/wikidata";
import { extractAffairsFromWikipedia } from "@/services/wikipedia-affair-extraction";
import { classifyAffairMatches, findMatchingAffairs } from "@/services/affairs/matching";
import { clampConfidenceScore } from "@/services/affairs/confidence";
import type { AffairCategory, AffairStatus, SourceType } from "@/generated/prisma";
import { scoreAffairAgainstCandidates, resolveAffairPolitician } from "@/lib/affair-matching";
import { loadCandidatePool, loadSurnameVocabulary } from "@/lib/affair-matching/persistence";
import type { SurnameVocabulary } from "@/lib/affair-matching/surname-ambiguity";
import type { AffairCandidateRecord } from "@/lib/affair-matching";
import {
  hashSourceContent,
  previewAffairEventProposal,
  proposeAffairEvent,
  proposeAffairUpdate,
  type PreviewAffairEventProposalOutcome,
  type ProposeAffairEventOutcome,
} from "@/services/affairs/proposals";
import { createDraftAffairFromDiscovery } from "@/services/affairs/create-draft";
import { IMPORTER_DISCOVER_AFFAIRS, withImportRun } from "@/services/affairs/import-run";
import { previewAffairPolitician } from "@/lib/affair-matching/resolver";
import { findVerifiedAffairPressEventSource } from "@/config/affair-sources";

export const DISCOVER_AFFAIRS_CURSOR_KEY = "discover-affairs:cursor:lastName";

/**
 * Bump when the Wikidata penalty extraction changes shape or semantics. It is
 * part of the proposal payload hash, so a fixed extractor can re-propose a value
 * that a previous version got rejected on.
 */
export const WIKIDATA_EXTRACTOR_VERSION = "wikidata-penalty-v2";

/**
 * Read the persisted lastName cursor for the discover-affairs sync.
 *
 * Returns `{ lastName: null }` on first run (no row in DB) or when the previous
 * run exhausted the alphabet and reset the cursor.
 */
export async function getDiscoverAffairsCursor(): Promise<{ lastName: string | null }> {
  const row = await db.syncMetadata.findUnique({
    where: { sourceKey: DISCOVER_AFFAIRS_CURSOR_KEY },
    select: { cursor: true },
  });
  const value = row?.cursor ?? null;
  return { lastName: value && value.length > 0 ? value : null };
}

/**
 * Upsert the lastName cursor for the discover-affairs sync.
 *
 * Pass `null` to reset the cursor (e.g. when the alphabet is exhausted) so the
 * next run starts from the beginning.
 */
export async function saveDiscoverAffairsCursor(lastName: string | null): Promise<void> {
  await db.syncMetadata.upsert({
    where: { sourceKey: DISCOVER_AFFAIRS_CURSOR_KEY },
    create: {
      sourceKey: DISCOVER_AFFAIRS_CURSOR_KEY,
      cursor: lastName,
      lastSyncAt: new Date(),
    },
    update: {
      cursor: lastName,
      lastSyncAt: new Date(),
    },
  });
}

export interface DiscoverAffairsResult {
  politiciansProcessed: number;
  wikidataAffairsFound: number;
  wikipediaAffairsFound: number;
  duplicatesSkipped: number;
  affairsCreated: number;
  /** Affaires v2, lot 1: enrichment of existing affairs is now proposal-based. */
  proposalsPending: number;
  proposalsDeduped: number;
  proposalsWouldCreate: number;
  proposalsDedupedPending: number;
  proposalsDedupedTerminal: number;
  eventsAlreadyApplied: number;
  /** Several affairs tied at HIGH: no enrichment, a draft is created instead. */
  ambiguousMatches: number;
  insufficientSourceProvenance: number;
  errors: string[];
}

/**
 * Extract penalty data from a Wikidata P1399/P1595 claim's qualifiers.
 */
export function extractPenaltyData(claim: WikidataClaim): ExtractedPenaltyData {
  if (!claim.qualifiers) return {};

  const result: ExtractedPenaltyData = {};

  // P585 — Verdict date
  const timeClaims = claim.qualifiers[WD_PROPS.POINT_IN_TIME];
  if (timeClaims?.[0]?.datavalue?.value) {
    const tv = timeClaims[0].datavalue.value;
    if (typeof tv === "object" && "time" in tv && "precision" in tv && tv.precision >= 11) {
      const match = tv.time.match(/^\+?(\d{4})-(\d{2})-(\d{2})/);
      if (match && match[2] !== "00" && match[3] !== "00") {
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (
          date.getUTCFullYear() === year &&
          date.getUTCMonth() === month - 1 &&
          date.getUTCDate() === day
        ) {
          result.verdictDate = date;
        }
      }
    }
  }

  // P4884 — Court
  const courtClaims = claim.qualifiers[WD_PROPS.COURT];
  if (courtClaims?.[0]?.datavalue?.value) {
    const cv = courtClaims[0].datavalue.value;
    if (typeof cv === "object" && "id" in cv) {
      result.courtQid = cv.id;
    }
  }

  // P2047 — Duration (used for prison/ineligibility months)
  let durationMonths: number | undefined;
  const durationClaims = claim.qualifiers[WD_PROPS.DURATION];
  if (durationClaims?.[0]?.datavalue?.value) {
    const dv = durationClaims[0].datavalue.value;
    if (typeof dv === "object" && "amount" in dv && "unit" in dv) {
      const months = parseDurationToMonths(dv.amount, dv.unit);
      if (months !== null) durationMonths = months;
    }
  }

  // P1596 — Penalties (can be multiple: prison + fine + ineligibility)
  const penaltyClaims = claim.qualifiers[WD_PROPS.PENALTY];
  if (penaltyClaims) {
    for (const pc of penaltyClaims) {
      const pv = pc.datavalue?.value;
      if (!pv || typeof pv !== "object" || !("id" in pv)) continue;

      const mapping = mapWikidataPenalty(pv.id);
      if (!mapping) continue;

      switch (mapping.field) {
        case "prisonMonths": {
          const total = mapping.fixedMonths ?? durationMonths;
          result.prisonMonths = total;
          // `durationMonths` stays undefined when P2047 carries no usable duration, so a
          // sursis Q-ID on its own must not produce a firm part of 0 with no term. And a
          // life sentence carries no firm part at all (#576).
          result.prisonFirmMonths =
            total == null || total === LIFE_SENTENCE_MONTHS
              ? null
              : mapping.fullySuspended
                ? 0
                : null;
          break;
        }
        case "fineAmount":
          result.hasFine = true;
          break;
        case "ineligibilityMonths":
          result.ineligibilityMonths = durationMonths;
          break;
        case "communityService":
          result.communityService = durationMonths ? durationMonths * 30 : undefined;
          break;
        case "otherSentence":
          result.otherSentence = mapping.label;
          break;
      }
    }
  }

  return result;
}

function extractPublisherFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const PUBLISHER_MAP: Record<string, string> = {
      "lemonde.fr": "Le Monde",
      "liberation.fr": "Lib\u00e9ration",
      "mediapart.fr": "Mediapart",
      "lefigaro.fr": "Le Figaro",
      "francetvinfo.fr": "France Info",
      "bfmtv.com": "BFM TV",
      "leparisien.fr": "Le Parisien",
      "20minutes.fr": "20 Minutes",
      "lexpress.fr": "L'Express",
      "lepoint.fr": "Le Point",
      "nouvelobs.com": "L'Obs",
      "europe1.fr": "Europe 1",
      "rtl.fr": "RTL",
      "rfi.fr": "RFI",
    };
    return PUBLISHER_MAP[hostname] || hostname;
  } catch {
    return "Source inconnue";
  }
}

export async function discoverAffairs(options?: {
  limit?: number;
  politicianFilter?: string;
  wikidataOnly?: boolean;
  wikipediaOnly?: boolean;
  useCursor?: boolean;
  dryRun?: boolean;
}): Promise<DiscoverAffairsResult> {
  const {
    limit,
    politicianFilter,
    wikidataOnly = false,
    wikipediaOnly = false,
    useCursor = true,
    dryRun = false,
  } = options ?? {};

  const stats: DiscoverAffairsResult = {
    politiciansProcessed: 0,
    wikidataAffairsFound: 0,
    wikipediaAffairsFound: 0,
    duplicatesSkipped: 0,
    affairsCreated: 0,
    proposalsPending: 0,
    proposalsDeduped: 0,
    proposalsWouldCreate: 0,
    proposalsDedupedPending: 0,
    proposalsDedupedTerminal: 0,
    eventsAlreadyApplied: 0,
    ambiguousMatches: 0,
    insufficientSourceProvenance: 0,
    errors: [],
  };

  // Determine whether to apply the persisted cursor:
  // - off when a specific politicianFilter is set (the operator is targeting one)
  // - off when no limit is provided (full backfill scans everyone anyway)
  // - off when explicitly disabled via useCursor=false
  const cursorActive = useCursor && !politicianFilter && typeof limit === "number" && limit > 0;
  const cursorState = cursorActive ? await getDiscoverAffairsCursor() : { lastName: null };
  const cursor = cursorState.lastName;

  // Fetch politicians. Empty-string lastNames are filtered out via gt: "" when no
  // cursor is set so we always have a meaningful sort key.
  const politicians = await db.politician.findMany({
    where: {
      publicationStatus: "PUBLISHED",
      lastName: { gt: cursor ?? "" },
      ...(politicianFilter
        ? {
            fullName: {
              contains: politicianFilter,
              mode: "insensitive" as const,
            },
          }
        : {}),
    },
    select: {
      id: true,
      fullName: true,
      lastName: true,
      externalIds: {
        where: { source: "WIKIDATA" },
        select: { externalId: true },
      },
    },
    orderBy: { lastName: "asc" },
    ...(limit ? { take: limit } : {}),
  });

  stats.politiciansProcessed = politicians.length;
  console.log(`${politicians.length} politician(s) found`);

  if (cursorActive && !dryRun) {
    if (politicians.length === 0 || (typeof limit === "number" && politicians.length < limit)) {
      console.log(
        `[discover-affairs] cursor: ${cursor ?? "(start)"} -> (end), processed ${politicians.length}; alphabet exhausted, cursor reset`
      );
      await saveDiscoverAffairsCursor(null);
    } else {
      const lastSeen = politicians[politicians.length - 1]!.lastName ?? null;
      console.log(
        `[discover-affairs] cursor: ${cursor ?? "(start)"} -> ${lastSeen ?? "(end)"}, processed ${politicians.length}`
      );
      await saveDiscoverAffairsCursor(lastSeen);
    }
  }

  if (politicians.length === 0) {
    return stats;
  }

  // Phase 1: Wikidata
  let phase1Affairs: DiscoveredAffair[] = [];
  if (!wikipediaOnly) {
    phase1Affairs = await runPhase1Wikidata(politicians, stats, dryRun);
  }

  // Phase 2: Wikipedia
  let phase2Affairs: DiscoveredAffair[] = [];
  if (!wikidataOnly) {
    // Load the candidate pool once for the entire Wikipedia pass.
    // Building a Map avoids repeated array scans during per-politician lookups.
    const [candidatePool, vocabulary] = await Promise.all([
      loadCandidatePool(),
      loadSurnameVocabulary(),
    ]);
    const poolById = new Map<string, AffairCandidateRecord>(candidatePool.map((c) => [c.id, c]));
    phase2Affairs = await runPhase2Wikipedia(
      politicians,
      phase1Affairs,
      stats,
      poolById,
      vocabulary
    );
  }

  // Phase 3: Reconciliation
  const allAffairs = [...phase1Affairs, ...phase2Affairs];

  if (allAffairs.length > 0 && dryRun) {
    await runPhase3Reconciliation(allAffairs, stats, null, true);
  } else if (allAffairs.length > 0) {
    // Reconciliation is the only phase that touches existing affairs, so it is
    // the only one that needs an ImportRun to anchor its proposals.
    // withImportRun guarantees the run leaves RUNNING whatever happens.
    await withImportRun(IMPORTER_DISCOVER_AFFAIRS, async ({ importRunId, setStats }) => {
      await runPhase3Reconciliation(allAffairs, stats, importRunId, false);
      setStats({
        duplicatesSkipped: stats.duplicatesSkipped,
        affairsCreated: stats.affairsCreated,
        proposalsPending: stats.proposalsPending,
        proposalsDeduped: stats.proposalsDeduped,
        proposalsWouldCreate: stats.proposalsWouldCreate,
        proposalsDedupedPending: stats.proposalsDedupedPending,
        proposalsDedupedTerminal: stats.proposalsDedupedTerminal,
        eventsAlreadyApplied: stats.eventsAlreadyApplied,
        ambiguousMatches: stats.ambiguousMatches,
        insufficientSourceProvenance: stats.insufficientSourceProvenance,
      });
    });
  }

  return stats;
}

async function runPhase1Wikidata(
  politicians: Array<{
    id: string;
    fullName: string;
    externalIds: Array<{ externalId: string }>;
  }>,
  stats: DiscoverAffairsResult,
  dryRun: boolean
): Promise<DiscoveredAffair[]> {
  const discovered: DiscoveredAffair[] = [];
  const wikidataService = new WikidataService();

  const withQid = politicians.filter((p) => p.externalIds.length > 0);
  if (withQid.length === 0) return discovered;

  console.log(`Phase 1: Wikidata - ${withQid.length} politicians with Q-ID`);

  for (const politician of withQid) {
    const qid = politician.externalIds[0]!.externalId;

    try {
      const entities = await wikidataService.getEntities([qid]);
      const entity = entities.get(qid);
      if (!entity) continue;

      const properties: Array<{
        prop: "P1399" | "P1595";
        claims: (typeof entity.claims)[string];
      }> = [
        { prop: "P1399", claims: entity.claims[WD_PROPS.CONVICTED_OF] },
        { prop: "P1595", claims: entity.claims[WD_PROPS.CHARGE] },
      ];

      for (const { prop, claims } of properties) {
        if (!claims) continue;

        for (const claim of claims) {
          const value = claim.mainsnak?.datavalue?.value;
          if (!value || typeof value !== "object" || !("id" in value)) continue;

          const offenseQid = value.id;
          const { category, status } = mapWikidataOffense(offenseQid, prop);
          const label = getOffenseLabel(offenseQid);
          const penaltyData = extractPenaltyData(claim);

          // Invariant I1 : le resolver est appel\u00e9 pour l'audit trail et la
          // future liaison d\u00e9cision\u2192affaire, jamais pour publier.
          let decisionId: string | null = null;
          try {
            const resolverInput = {
              text: `${politician.fullName}: ${label}`,
              metadata: {
                source: "WIKIDATA" as SourceType,
                sourceRef: qid,
                factsDate: penaltyData.verdictDate ?? null,
                externalIds: { wikidataQId: qid },
              },
            };
            const resolveResult = dryRun
              ? await previewAffairPolitician(resolverInput)
              : await resolveAffairPolitician(resolverInput);
            decisionId = resolveResult.decisionId;
          } catch (resolveErr) {
            console.warn(
              `[discover-affairs] Wikidata resolver call failed for ${politician.fullName} (${qid}):`,
              resolveErr instanceof Error ? resolveErr.message : resolveErr
            );
          }

          discovered.push(
            buildWikidataDiscoveredAffair({
              politicianId: politician.id,
              politicianName: politician.fullName,
              qid,
              prop,
              offenseLabel: label,
              category,
              status,
              penaltyData,
              decisionId,
            })
          );

          stats.wikidataAffairsFound++;
        }
      }
    } catch (error) {
      stats.errors.push(
        `Wikidata ${politician.fullName}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  // Batch-resolve court Q-IDs to labels
  const courtQids = [...new Set(discovered.map((d) => d.courtQid).filter(Boolean))] as string[];
  if (courtQids.length > 0) {
    const courtEntities = await wikidataService.getEntities(courtQids, ["labels"]);
    for (const affair of discovered) {
      if (affair.courtQid) {
        const entity = courtEntities.get(affair.courtQid);
        affair.court = entity?.labels?.fr ?? entity?.labels?.en ?? null;
      }
    }
  }

  return discovered;
}

async function runPhase2Wikipedia(
  politicians: Array<{
    id: string;
    fullName: string;
    externalIds: Array<{ externalId: string }>;
  }>,
  phase1Affairs: DiscoveredAffair[],
  stats: DiscoverAffairsResult,
  poolById: Map<string, AffairCandidateRecord>,
  vocabulary: SurnameVocabulary
): Promise<DiscoveredAffair[]> {
  const discovered: DiscoveredAffair[] = [];
  const phase1Keys = new Set(phase1Affairs.map((a) => `${a.politicianId}:${a.category}`));

  console.log(`Phase 2: Wikipedia - ${politicians.length} politicians`);

  for (const politician of politicians) {
    const candidate = poolById.get(politician.id);
    if (!candidate) {
      console.warn(`[discover-affairs] Politician ${politician.id} not in candidate pool`);
      continue;
    }

    try {
      const sections = await wikipediaService.findJudicialSections(politician.fullName);
      if (sections.length === 0) continue;

      for (const section of sections) {
        const pageUrl = `https://fr.wikipedia.org/wiki/${encodeURIComponent(politician.fullName.replace(/ /g, "_"))}`;

        const result = await extractAffairsFromWikipedia({
          politicianName: politician.fullName,
          sectionTitle: section.title,
          wikitext: section.wikitext,
          pageUrl,
        });

        for (const extracted of result.affairs) {
          if (
            extracted.involvement !== "DIRECT" &&
            extracted.involvement !== "VICTIM" &&
            extracted.involvement !== "PLAINTIFF"
          )
            continue;

          if (extracted.confidenceScore < 40) continue;

          const dedupKey = `${politician.id}:${extracted.category}`;
          if (phase1Keys.has(dedupKey)) continue;

          // Sanity check: verify the extracted affair is plausibly about this politician,
          // not a third party mentioned in their Wikipedia article.
          const affairText = [extracted.title, extracted.description].filter(Boolean).join("\n\n");

          const sanityCheck = scoreAffairAgainstCandidates(
            {
              text: affairText,
              metadata: {
                source: "WIKIPEDIA" as SourceType,
                sourceRef: pageUrl,
                factsDate: extracted.factsDate ? new Date(extracted.factsDate) : null,
              },
            },
            [candidate],
            vocabulary
          );

          if (sanityCheck.judgment !== "SAME") {
            console.log(
              `[discover-affairs] Wikipedia sanity check failed for ${politician.fullName} ` +
                `(${sanityCheck.judgment}, score ${sanityCheck.topScore.toFixed(1)}): ` +
                `"${extracted.title}" may be about another politician mentioned in the article`
            );
            continue;
          }

          const sources: DiscoveredAffair["sources"] = [
            {
              url: pageUrl,
              title: `Wikipedia \u2014 ${politician.fullName}`,
              publisher: "Wikipedia",
              sourceType: "WIKIPEDIA",
              publishedAt: null,
            },
          ];

          for (const sourceUrl of extracted.sourceUrls) {
            sources.push({
              url: sourceUrl,
              title: extracted.title,
              publisher: extractPublisherFromUrl(sourceUrl),
              sourceType: "PRESSE",
              // The URL may contain a date, but that does not prove the article's
              // publication date. Keep it unknown until a verified source supplies it.
              publishedAt: null,
            });
          }

          discovered.push({
            politicianId: politician.id,
            politicianName: politician.fullName,
            title: `[\u00c0 V\u00c9RIFIER] ${extracted.title}`,
            description: extracted.description,
            category: extracted.category as AffairCategory,
            status: extracted.status as AffairStatus,
            involvement: extracted.involvement,
            // Wikipedia extraction yields a genuine facts date; it carries no
            // decision date.
            factsDate: extracted.factsDate ? new Date(extracted.factsDate) : null,
            verdictDate: null,
            court: extracted.court,
            prisonMonths: null,
            prisonFirmMonths: null,
            ineligibilityMonths: null,
            communityService: null,
            otherSentence: null,
            courtQid: null,
            charges: extracted.charges,
            confidenceScore: clampConfidenceScore(extracted.confidenceScore),
            publicationStatus: "DRAFT",
            decisionId: null,
            sources,
            phase: "wikipedia",
          });

          stats.wikipediaAffairsFound++;
        }
      }
    } catch (error) {
      stats.errors.push(
        `Wikipedia ${politician.fullName}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  return discovered;
}

/**
 * Build a human-readable sentence summary from structured penalty fields.
 * e.g., "2 ans de prison ferme, 5 ans d'inéligibilité"
 */
function buildSentenceSummary(affair: DiscoveredAffair): string | null {
  const parts: string[] = [];

  const prisonSplit = classifySentenceSplit(affair.prisonMonths, affair.prisonFirmMonths);
  if (prisonSplit.kind === "LIFE") {
    parts.push("réclusion criminelle à perpétuité");
  } else if (affair.prisonMonths !== null && affair.prisonMonths > 0) {
    const years = Math.floor(affair.prisonMonths / 12);
    const months = affair.prisonMonths % 12;
    const duration =
      years > 0 && months > 0
        ? `${years} an${years > 1 ? "s" : ""} et ${months} mois`
        : years > 0
          ? `${years} an${years > 1 ? "s" : ""}`
          : `${months} mois`;

    // No default suffix. The previous ternary wrote « de prison ferme » whenever the
    // boolean was not true, so an unestablished split entered the `sentence` text as an
    // asserted firm term (#576).
    const suffix =
      prisonSplit.kind === "FULLY_SUSPENDED"
        ? " de prison avec sursis"
        : prisonSplit.kind === "FULLY_FIRM"
          ? " de prison ferme"
          : prisonSplit.kind === "MIXED"
            ? ` de prison dont ${prisonSplit.suspendedMonths} mois avec sursis`
            : " de prison";
    parts.push(duration + suffix);
  }

  if (affair.ineligibilityMonths !== null && affair.ineligibilityMonths > 0) {
    const years = Math.floor(affair.ineligibilityMonths / 12);
    const months = affair.ineligibilityMonths % 12;
    const duration = years > 0 ? `${years} an${years > 1 ? "s" : ""}` : `${months} mois`;
    parts.push(`${duration} d'inéligibilité`);
  }

  if (affair.communityService !== null && affair.communityService > 0) {
    parts.push(`${affair.communityService}h de travail d'intérêt général`);
  }

  if (affair.otherSentence) {
    parts.push(affair.otherSentence.toLowerCase());
  }

  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * Files the Wikidata penalty payload as a proposal on an existing affair.
 *
 * Replaces the previous direct `db.affair.update`, which silently overwrote
 * sentence fields, court and verdictDate on published affairs.
 */
async function proposePenaltyEnrichment(
  affair: DiscoveredAffair,
  affairId: string,
  stats: DiscoverAffairsResult,
  importRunId: string
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (affair.prisonMonths !== null) patch.prisonMonths = affair.prisonMonths;
  // Only propose the firm part alongside a total. Proposing it alone would be rejected at
  // apply time against the live row, then refiled by the next run (#576).
  if (affair.prisonMonths !== null && affair.prisonFirmMonths !== null) {
    patch.prisonFirmMonths = affair.prisonFirmMonths;
  }
  if (affair.ineligibilityMonths !== null) patch.ineligibilityMonths = affair.ineligibilityMonths;
  if (affair.communityService !== null) patch.communityService = affair.communityService;
  if (affair.otherSentence !== null) patch.otherSentence = affair.otherSentence;
  if (affair.verdictDate) patch.verdictDate = affair.verdictDate;
  if (affair.court) patch.court = affair.court;

  const sentence = buildSentenceSummary(affair);
  if (sentence) patch.sentence = sentence;

  if (Object.keys(patch).length === 0) return;

  const wikidataSource = affair.sources.find((s) => s.sourceType === "WIKIDATA");

  const result = await proposeAffairUpdate({
    affairId,
    importer: IMPORTER_DISCOVER_AFFAIRS,
    importRunId,
    patch,
    source: "WIKIDATA",
    sourceUrl: wikidataSource?.url ?? null,
    officialId: extractQidFromUrl(wikidataSource?.url),
    // A Wikidata claim can change under the same Q-ID, so the payload itself is
    // part of the proposal identity.
    sourceContentHash: hashSourceContent({
      charges: affair.charges,
      status: affair.status,
      category: affair.category,
      penalties: patch,
    }),
    sourceExcerpt: affair.charges.join(", ").slice(0, 500),
    metadata: { phase: affair.phase, politicianName: affair.politicianName },
    confidence: affair.confidenceScore,
    rationale:
      `Rapprochement HIGH/CERTAIN avec une affaire existante du même politique ` +
      `et de la même catégorie (${affair.category}). Peines et date de décision ` +
      `extraites des qualificatifs Wikidata de « ${affair.title} ».`,
    extractorVersion: WIKIDATA_EXTRACTOR_VERSION,
  });

  if (result.pendingProposalId) stats.proposalsPending++;
  if (result.deduped) stats.proposalsDeduped++;
}

function extractQidFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const match = /\/(Q\d+)$/.exec(url);
  return match ? match[1]! : null;
}

async function runPhase3Reconciliation(
  allAffairs: DiscoveredAffair[],
  stats: DiscoverAffairsResult,
  importRunId: string | null,
  dryRun: boolean
): Promise<void> {
  console.log(`Phase 3: Reconciliation - ${allAffairs.length} affairs`);

  for (const affair of allAffairs) {
    try {
      const matches = await findMatchingAffairs({
        politicianId: affair.politicianId,
        title: affair.title,
        category: affair.category,
        status: affair.status,
        // Without it, two convictions for the same offense are indistinguishable:
        // the Wikidata title is the bare offense label (issue #520).
        verdictDate: affair.verdictDate,
      });

      const routing = classifyAffairMatches(matches);
      let insufficientEvolutionProvenance = false;
      if (routing.kind === "CONFIDENT_AMBIGUOUS" || routing.kind === "POSSIBLE_AMBIGUOUS") {
        stats.ambiguousMatches++;
      }

      if (routing.kind === "CONFIDENT_MATCH") {
        // Affaires v2, lot 1: an importer never writes to an existing affair.
        // Penalty data, dates and jurisdiction go through the proposal queue.
        if (!dryRun && affair.phase === "wikidata") {
          if (!importRunId) throw new Error("ImportRun discover-affairs absent");
          await proposePenaltyEnrichment(affair, routing.match.affairId, stats, importRunId);
        }

        // Même en cas de doublon enrichi, la décision resolver est rattachée
        // à l'affaire existante pour la piste d'audit du rattachement.
        if (!dryRun && affair.decisionId) {
          await db.affairPoliticianDecision.update({
            where: { id: affair.decisionId },
            data: { affairId: routing.match.affairId },
          });
        }

        stats.duplicatesSkipped++;
        continue;
      }

      if (routing.kind === "UNIQUE_EVOLUTION") {
        const pressSource = findVerifiedAffairPressEventSource(
          affair.sources.filter((source) => source.sourceType === "PRESSE")
        );
        if (pressSource?.publishedAt) {
          const eventInput = {
            affairId: routing.match.affairId,
            importer: IMPORTER_DISCOVER_AFFAIRS,
            sourceUrl: pressSource.url,
            sourceTitle: pressSource.title,
            publishedAt: pressSource.publishedAt,
            publisher: pressSource.publisher,
            sourceExcerpt: pressSource.excerpt!,
            resolverDecisionId: affair.decisionId,
            sourceContentHash: hashSourceContent({
              sourceUrl: pressSource.url,
              publishedAt: pressSource.publishedAt,
              title: affair.title,
              status: affair.status,
            }),
            confidence: Math.round(routing.match.score * 100),
            rationale:
              `Candidat d’évolution unique (${routing.match.matchedBy}) avec une source de presse ` +
              `datée. La publication est proposée comme événement médiatique, sans déduire la ` +
              `date d’un acte judiciaire.`,
            extractorVersion: "discover-evolution-v1",
          };
          let proposal;
          if (dryRun) {
            proposal = await previewAffairEventProposal(eventInput);
          } else {
            if (!importRunId) throw new Error("ImportRun discover-affairs absent");
            proposal = await proposeAffairEvent({ ...eventInput, importRunId });
          }
          recordEventProposalOutcome(stats, proposal.outcome);
          if (proposal.outcome !== "TARGET_INELIGIBLE") continue;
        } else {
          insufficientEvolutionProvenance = true;
        }
      }

      if (insufficientEvolutionProvenance) stats.insufficientSourceProvenance++;

      const datedSources = affair.sources.filter((source) => source.publishedAt !== null);
      if (datedSources.length === 0) {
        if (!insufficientEvolutionProvenance) stats.insufficientSourceProvenance++;
        continue;
      }
      if (dryRun) {
        stats.affairsCreated++;
        continue;
      }

      const politician = await db.politician.findUnique({
        where: { id: affair.politicianId },
        select: { slug: true },
      });
      const createdAffair = await createDraftAffairFromDiscovery({
        politicianId: affair.politicianId,
        title: affair.title,
        baseSlug: generateAffairSlug(politician?.slug ?? "", affair.title),
        description: affair.description,
        status: affair.status,
        category: affair.category,
        involvement: affair.involvement,
        confidenceScore: affair.confidenceScore,
        factsDate: affair.factsDate,
        verdictDate: affair.verdictDate,
        court: affair.court,
        prisonMonths: affair.prisonMonths,
        prisonFirmMonths: affair.prisonFirmMonths,
        ineligibilityMonths: affair.ineligibilityMonths,
        communityService: affair.communityService,
        otherSentence: affair.otherSentence,
        sentence: buildSentenceSummary(affair),
        sources: datedSources.map((s) => ({
          url: s.url,
          title: s.title,
          publisher: s.publisher,
          publishedAt: s.publishedAt!,
          sourceType: s.sourceType,
        })),
      });

      // Lie la décision du resolver à l'affaire créée : le publish-guard
      // (Phase 2) exigera une revue humaine de cette décision avant publication.
      if (affair.decisionId) {
        await db.affairPoliticianDecision.update({
          where: { id: affair.decisionId },
          data: { affairId: createdAffair.id },
        });
      }

      stats.affairsCreated++;
    } catch (error) {
      stats.errors.push(
        `Create "${affair.title}": ${error instanceof Error ? error.message : error}`
      );
    }
  }
}

function recordEventProposalOutcome(
  stats: DiscoverAffairsResult,
  outcome: ProposeAffairEventOutcome | PreviewAffairEventProposalOutcome
): void {
  if (outcome === "CREATED") stats.proposalsPending++;
  if (outcome === "WOULD_CREATE") stats.proposalsWouldCreate++;
  if (outcome === "DEDUPED_PENDING") {
    stats.proposalsDeduped++;
    stats.proposalsDedupedPending++;
  }
  if (outcome === "DEDUPED_TERMINAL") {
    stats.proposalsDeduped++;
    stats.proposalsDedupedTerminal++;
  }
  if (outcome === "ALREADY_APPLIED") stats.eventsAlreadyApplied++;
}
