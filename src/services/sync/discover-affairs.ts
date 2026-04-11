/**
 * Service to discover historical judicial affairs from Wikidata and Wikipedia.
 * Extracted from scripts/discover-affairs.ts for Inngest compatibility.
 *
 * Phase 1: Wikidata — P1399 (convicted of) and P1595 (charge)
 * Phase 2: Wikipedia — Judicial sections + AI extraction
 * Phase 3: Reconciliation — Dedup + persist
 */

import { db } from "@/lib/db";
import { generateAffairSlug, generateUniqueSlug } from "@/lib/utils";
import { WikidataService } from "@/lib/api/wikidata";
import { WD_PROPS } from "@/config/wikidata";
import { mapWikidataOffense, getOffenseLabel, isKnownOffense } from "@/config/wikidata-affairs";
import { mapWikidataPenalty, parseDurationToMonths } from "@/config/wikidata-penalties";
import { wikipediaService } from "@/lib/api/wikipedia";
import type { WikidataClaim } from "@/lib/api/wikidata";
import { extractAffairsFromWikipedia } from "@/services/wikipedia-affair-extraction";
import { findMatchingAffairs } from "@/services/affairs/matching";
import { clampConfidenceScore } from "@/services/affairs/confidence";
import { extractDateFromUrl } from "@/lib/extract-date-from-url";
import type { AffairCategory, AffairStatus, Involvement, SourceType } from "@/generated/prisma";
import { scoreAffairAgainstCandidates, resolveAffairPolitician } from "@/lib/affair-matching";
import { loadCandidatePool } from "@/lib/affair-matching/persistence";
import type { AffairCandidateRecord } from "@/lib/affair-matching";

interface DiscoveredAffair {
  politicianId: string;
  politicianName: string;
  title: string;
  description: string;
  category: AffairCategory;
  status: AffairStatus;
  involvement: Involvement;
  factsDate: Date | null;
  court: string | null;
  prisonMonths: number | null;
  prisonSuspended: boolean | null;
  ineligibilityMonths: number | null;
  communityService: number | null;
  otherSentence: string | null;
  courtQid: string | null;
  charges: string[];
  confidenceScore: number;
  publicationStatus: "PUBLISHED" | "DRAFT";
  sources: Array<{
    url: string;
    title: string;
    publisher: string;
    sourceType: "WIKIDATA" | "WIKIPEDIA" | "PRESSE";
    publishedAt: Date | null;
  }>;
  phase: "wikidata" | "wikipedia";
}

export interface DiscoverAffairsResult {
  politiciansProcessed: number;
  wikidataAffairsFound: number;
  wikipediaAffairsFound: number;
  duplicatesSkipped: number;
  affairsCreated: number;
  errors: string[];
}

export interface ExtractedPenaltyData {
  prisonMonths?: number;
  prisonSuspended?: boolean;
  hasFine?: boolean;
  ineligibilityMonths?: number;
  communityService?: number;
  otherSentence?: string;
  verdictDate?: Date;
  courtQid?: string;
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
    if (typeof tv === "object" && "time" in tv) {
      const match = tv.time.match(/^\+?(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        // Wikidata uses 00 for unknown month/day (year-only or month-only precision)
        const safeMonth = match[2] === "00" ? "01" : match[2];
        const safeDay = match[3] === "00" ? "01" : match[3];
        const date = new Date(`${match[1]}-${safeMonth}-${safeDay}`);
        if (!isNaN(date.getTime())) result.verdictDate = date;
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
        case "prisonMonths":
          result.prisonMonths = mapping.fixedMonths ?? durationMonths;
          result.prisonSuspended = mapping.suspended ?? false;
          break;
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

async function generateUniqueAffairSlug(politicianSlug: string, title: string): Promise<string> {
  const baseSlug = generateAffairSlug(politicianSlug, title);
  return generateUniqueSlug(
    baseSlug,
    (s) => db.affair.findUnique({ where: { slug: s } }).then(Boolean),
    120
  );
}

export async function discoverAffairs(options?: {
  limit?: number;
  politicianFilter?: string;
  wikidataOnly?: boolean;
  wikipediaOnly?: boolean;
}): Promise<DiscoverAffairsResult> {
  const { limit, politicianFilter, wikidataOnly = false, wikipediaOnly = false } = options ?? {};

  const stats: DiscoverAffairsResult = {
    politiciansProcessed: 0,
    wikidataAffairsFound: 0,
    wikipediaAffairsFound: 0,
    duplicatesSkipped: 0,
    affairsCreated: 0,
    errors: [],
  };

  // Fetch politicians
  const politicians = await db.politician.findMany({
    where: {
      publicationStatus: "PUBLISHED",
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

  if (politicians.length === 0) {
    return stats;
  }

  // Phase 1: Wikidata
  let phase1Affairs: DiscoveredAffair[] = [];
  if (!wikipediaOnly) {
    phase1Affairs = await runPhase1Wikidata(politicians, stats);
  }

  // Phase 2: Wikipedia
  let phase2Affairs: DiscoveredAffair[] = [];
  if (!wikidataOnly) {
    // Load the candidate pool once for the entire Wikipedia pass.
    // Building a Map avoids repeated array scans during per-politician lookups.
    const candidatePool = await loadCandidatePool();
    const poolById = new Map<string, AffairCandidateRecord>(candidatePool.map((c) => [c.id, c]));
    phase2Affairs = await runPhase2Wikipedia(politicians, phase1Affairs, stats, poolById);
  }

  // Phase 3: Reconciliation
  const allAffairs = [...phase1Affairs, ...phase2Affairs];

  if (allAffairs.length > 0) {
    await runPhase3Reconciliation(allAffairs, stats);
  }

  return stats;
}

async function runPhase1Wikidata(
  politicians: Array<{
    id: string;
    fullName: string;
    externalIds: Array<{ externalId: string }>;
  }>,
  stats: DiscoverAffairsResult
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

          const isConviction = prop === "P1399";
          const knownOffense = isKnownOffense(offenseQid);
          // Only auto-publish convictions with known offense types.
          // Unknown Q-IDs produce "Infraction inconnue" titles -> DRAFT for review.
          const publicationStatus = isConviction && knownOffense ? "PUBLISHED" : "DRAFT";
          const confidence = isConviction ? 95 : 75;
          const titlePrefix = isConviction ? "" : "[\u00c0 V\u00c9RIFIER] ";
          const title = `${titlePrefix}${label} \u2014 ${politician.fullName}`;

          // Call the resolver for audit-trail uniformity. The external-id signal
          // fires at +10.0 via the Q-ID match, so this is a no-op confirmation.
          // Non-blocking: resolver failure must not prevent affair creation.
          try {
            await resolveAffairPolitician({
              text: `${politician.fullName}: ${label}`,
              metadata: {
                source: "WIKIDATA" as SourceType,
                sourceRef: qid,
                factsDate: penaltyData.verdictDate ?? null,
                externalIds: { wikidataQId: qid },
              },
            });
          } catch (resolveErr) {
            console.warn(
              `[discover-affairs] Wikidata resolver call failed for ${politician.fullName} (${qid}):`,
              resolveErr instanceof Error ? resolveErr.message : resolveErr
            );
          }

          discovered.push({
            politicianId: politician.id,
            politicianName: politician.fullName,
            title,
            description: `${label} (${isConviction ? "condamnation" : "mise en cause"}) \u2014 source Wikidata (${qid}, propri\u00e9t\u00e9 ${prop}).`,
            category,
            status,
            involvement: isConviction ? "DIRECT" : "MENTIONED_ONLY",
            factsDate: penaltyData.verdictDate ?? null,
            court: null,
            prisonMonths: penaltyData.prisonMonths ?? null,
            prisonSuspended: penaltyData.prisonSuspended ?? null,
            ineligibilityMonths: penaltyData.ineligibilityMonths ?? null,
            communityService: penaltyData.communityService ?? null,
            otherSentence: penaltyData.otherSentence ?? null,
            courtQid: penaltyData.courtQid ?? null,
            charges: [label],
            confidenceScore: clampConfidenceScore(confidence),
            publicationStatus: publicationStatus as "PUBLISHED" | "DRAFT",
            sources: [
              {
                url: `https://www.wikidata.org/wiki/${qid}`,
                title: `Wikidata \u2014 ${politician.fullName}`,
                publisher: "Wikidata",
                sourceType: "WIKIDATA",
                publishedAt: null,
              },
            ],
            phase: "wikidata",
          });

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
  poolById: Map<string, AffairCandidateRecord>
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
            [candidate]
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
              publishedAt: extractDateFromUrl(sourceUrl),
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
            factsDate: extracted.factsDate ? new Date(extracted.factsDate) : null,
            court: extracted.court,
            prisonMonths: null,
            prisonSuspended: null,
            ineligibilityMonths: null,
            communityService: null,
            otherSentence: null,
            courtQid: null,
            charges: extracted.charges,
            confidenceScore: clampConfidenceScore(extracted.confidenceScore),
            publicationStatus: "DRAFT",
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

  if (affair.prisonMonths !== null && affair.prisonMonths > 0) {
    if (affair.prisonMonths === 9999) {
      parts.push("réclusion criminelle à perpétuité");
    } else {
      const years = Math.floor(affair.prisonMonths / 12);
      const months = affair.prisonMonths % 12;
      const duration =
        years > 0 && months > 0
          ? `${years} an${years > 1 ? "s" : ""} et ${months} mois`
          : years > 0
            ? `${years} an${years > 1 ? "s" : ""}`
            : `${months} mois`;
      const suffix = affair.prisonSuspended ? " avec sursis" : " de prison ferme";
      parts.push(duration + suffix);
    }
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

async function runPhase3Reconciliation(
  allAffairs: DiscoveredAffair[],
  stats: DiscoverAffairsResult
): Promise<void> {
  console.log(`Phase 3: Reconciliation - ${allAffairs.length} affairs`);

  for (const affair of allAffairs) {
    try {
      const matches = await findMatchingAffairs({
        politicianId: affair.politicianId,
        title: affair.title,
        category: affair.category,
      });

      const highMatch = matches.find((m) => m.confidence === "HIGH" || m.confidence === "CERTAIN");

      if (highMatch) {
        // Enrich existing affair with penalty data if fields are NULL
        if (affair.phase === "wikidata") {
          const updateData: Record<string, unknown> = {};
          if (affair.prisonMonths !== null) updateData.prisonMonths = affair.prisonMonths;
          if (affair.prisonSuspended !== null) updateData.prisonSuspended = affair.prisonSuspended;
          if (affair.ineligibilityMonths !== null)
            updateData.ineligibilityMonths = affair.ineligibilityMonths;
          if (affair.communityService !== null)
            updateData.communityService = affair.communityService;
          if (affair.otherSentence !== null) updateData.otherSentence = affair.otherSentence;
          if (affair.factsDate) updateData.verdictDate = affair.factsDate;
          if (affair.court) updateData.court = affair.court;

          const sentence = buildSentenceSummary(affair);
          if (sentence) updateData.sentence = sentence;

          if (Object.keys(updateData).length > 0) {
            await db.affair.update({
              where: { id: highMatch.affairId },
              data: updateData,
            });
          }
        }

        stats.duplicatesSkipped++;
        continue;
      }

      const politician = await db.politician.findUnique({
        where: { id: affair.politicianId },
        select: { slug: true },
      });
      const slug = await generateUniqueAffairSlug(politician?.slug ?? "", affair.title);

      await db.affair.create({
        data: {
          politicianId: affair.politicianId,
          title: affair.title,
          slug,
          description: affair.description,
          status: affair.status,
          category: affair.category,
          involvement: affair.involvement,
          factsDate: affair.factsDate,
          court: affair.court,
          prisonMonths: affair.prisonMonths,
          prisonSuspended: affair.prisonSuspended,
          ineligibilityMonths: affair.ineligibilityMonths,
          communityService: affair.communityService,
          otherSentence: affair.otherSentence,
          sentence: buildSentenceSummary(affair),
          confidenceScore: affair.confidenceScore,
          publicationStatus: affair.publicationStatus,
          verifiedAt: affair.publicationStatus === "PUBLISHED" ? new Date() : null,
          sources: {
            create: affair.sources.map((s) => ({
              url: s.url,
              title: s.title,
              publisher: s.publisher,
              publishedAt: s.publishedAt ?? affair.factsDate ?? new Date(),
              sourceType: s.sourceType,
            })),
          },
        },
      });

      stats.affairsCreated++;
    } catch (error) {
      stats.errors.push(
        `Create "${affair.title}": ${error instanceof Error ? error.message : error}`
      );
    }
  }
}
