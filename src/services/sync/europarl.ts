import { db } from "@/lib/db";
import { confirmedNow } from "@/lib/mandates/confirmation";
import { generateSlug } from "@/lib/utils";
import { MandateType, DataSource, PoliticalPosition } from "@/generated/prisma";
import { EuroparlDepute, EuroparlSyncResult } from "./types";
import { EUROPEAN_GROUPS } from "@/config/parties";
import { HTTPClient } from "@/lib/api/http-client";
import { EUROPARL_RATE_LIMIT_MS } from "@/config/rate-limits";
import { upsertPoliticianExternalId } from "@/lib/prisma-helpers";
import { shouldUpdatePhoto } from "@/config/photos";

const client = new HTTPClient({ rateLimitMs: EUROPARL_RATE_LIMIT_MS });

const EUROPARL_API_BASE = "https://data.europarl.europa.eu/api/v2";
const CURRENT_LEGISLATURE = 10; // 2024-2029

/**
 * Sync European Parliament political groups from config
 * Creates or updates groups in database
 */
async function syncEuropeanGroups(): Promise<Map<string, string>> {
  console.log("Syncing European Parliament political groups...");

  const codeToId = new Map<string, string>();

  for (const groupConfig of EUROPEAN_GROUPS) {
    const existing = await db.europeanGroup.findUnique({
      where: { code: groupConfig.code },
    });

    const groupData = {
      code: groupConfig.code,
      name: groupConfig.name,
      shortName: groupConfig.shortName || null,
      color: groupConfig.color,
      politicalPosition: (groupConfig.politicalPosition as PoliticalPosition) || null,
      wikidataId: groupConfig.wikidataId || null,
      website: groupConfig.website || null,
      legislature: CURRENT_LEGISLATURE,
    };

    let group;
    if (existing) {
      group = await db.europeanGroup.update({
        where: { id: existing.id },
        data: groupData,
      });
    } else {
      group = await db.europeanGroup.create({
        data: groupData,
      });
    }

    codeToId.set(groupConfig.code, group.id);
  }

  console.log(`Synced ${EUROPEAN_GROUPS.length} European groups`);
  return codeToId;
}

/**
 * Fetch current MEPs from European Parliament API
 */
async function fetchCurrentDeputes(): Promise<EuroparlDepute[]> {
  console.log("Fetching MEPs from European Parliament API...");

  const { data } = await client.get<{ data: EuroparlDepute[] }>(
    `${EUROPARL_API_BASE}/meps/show-current`,
    { headers: { Accept: "application/ld+json" } }
  );
  const meps = data.data;

  console.log(`Fetched ${meps.length} total MEPs`);
  return meps;
}

/**
 * Filter French MEPs from the list
 */
function filterFrenchDeputes(meps: EuroparlDepute[]): EuroparlDepute[] {
  const frenchMEPs = meps.filter((mep) => mep["api:country-of-representation"] === "FR");
  console.log(`Found ${frenchMEPs.length} French MEPs`);
  return frenchMEPs;
}

/**
 * Determine civility from name pattern
 * European Parliament data doesn't always include gender info
 */
function guessCivility(givenName: string): string | null {
  // French naming conventions - not perfect but reasonable
  const femaleEndings = ["e", "a", "ie", "ine", "ette", "elle"];
  const malePrefixes = ["Jean", "Pierre", "François", "Michel", "Philippe", "Thierry"];
  const femalePrefixes = ["Marie", "Anne", "Sophie", "Nathalie", "Christine", "Valérie"];

  const lowerName = givenName.toLowerCase();

  if (femalePrefixes.some((p) => givenName.startsWith(p))) return "Mme";
  if (malePrefixes.some((p) => givenName.startsWith(p))) return "M.";

  // Check endings (less reliable)
  for (const ending of femaleEndings) {
    if (lowerName.endsWith(ending) && lowerName.length > 3) {
      return "Mme";
    }
  }

  return null; // Unknown
}

/**
 * Sync a single MEP
 */
async function syncMEP(
  mep: EuroparlDepute,
  groupCodeToId: Map<string, string>
): Promise<{ result: "created" | "updated" | "error"; mandateResult?: "created" | "updated" }> {
  try {
    const europarlId = mep.identifier;
    const slug = generateSlug(`${mep.givenName}-${mep.familyName}`);
    const fullName = `${mep.givenName} ${mep.familyName}`;
    const europeanGroupCode = mep["api:political-group"] || null;
    const europeanGroupId = europeanGroupCode ? groupCodeToId.get(europeanGroupCode) : null;

    // Parse birth date if available
    const birthDate = mep.bday ? new Date(mep.bday) : null;

    // Guess civility from name
    const civility = guessCivility(mep.givenName);

    // Photo URL from European Parliament
    const photoUrl = `https://www.europarl.europa.eu/mepphoto/${europarlId}.jpg`;

    // Try to find politician by:
    // 1. ExternalId from Europarl
    // 2. Slug match
    // 3. Name match
    let existing = await db.politician.findFirst({
      where: {
        externalIds: {
          some: {
            source: DataSource.PARLEMENT_EUROPEEN,
            externalId: europarlId,
          },
        },
      },
      include: { mandates: true },
    });

    if (!existing) {
      existing = await db.politician.findFirst({
        where: { slug },
        include: { mandates: true },
      });
    }

    if (!existing) {
      // Try fuzzy name match
      existing = await db.politician.findFirst({
        where: {
          AND: [
            { firstName: { equals: mep.givenName, mode: "insensitive" } },
            { lastName: { equals: mep.familyName, mode: "insensitive" } },
          ],
        },
        include: { mandates: true },
      });
    }

    const politicianData = {
      slug,
      civility,
      firstName: mep.givenName,
      lastName: mep.familyName,
      fullName,
      birthDate,
      birthPlace: null,
      photoUrl,
      photoSource: "parlement-europeen",
    };

    let politician;
    let result: "created" | "updated";

    if (existing) {
      // Update existing politician
      // Only update photo if the new source has equal or higher priority than the current one
      const updatePhoto = shouldUpdatePhoto(existing.photoSource, "parlement-europeen");

      politician = await db.politician.update({
        where: { id: existing.id },
        data: {
          // Don't override existing data from other sources
          civility: existing.civility || politicianData.civility,
          birthDate: existing.birthDate || politicianData.birthDate,
          photoUrl: updatePhoto ? politicianData.photoUrl : existing.photoUrl,
          photoSource: updatePhoto ? politicianData.photoSource : existing.photoSource,
        },
      });
      result = "updated";
    } else {
      // Create new politician
      politician = await db.politician.create({
        data: politicianData,
      });
      result = "created";
    }

    // Upsert external ID
    await upsertPoliticianExternalId(
      politician.id,
      DataSource.PARLEMENT_EUROPEEN,
      europarlId,
      `https://www.europarl.europa.eu/meps/fr/${europarlId}`
    );

    // Handle MEP mandate
    const mandateTitle = "Député européen";
    const mandateInstitution = "Parlement européen";
    const constituency = "France";

    // Find existing MEP mandate
    const existingMandate = existing?.mandates.find(
      (m) => m.type === MandateType.DEPUTE_EUROPEEN && m.isCurrent
    );

    let mandateResult: "created" | "updated";

    if (existingMandate) {
      // Update existing mandate
      await db.mandate.update({
        where: { id: existingMandate.id },
        data: {
          externalId: europarlId,
          sourceUrl: `https://www.europarl.europa.eu/meps/fr/${europarlId}`,
          officialUrl: `https://www.europarl.europa.eu/meps/fr/${europarlId}`,
          europeanData: europeanGroupId
            ? {
                upsert: {
                  create: { europeanGroupId, europeanGroupCode },
                  update: { europeanGroupId, europeanGroupCode },
                },
              }
            : undefined,
        },
      });
      mandateResult = "updated";
    } else {
      // Create new mandate
      // Current legislature started July 2024
      const startDate = new Date("2024-07-16");

      await db.mandate.create({
        data: {
          politicianId: politician.id,
          type: MandateType.DEPUTE_EUROPEEN,
          title: mandateTitle,
          institution: mandateInstitution,
          constituency,
          startDate,
          isCurrent: true,
          lastConfirmedAt: confirmedNow(),
          source: DataSource.PARLEMENT_EUROPEEN,
          externalId: europarlId,
          sourceUrl: `https://www.europarl.europa.eu/meps/fr/${europarlId}`,
          officialUrl: `https://www.europarl.europa.eu/meps/fr/${europarlId}`,
          europeanData: europeanGroupId
            ? { create: { europeanGroupId, europeanGroupCode } }
            : undefined,
        },
      });
      mandateResult = "created";
    }

    return { result, mandateResult };
  } catch (error) {
    console.error(`Error syncing MEP ${mep.label}:`, error);
    return { result: "error" };
  }
}

/**
 * Main sync function for European Parliament MEPs
 */
export async function syncEuroparl(): Promise<EuroparlSyncResult> {
  const result: EuroparlSyncResult = {
    success: false,
    mepsCreated: 0,
    mepsUpdated: 0,
    mandatesCreated: 0,
    mandatesUpdated: 0,
    errors: [],
  };

  try {
    // First, sync European groups
    const groupCodeToId = await syncEuropeanGroups();

    // Fetch all current MEPs
    const allMEPs = await fetchCurrentDeputes();

    // Filter French MEPs
    const frenchMEPs = filterFrenchDeputes(allMEPs);

    console.log(`\nSyncing ${frenchMEPs.length} French MEPs...`);

    // Sync each MEP
    for (const mep of frenchMEPs) {
      const syncResult = await syncMEP(mep, groupCodeToId);

      if (syncResult.result === "created") {
        result.mepsCreated++;
      } else if (syncResult.result === "updated") {
        result.mepsUpdated++;
      } else {
        result.errors.push(`Failed to sync ${mep.label}`);
      }

      if (syncResult.mandateResult === "created") {
        result.mandatesCreated++;
      } else if (syncResult.mandateResult === "updated") {
        result.mandatesUpdated++;
      }
    }

    result.success = result.errors.length === 0;
    return result;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    return result;
  }
}

/**
 * Get stats about current MEPs in database
 */
export async function getEuroparlStats() {
  const mepCount = await db.mandate.count({
    where: {
      type: MandateType.DEPUTE_EUROPEEN,
      isCurrent: true,
    },
  });

  // Fetch group details first
  const groups = await db.europeanGroup.findMany({ take: 50 });

  // Get stats with group details via include
  const mandatesWithGroups = await db.mandate.findMany({
    where: {
      type: MandateType.DEPUTE_EUROPEEN,
      isCurrent: true,
    },
    include: {
      europeanData: {
        include: { europeanGroup: true },
      },
    },
  });

  // Count by group
  const groupCounts = new Map<
    string,
    { code: string; name: string; color: string | null; count: number }
  >();
  for (const mandate of mandatesWithGroups) {
    const group = mandate.europeanData?.europeanGroup;
    const key = group?.id || "unknown";
    const existing = groupCounts.get(key);
    if (existing) {
      existing.count++;
    } else {
      groupCounts.set(key, {
        code: group?.code || "Unknown",
        name: group?.name || "Unknown",
        color: group?.color || "#999999",
        count: 1,
      });
    }
  }

  return {
    totalMEPs: mepCount,
    totalGroups: groups.length,
    byGroup: Array.from(groupCounts.values()).sort((a, b) => b.count - a.count),
  };
}
