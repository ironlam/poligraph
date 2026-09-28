import { db } from "@/lib/db";
import { confirmedNow } from "@/lib/mandates/confirmation";
import { generateSlug } from "@/lib/utils";
import { MandateType, DataSource, Chamber } from "@/generated/prisma";
import { DeputeCSV, SyncResult } from "./types";
import { parse } from "csv-parse/sync";
import { politicianService } from "@/services/politician";
import { ASSEMBLY_GROUPS, type ParliamentaryGroupConfig } from "@/config/parliamentaryGroups";
import { HTTPClient } from "@/lib/api/http-client";
import { DATA_GOUV_RATE_LIMIT_MS } from "@/config/rate-limits";
import { upsertPoliticianExternalId } from "@/lib/prisma-helpers";

const client = new HTTPClient({ rateLimitMs: DATA_GOUV_RATE_LIMIT_MS });

const DATA_GOUV_URL =
  "https://static.data.gouv.fr/resources/deputes-actifs-de-lassemblee-nationale-informations-et-statistiques/20260118-063755/deputes-active.csv";

// Fallback URL pattern (latest resource)
const DATA_GOUV_DATASET_API =
  "https://www.data.gouv.fr/api/1/datasets/deputes-actifs-de-lassemblee-nationale-informations-et-statistiques/";

/**
 * Fetch the latest CSV URL from data.gouv.fr API
 */
async function getLatestCsvUrl(): Promise<string> {
  try {
    const { data } = await client.get<{ resources?: Array<{ format: string; url: string }> }>(
      DATA_GOUV_DATASET_API
    );
    const csvResource = data.resources?.find((r) => r.format?.toLowerCase() === "csv");

    if (csvResource?.url) {
      return csvResource.url;
    }
  } catch (error) {
    console.warn("Could not fetch latest URL, using default:", error);
  }

  return DATA_GOUV_URL;
}

/**
 * Fetch and parse deputies CSV from data.gouv.fr
 * Exported for reuse in cleanup scripts.
 */
export async function fetchDeputesCSV(): Promise<DeputeCSV[]> {
  const url = await getLatestCsvUrl();
  console.log(`Fetching deputies from: ${url}`);

  const { data: csvText } = await client.getText(url);
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as DeputeCSV[];

  console.log(`Parsed ${records.length} deputies from CSV`);
  return records;
}

/**
 * Sync parliamentary groups from deputies data.
 *
 * Creates/updates ParliamentaryGroup records (not Party records).
 * Resolves the real party via the config's partyWikidataId.
 *
 * Returns maps for:
 * - csvToGroupId: CSV groupeAbrev → ParliamentaryGroup ID
 * - csvToPartyId: CSV groupeAbrev → real Party ID (or null if transpartisan)
 */
async function syncGroups(deputies: DeputeCSV[]): Promise<{
  groupsCreated: number;
  groupsUpdated: number;
  csvToGroupId: Map<string, string>;
  csvToPartyId: Map<string, string | null>;
}> {
  const uniqueGroups = new Map<string, string>();

  // Extract unique groups from CSV
  for (const dep of deputies) {
    if (dep.groupeAbrev && !uniqueGroups.has(dep.groupeAbrev)) {
      uniqueGroups.set(dep.groupeAbrev, dep.groupe);
    }
  }

  let groupsCreated = 0;
  let groupsUpdated = 0;
  const csvToGroupId = new Map<string, string>();
  const csvToPartyId = new Map<string, string | null>();

  // Extract legislature from first deputy (all share the same)
  const csvLegislature = deputies[0]?.legislature ? parseInt(deputies[0].legislature, 10) : null;

  for (const [csvAbrev, fullName] of uniqueGroups) {
    const config: ParliamentaryGroupConfig | undefined = ASSEMBLY_GROUPS[csvAbrev];
    const groupCode = config?.code || csvAbrev;
    const groupName = config?.name || fullName;

    // 1. Upsert parliamentary group
    const leg = csvLegislature ?? 17;
    const slug = `${groupCode.toLowerCase()}-an-${leg}`;
    const groupData = {
      name: groupName,
      shortName: config?.shortName || null,
      color: config?.color || "#888888",
      chamber: Chamber.AN,
      politicalPosition: config?.politicalPosition || null,
      wikidataId: config?.wikidataId || null,
      slug,
      ...(csvLegislature ? { legislature: csvLegislature } : {}),
    };

    let group = await db.parliamentaryGroup.findUnique({
      where: { code_chamber: { code: groupCode, chamber: Chamber.AN } },
    });

    if (group) {
      group = await db.parliamentaryGroup.update({
        where: { id: group.id },
        data: groupData,
      });
      groupsUpdated++;
    } else {
      group = await db.parliamentaryGroup.create({
        data: { code: groupCode, ...groupData },
      });
      groupsCreated++;
    }

    csvToGroupId.set(csvAbrev, group.id);

    // 2. Resolve real party via defaultPartyId (set during seed)
    //    or look up by Wikidata ID
    let realPartyId: string | null = group.defaultPartyId;

    if (!realPartyId && config?.partyWikidataId) {
      const extId = await db.externalId.findFirst({
        where: {
          source: DataSource.WIKIDATA,
          externalId: config.partyWikidataId,
          partyId: { not: null },
        },
        select: { partyId: true },
      });
      realPartyId = extId?.partyId ?? null;

      // Update the group's defaultPartyId for future use
      if (realPartyId) {
        await db.parliamentaryGroup.update({
          where: { id: group.id },
          data: { defaultPartyId: realPartyId },
        });
      }
    }

    csvToPartyId.set(csvAbrev, realPartyId);
  }

  return { groupsCreated, groupsUpdated, csvToGroupId, csvToPartyId };
}

/**
 * Sync a single deputy
 */
async function syncDeputy(
  dep: DeputeCSV,
  groupMap: Map<string, string>,
  partyMap: Map<string, string | null>
): Promise<"created" | "updated" | "error"> {
  try {
    const slug = generateSlug(`${dep.prenom}-${dep.nom}`);
    const fullName = `${dep.prenom} ${dep.nom}`;
    const partyId = partyMap.get(dep.groupeAbrev) ?? null;
    const groupId = groupMap.get(dep.groupeAbrev) || null;

    const birthDate = dep.naissance ? new Date(dep.naissance) : null;
    const mandateStart = dep.datePriseFonction ? new Date(dep.datePriseFonction) : new Date();

    // Check if politician exists
    const existing = await db.politician.findFirst({
      where: {
        OR: [{ officialId: dep.id }, { slug }],
      },
      include: { mandates: true },
    });

    // Photo URL from Assemblée nationale (official, higher quality)
    const anNumericId = dep.id.replace("PA", "");
    const photoUrl = `https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/carre/${anNumericId}.jpg`;

    const contactData = {
      contactEmail: dep.mail || null,
      contactTwitter: dep.twitter || null,
      contactFacebook: dep.facebook || null,
      contactWebsite: dep.website || null,
    };

    const politicianData = {
      slug,
      civility: dep.civ || null,
      firstName: dep.prenom,
      lastName: dep.nom,
      fullName,
      birthDate,
      birthPlace: dep.villeNaissance || null,
      photoUrl,
      photoSource: "assemblee-nationale",
      officialId: dep.id,
    };

    const mandateData = {
      type: MandateType.DEPUTE,
      title: `Député${dep.civ === "Mme" ? "e" : ""} de la ${dep.circo}${getOrdinalSuffix(dep.circo)} circonscription`,
      institution: "Assemblée nationale",
      constituency: `${dep.departementNom} (${dep.circo})`,
      departmentCode: dep.departementCode || null,
      startDate: mandateStart,
      isCurrent: true,
      lastConfirmedAt: confirmedNow(),
      source: DataSource.ASSEMBLEE_NATIONALE,
      sourceUrl: `https://www.assemblee-nationale.fr/dyn/deputes/${dep.id}`,
      officialUrl: `https://www.assemblee-nationale.fr/dyn/deputes/${dep.id}`,
      externalId: `${dep.id}-leg${dep.legislature}`,
    };

    if (existing) {
      // Update politician
      await db.politician.update({
        where: { id: existing.id },
        data: {
          ...politicianData,
          ...(existing.contactOverride ? {} : contactData),
        },
      });

      // Update party affiliation via service (real party, not group)
      await politicianService.setCurrentParty(existing.id, partyId);

      // Upsert external IDs
      await upsertExternalIds(existing.id, dep.id, slug);

      // Update or create current mandate
      const existingMandate = existing.mandates.find(
        (m) => m.externalId === mandateData.externalId
      );

      if (existingMandate) {
        await db.mandate.update({
          where: { id: existingMandate.id },
          data: {
            ...mandateData,
            parliamentaryData: groupId
              ? {
                  upsert: {
                    create: { parliamentaryGroupId: groupId },
                    update: { parliamentaryGroupId: groupId },
                  },
                }
              : undefined,
          },
        });
      } else {
        // Mark old mandates as not current
        await db.mandate.updateMany({
          where: { politicianId: existing.id, isCurrent: true },
          data: { isCurrent: false },
        });

        await db.mandate.create({
          data: {
            ...mandateData,
            politicianId: existing.id,
            parliamentaryData: groupId ? { create: { parliamentaryGroupId: groupId } } : undefined,
          },
        });
      }

      return "updated";
    } else {
      // Create new politician with mandate
      const newPolitician = await db.politician.create({
        data: {
          ...politicianData,
          ...contactData,
          mandates: {
            create: {
              ...mandateData,
              parliamentaryData: groupId
                ? { create: { parliamentaryGroupId: groupId } }
                : undefined,
            },
          },
        },
      });

      // Set party affiliation via service (creates PartyMembership)
      await politicianService.setCurrentParty(newPolitician.id, partyId);

      // Create external IDs
      await upsertExternalIds(newPolitician.id, dep.id, slug);

      return "created";
    }
  } catch (error) {
    console.error(`Error syncing deputy ${dep.prenom} ${dep.nom}:`, error);
    return "error";
  }
}

/**
 * Get ordinal suffix for French numbers
 */
function getOrdinalSuffix(n: string): string {
  const num = parseInt(n, 10);
  if (num === 1) return "ère";
  return "ème";
}

/**
 * Upsert external IDs for a politician
 */
async function upsertExternalIds(politicianId: string, anId: string, slug: string): Promise<void> {
  // Assemblée Nationale ID
  await upsertPoliticianExternalId(
    politicianId,
    DataSource.ASSEMBLEE_NATIONALE,
    anId,
    `https://www.assemblee-nationale.fr/dyn/deputes/${anId}`
  );

  // NosDéputés ID (uses slug)
  await upsertPoliticianExternalId(
    politicianId,
    DataSource.NOSDEPUTES,
    slug,
    `https://www.nosdeputes.fr/${slug}`
  );
}

/**
 * Deactivate mandates for deputies no longer in the CSV.
 *
 * Two-pass approach:
 * 1. AN-sourced mandates: compare AN external IDs against the CSV
 * 2. Non-AN-sourced mandates (Wikidata, etc.): if no AN-sourced mandate
 *    exists for the same politician, and politician isn't in the CSV, close it.
 */
async function deactivateStaleMandates(activeAnIds: Set<string>): Promise<number> {
  let count = 0;
  const today = new Date();

  // Pass 1: AN-sourced mandates
  const anMandates = await db.mandate.findMany({
    where: {
      type: MandateType.DEPUTE,
      isCurrent: true,
      source: DataSource.ASSEMBLEE_NATIONALE,
    },
    include: {
      politician: {
        select: {
          id: true,
          fullName: true,
          externalIds: {
            where: { source: DataSource.ASSEMBLEE_NATIONALE },
            select: { externalId: true },
          },
        },
      },
    },
  });

  for (const mandate of anMandates) {
    const anId = mandate.politician.externalIds[0]?.externalId;
    if (!anId || !activeAnIds.has(anId)) {
      await db.mandate.update({
        where: { id: mandate.id },
        data: { isCurrent: false, endDate: today },
      });
      console.log(`  ⊘ Deactivated (AN): ${mandate.politician.fullName} (${anId || "no AN ID"})`);
      count++;
    }
  }

  // Pass 2: non-AN-sourced DEPUTE mandates (Wikidata, HATVP, etc.)
  const nonAnMandates = await db.mandate.findMany({
    where: {
      type: MandateType.DEPUTE,
      isCurrent: true,
      source: { not: DataSource.ASSEMBLEE_NATIONALE },
    },
    include: {
      politician: {
        select: {
          id: true,
          fullName: true,
          officialId: true,
          externalIds: {
            where: { source: DataSource.ASSEMBLEE_NATIONALE },
            select: { externalId: true },
          },
        },
      },
    },
  });

  for (const mandate of nonAnMandates) {
    // Skip if politician also has a current AN-sourced mandate (handled in pass 1)
    const hasAnMandate = anMandates.some((m) => m.politician.id === mandate.politician.id);
    if (hasAnMandate) continue;

    // Check if politician matches anyone in the CSV
    const anId = mandate.politician.externalIds[0]?.externalId || mandate.politician.officialId;
    if (!anId || !activeAnIds.has(anId)) {
      await db.mandate.update({
        where: { id: mandate.id },
        data: { isCurrent: false, endDate: today },
      });
      console.log(
        `  ⊘ Deactivated (${mandate.source || "unknown"}): ${mandate.politician.fullName}`
      );
      count++;
    }
  }

  return count;
}

/**
 * Main sync function - imports/updates all deputies
 */
export async function syncDeputes(): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    groupsCreated: 0,
    groupsUpdated: 0,
    deputiesCreated: 0,
    deputiesUpdated: 0,
    deputiesDeactivated: 0,
    errors: [],
  };

  try {
    console.log("Starting deputies sync...");

    // 1. Fetch data
    const deputies = await fetchDeputesCSV();

    // 2. Sync parliamentary groups and resolve real parties
    console.log("Syncing parliamentary groups...");
    const { groupsCreated, groupsUpdated, csvToGroupId, csvToPartyId } = await syncGroups(deputies);
    result.groupsCreated = groupsCreated;
    result.groupsUpdated = groupsUpdated;

    // 3. Sync deputies (with real party ID, not group ID)
    console.log("Syncing deputies...");
    for (const dep of deputies) {
      const status = await syncDeputy(dep, csvToGroupId, csvToPartyId);
      if (status === "created") result.deputiesCreated++;
      else if (status === "updated") result.deputiesUpdated++;
      else result.errors.push(`${dep.prenom} ${dep.nom}`);
    }

    // 4. Deactivate mandates for deputies no longer in CSV
    console.log("Checking for stale mandates...");
    const activeAnIds = new Set(deputies.map((d) => d.id));
    result.deputiesDeactivated = await deactivateStaleMandates(activeAnIds);

    result.success = true;
    console.log("Sync completed:", result);
  } catch (error) {
    result.errors.push(String(error));
    console.error("Sync failed:", error);
  }

  return result;
}

/**
 * Get sync status/stats
 */
export async function getSyncStats() {
  const [politicianCount, partyCount, mandateCount] = await Promise.all([
    db.politician.count(),
    db.party.count(),
    db.mandate.count({ where: { isCurrent: true } }),
  ]);

  return {
    politicians: politicianCount,
    parties: partyCount,
    currentMandates: mandateCount,
  };
}
