/**
 * Service to enrich politicians with Wikidata IDs by name matching.
 * Extracted from scripts/sync-wikidata-ids.ts for Inngest compatibility.
 *
 * NOTE: CheckpointManager and resume logic are CLI-only concerns
 * and are NOT included here. The CLI script still handles those.
 */

import { WikidataService } from "@/lib/api";
import { db } from "@/lib/db";
import { WIKIDATA_RATE_LIMIT_MS } from "@/config/rate-limits";
import { DataSource } from "@/generated/prisma";
import { findBestMatch, type WikidataCandidate } from "./wikidata-ids-match";

export interface WikidataIdsSyncResult {
  processed: number;
  idsCreated: number;
  alreadyUsed: number;
  noMatch: number;
  multipleMatches: number;
  errors: string[];
}

export async function syncWikidataIds(options?: {
  limit?: number;
}): Promise<WikidataIdsSyncResult> {
  const { limit } = options ?? {};

  const wikidata = new WikidataService({ rateLimitMs: WIKIDATA_RATE_LIMIT_MS });

  const stats: WikidataIdsSyncResult = {
    processed: 0,
    idsCreated: 0,
    alreadyUsed: 0,
    noMatch: 0,
    multipleMatches: 0,
    errors: [],
  };

  console.log("Fetching politicians from database...");

  const politicians = await db.politician.findMany({
    where: {
      externalIds: {
        none: { source: DataSource.WIKIDATA },
      },
    },
    select: {
      id: true,
      fullName: true,
      firstName: true,
      lastName: true,
      birthDate: true,
    },
    take: limit,
    orderBy: { lastName: "asc" },
  });

  console.log(`Found ${politicians.length} politicians without Wikidata ID`);

  if (politicians.length === 0) {
    return stats;
  }

  for (const politician of politicians) {
    stats.processed++;

    try {
      // Search by name
      const searchResults = await wikidata.searchByName(politician.fullName, {
        limit: 5,
      });

      if (searchResults.length === 0) {
        stats.noMatch++;
        continue;
      }

      // Get details for all candidates
      const candidateIds = searchResults.map((r) => r.id);
      const candidateDetails = await wikidata.checkFrenchPoliticians(candidateIds);

      // Build candidate info list
      const candidates: WikidataCandidate[] = [];
      candidateDetails.forEach((details, id) => {
        const searchResult = searchResults.find((r) => r.id === id);
        if (details.isFrench) {
          candidates.push({
            id,
            label: searchResult?.label || id,
            isFrench: details.isFrench,
            isPolitician: details.isPolitician,
            birthDate: details.birthDate,
          });
        }
      });

      if (candidates.length === 0) {
        stats.noMatch++;
        continue;
      }

      // Find best match
      const bestMatch = findBestMatch(candidates, politician.birthDate);

      if (!bestMatch) {
        stats.multipleMatches++;
        continue;
      }

      const wikidataId = bestMatch.id;

      // Check if this Wikidata ID is already used
      const existing = await db.externalId.findUnique({
        where: {
          source_externalId: {
            source: DataSource.WIKIDATA,
            externalId: wikidataId,
          },
        },
      });

      if (existing) {
        stats.alreadyUsed++;
        continue;
      }

      await db.externalId.create({
        data: {
          politicianId: politician.id,
          source: DataSource.WIKIDATA,
          externalId: wikidataId,
          url: `https://www.wikidata.org/wiki/${wikidataId}`,
        },
      });
      stats.idsCreated++;
      console.log(`${politician.fullName} -> ${wikidataId}`);
    } catch (error) {
      stats.errors.push(`${politician.fullName}: ${error}`);
    }
  }

  return stats;
}
