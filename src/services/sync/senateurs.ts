import { db } from "@/lib/db";
import { confirmedNow } from "@/lib/mandates/confirmation";
import { generateSlug } from "@/lib/utils";
import { MandateType, DataSource, Chamber } from "@/generated/prisma";
import { SenateurAPI, NosSenateursAPI, SenatSyncResult } from "./types";
import { politicianService } from "@/services/politician";
import { SENATE_GROUPS, type ParliamentaryGroupConfig } from "@/config/parliamentaryGroups";
import { findDepartmentCode } from "@/config/departments";
import { parseSenateSeries, getSeriesTermStart } from "@/config/senatoriales";
import { HTTPClient } from "@/lib/api/http-client";
import { SENAT_RATE_LIMIT_MS } from "@/config/rate-limits";
import { upsertPoliticianExternalId } from "@/lib/prisma-helpers";
import { shouldUpdatePhoto } from "@/config/photos";
import {
  findUnknownMatricules,
  mapUnknownMatricule,
  keepExistingStartDate,
  pickSenateMandateToUpdate,
  SENATE_TERM_2026_START,
  UnknownSenateMatriculesError,
  type Elected2026,
} from "./senate-unknown-matricules";

const client = new HTTPClient({ rateLimitMs: SENAT_RATE_LIMIT_MS });

export const SENAT_API_URL = "https://www.senat.fr/api-senat/senateurs.json";
const NOSSENATEURS_API_URL = "https://archive.nossenateurs.fr/senateurs/json";

/**
 * Fetch senators from senat.fr API
 */
async function fetchSenatAPI(): Promise<SenateurAPI[]> {
  console.log(`Fetching senators from: ${SENAT_API_URL}`);

  const { data } = await client.get<SenateurAPI[]>(SENAT_API_URL);
  console.log(`Parsed ${data.length} senators from senat.fr`);
  return data;
}

/**
 * Fetch additional data from NosSenateurs (birth dates, etc.)
 */
async function fetchNosSenateursAPI(): Promise<Map<string, NosSenateursAPI>> {
  console.log(`Fetching additional data from: ${NOSSENATEURS_API_URL}`);

  try {
    const { data } = await client.get<{ senateurs?: NosSenateursAPI[] } | NosSenateursAPI[]>(
      NOSSENATEURS_API_URL
    );
    const senators: NosSenateursAPI[] = Array.isArray(data) ? data : data.senateurs || [];
    console.log(`Parsed ${senators.length} senators from NosSenateurs`);

    // Create lookup map by matricule/id_institution
    const map = new Map<string, NosSenateursAPI>();
    for (const s of senators) {
      if (s.id_institution) {
        map.set(s.id_institution, s);
      }
      // Also index by slug for fallback matching
      if (s.slug) {
        map.set(s.slug.toLowerCase(), s);
      }
    }

    return map;
  } catch (error) {
    console.warn("Could not fetch NosSenateurs data:", error);
    return new Map();
  }
}

/**
 * Sync parliamentary groups from senators data.
 *
 * Creates/updates ParliamentaryGroup records (not Party records).
 * Resolves the real party via the config's partyWikidataId.
 */
async function syncSenateParliamentaryGroups(senators: SenateurAPI[]): Promise<{
  groupsCreated: number;
  groupsUpdated: number;
  codeToGroupId: Map<string, string>;
  codeToPartyId: Map<string, string | null>;
}> {
  const uniqueGroups = new Map<string, { code: string; libelle: string }>();

  // Extract unique groups
  for (const sen of senators) {
    if (sen.groupe?.code && !uniqueGroups.has(sen.groupe.code)) {
      uniqueGroups.set(sen.groupe.code, sen.groupe);
    }
  }

  let groupsCreated = 0;
  let groupsUpdated = 0;
  const codeToGroupId = new Map<string, string>();
  const codeToPartyId = new Map<string, string | null>();

  for (const [code, groupe] of uniqueGroups) {
    const config: ParliamentaryGroupConfig | undefined = SENATE_GROUPS[code];
    const groupCode = config?.code || code;
    const groupName = config?.name || groupe.libelle;

    // 1. Upsert parliamentary group
    const slug = `${groupCode.toLowerCase()}-senat`;
    const groupData = {
      name: groupName,
      shortName: config?.shortName || null,
      color: config?.color || "#888888",
      chamber: Chamber.SENAT,
      politicalPosition: config?.politicalPosition || null,
      wikidataId: config?.wikidataId || null,
      slug,
    };

    let group = await db.parliamentaryGroup.findUnique({
      where: { code_chamber: { code: groupCode, chamber: Chamber.SENAT } },
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

    codeToGroupId.set(code, group.id);

    // 2. Resolve real party via defaultPartyId or Wikidata lookup
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

      if (realPartyId) {
        await db.parliamentaryGroup.update({
          where: { id: group.id },
          data: { defaultPartyId: realPartyId },
        });
      }
    }

    codeToPartyId.set(code, realPartyId);
  }

  return { groupsCreated, groupsUpdated, codeToGroupId, codeToPartyId };
}

/**
 * Sync a single senator
 */
async function syncSenator(
  sen: SenateurAPI,
  groupMap: Map<string, string>,
  partyMap: Map<string, string | null>,
  nosSenateursData: Map<string, NosSenateursAPI>
): Promise<"created" | "updated" | "skipped" | "error"> {
  try {
    const slug = generateSlug(`${sen.prenom}-${sen.nom}`);
    const fullName = `${sen.prenom} ${sen.nom}`;
    const partyId = sen.groupe?.code ? (partyMap.get(sen.groupe.code) ?? null) : null;
    const groupId = sen.groupe?.code ? groupMap.get(sen.groupe.code) || null : null;

    // Try to get additional data from NosSenateurs
    const extraData = nosSenateursData.get(sen.matricule) || nosSenateursData.get(slug);

    // Parse birth date if available
    let birthDate: Date | null = null;
    let birthPlace: string | null = null;

    if (extraData?.date_naissance) {
      birthDate = new Date(extraData.date_naissance);
      if (isNaN(birthDate.getTime())) birthDate = null;
    }
    if (extraData?.lieu_naissance) {
      birthPlace = extraData.lieu_naissance;
    }

    // Renewal series, straight from the Senate API. Authoritative: neither the
    // start date nor the department can stand in for it.
    const senateSeries = parseSenateSeries(sen.serie);

    // Parse mandate start date
    let mandateStart: Date | null = null;
    const hasApiDate = Boolean(extraData?.mandat_debut);
    if (extraData?.mandat_debut) {
      mandateStart = new Date(extraData.mandat_debut);
      if (isNaN(mandateStart.getTime())) mandateStart = null;
    }
    // Fallback for a senator we have no individual date for: the day their series
    // last took office. Approximate by construction, and wrong for anyone who took
    // over mid-cycle, which is why `audit:senateurs-series` reports on it.
    if (!mandateStart && senateSeries) {
      mandateStart = getSeriesTermStart(senateSeries);
    }

    // Photo URL from senat.fr (urlAvatar is a relative path like /senimg/xxx.jpg)
    const rawAvatar = sen.urlAvatar || `/senateur/${sen.matricule}/photo.jpg`;
    const photoUrl = rawAvatar.startsWith("http") ? rawAvatar : `https://www.senat.fr${rawAvatar}`;

    // Senator by Senate matricule only; unknown matricules were mapped or skipped upstream
    const existingByExtId = await db.externalId.findUnique({
      where: {
        source_externalId: {
          source: DataSource.SENAT,
          externalId: sen.matricule,
        },
      },
      include: { politician: { include: { mandates: true } } },
    });

    const existing = existingByExtId?.politician;

    const politicianData = {
      slug,
      civility: sen.civilite || null,
      firstName: sen.prenom,
      lastName: sen.nom,
      fullName,
      birthDate: birthDate || undefined,
      birthPlace: birthPlace || undefined,
      photoUrl,
      photoSource: "senat",
    };

    const mandateData = {
      type: MandateType.SENATEUR,
      title:
        `${sen.feminise ? "Sénatrice" : "Sénateur"} ${sen.circonscription?.libelle || ""}`.trim(),
      institution: "Sénat",
      constituency: sen.circonscription?.libelle || null,
      departmentCode: sen.circonscription?.libelle
        ? findDepartmentCode(sen.circonscription.libelle)
        : null,
      senateSeries,
      startDate: mandateStart || new Date(),
      isCurrent: true,
      lastConfirmedAt: confirmedNow(),
      source: DataSource.SENAT,
      sourceUrl: sen.url
        ? `https://www.senat.fr${sen.url}`
        : `https://www.senat.fr/senateur/${sen.matricule}/`,
      officialUrl: sen.url
        ? `https://www.senat.fr${sen.url}`
        : `https://www.senat.fr/senateur/${sen.matricule}/`,
      externalId: `senat-${sen.matricule}`,
    };

    // Decided before any write: a senator whose only Senate mandate is closed is left
    // untouched, so neither the mandate nor the record (party, photo) moves.
    const mandateDecision = existing
      ? pickSenateMandateToUpdate(existing.mandates, `senat-${sen.matricule}`)
      : null;
    if (mandateDecision?.kind === "skip") return "skipped";

    if (existing) {
      // Update politician (preserve existing data if new data is empty)
      await db.politician.update({
        where: { id: existing.id },
        data: {
          ...politicianData,
          // Only update birth data if we have it and it's missing
          birthDate: existing.birthDate || politicianData.birthDate,
          birthPlace: existing.birthPlace || politicianData.birthPlace,
          // Only update photo if current photo is not from a higher priority source
          ...(shouldUpdatePhoto(existing.photoSource, "senat")
            ? { photoUrl: politicianData.photoUrl, photoSource: politicianData.photoSource }
            : {}),
        },
      });

      // Update party affiliation via service (real party, not group)
      // Skip if group is transpartisan (partyId null) and politician already has a party
      if (partyId || !existing.currentPartyId) {
        await politicianService.setCurrentParty(existing.id, partyId);
      }

      // Upsert external ID
      await upsertExternalIds(existing.id, sen.matricule, slug);

      if (mandateDecision?.kind === "update") {
        const existingMandate = mandateDecision.mandate;
        // Keep the stored start date without an API date (the series fallback would
        // overwrite a remplaçant's accurate one), and never move a 2026 term back.
        const updateData = { ...mandateData };
        if (
          existingMandate.startDate &&
          keepExistingStartDate(existingMandate.startDate, hasApiDate ? mandateStart : null)
        ) {
          updateData.startDate = existingMandate.startDate;
        }
        await db.mandate.update({
          where: { id: existingMandate.id },
          data: {
            ...updateData,
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
      // Create new politician
      const newPolitician = await db.politician.create({
        data: {
          ...politicianData,
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

      await upsertExternalIds(newPolitician.id, sen.matricule, slug);
      return "created";
    }
  } catch (error) {
    console.error(`Error syncing senator ${sen.prenom} ${sen.nom}:`, error);
    return "error";
  }
}

/**
 * Upsert external IDs for a senator
 */
async function upsertExternalIds(
  politicianId: string,
  matricule: string,
  slug: string
): Promise<void> {
  // Sénat ID
  await upsertPoliticianExternalId(
    politicianId,
    DataSource.SENAT,
    matricule,
    `https://www.senat.fr/senateur/${matricule}/`
  );

  // NosSénateurs ID (if different from matricule)
  // Using slug as the ID since that's how NosSénateurs URLs work
  // Reusing NOSDEPUTES for NosSénateurs (same platform)
  await upsertPoliticianExternalId(
    politicianId,
    DataSource.NOSDEPUTES,
    `senateur-${slug}`,
    `https://archive.nossenateurs.fr/${slug}`
  );
}

/**
 * Attach each matricule unknown to the base to its person elected in 2026, by creating the
 * SENAT external id, and return those that could not be attached.
 */
async function mapUnknownSenators(
  senators: SenateurAPI[]
): Promise<Array<{ matricule: string; name: string }>> {
  const known = new Set(
    (
      await db.externalId.findMany({
        where: { source: DataSource.SENAT },
        select: { externalId: true },
      })
    ).map((e) => e.externalId)
  );
  const unknown = new Set(
    findUnknownMatricules(
      senators.map((s) => s.matricule),
      known
    )
  );
  if (unknown.size === 0) return [];

  const candidacies = await db.candidacy.findMany({
    where: { election: { slug: "senatoriales-2026" }, isElected: true },
    take: 200,
    select: {
      politicianId: true,
      candidateName: true,
      constituencyCode: true,
      politician: {
        select: {
          mandates: {
            where: {
              type: MandateType.SENATEUR,
              isCurrent: true,
              startDate: { gte: SENATE_TERM_2026_START },
            },
            select: { id: true },
          },
        },
      },
    },
  });
  const elected2026: Elected2026[] = candidacies.map((c) => ({
    politicianId: c.politicianId,
    name: c.candidateName,
    constituencyCode: c.constituencyCode ?? "",
    hasOpenedTerm: (c.politician?.mandates.length ?? 0) > 0,
  }));

  const unresolved: Array<{ matricule: string; name: string }> = [];
  for (const sen of senators.filter((s) => unknown.has(s.matricule))) {
    const departmentCode = sen.circonscription?.libelle
      ? findDepartmentCode(sen.circonscription.libelle)
      : null;
    const mapping = mapUnknownMatricule(
      { matricule: sen.matricule, prenom: sen.prenom, nom: sen.nom, departmentCode },
      elected2026
    );
    if ("politicianId" in mapping) {
      await upsertPoliticianExternalId(
        mapping.politicianId,
        DataSource.SENAT,
        sen.matricule,
        `https://www.senat.fr/senateur/${sen.matricule}/`
      );
    } else {
      unresolved.push({
        matricule: sen.matricule,
        name: `${sen.prenom} ${sen.nom} (${mapping.reason})`,
      });
    }
  }
  return unresolved;
}

/**
 * Main sync function - imports/updates all senators
 */
export async function syncSenateurs(): Promise<SenatSyncResult> {
  const result: SenatSyncResult = {
    success: false,
    groupsCreated: 0,
    groupsUpdated: 0,
    senatorsCreated: 0,
    senatorsUpdated: 0,
    errors: [],
  };

  try {
    console.log("Starting senators sync...");

    // 1. Fetch data from both APIs
    const [senators, nosSenateursData] = await Promise.all([
      fetchSenatAPI(),
      fetchNosSenateursAPI(),
    ]);

    // 1b. Map every matricule we do not know to a person elected on 27 September 2026,
    // never by name alone across the base: syncSenator() no longer has a name fallback, and a
    // homonym elsewhere (a mayor, a former MP) must not receive the mandate. A senator that
    // cannot be mapped is left out of this run and reported, the others are synced.
    const unresolved = await mapUnknownSenators(senators);
    const skipped = new Set(unresolved.map((u) => u.matricule));

    // 2. Sync parliamentary groups and resolve real parties
    console.log("Syncing senate parliamentary groups...");
    const { groupsCreated, groupsUpdated, codeToGroupId, codeToPartyId } =
      await syncSenateParliamentaryGroups(senators);
    result.groupsCreated = groupsCreated;
    result.groupsUpdated = groupsUpdated;

    // 3. Sync senators (with real party ID, not group ID)
    console.log("Syncing senators...");
    for (const sen of senators) {
      if (skipped.has(sen.matricule)) continue;
      const status = await syncSenator(sen, codeToGroupId, codeToPartyId, nosSenateursData);
      if (status === "created") result.senatorsCreated++;
      else if (status === "updated") result.senatorsUpdated++;
      else if (status === "skipped")
        result.errors.push(
          `${sen.prenom} ${sen.nom} : mandat sénatorial fermé, non rouvert (senateurs.json pas encore à jour ?)`
        );
      else result.errors.push(`${sen.prenom} ${sen.nom}`);
    }

    if (unresolved.length > 0) {
      // An incomplete run closes nothing: before the switch of mandates, closing here would
      // end the outgoing senators on the sync date instead of 30 September.
      result.errors.push(new UnknownSenateMatriculesError(unresolved).message);
      console.error(new UnknownSenateMatriculesError(unresolved).message);
      return result;
    }

    // 4. Close mandates for senators no longer in the API
    const apiMatricules = new Set(senators.map((s) => s.matricule));

    const currentDbMandates = await db.mandate.findMany({
      where: { type: MandateType.SENATEUR, isCurrent: true, source: DataSource.SENAT },
      include: {
        politician: {
          select: {
            id: true,
            fullName: true,
            externalIds: {
              where: { source: DataSource.SENAT },
              select: { externalId: true },
            },
          },
        },
      },
    });

    let mandatesClosed = 0;
    for (const mandate of currentDbMandates) {
      const senatId = mandate.politician.externalIds[0]?.externalId;
      if (!senatId || !apiMatricules.has(senatId)) {
        await db.mandate.update({
          where: { id: mandate.id },
          data: { isCurrent: false, endDate: new Date() },
        });
        mandatesClosed++;
        console.log(`  Mandat fermé: ${mandate.politician.fullName}`);
      }
    }
    if (mandatesClosed > 0) {
      console.log(`${mandatesClosed} mandats sénatoriaux fermés (absents de l'API)`);
    }

    result.success = true;
    console.log("Sync completed:", result);
  } catch (error) {
    result.errors.push(String(error));
    console.error("Sync failed:", error);
  }

  return result;
}

/**
 * Get senator stats
 */
export async function getSenatStats() {
  const [senatorCount, currentSenatorMandates] = await Promise.all([
    db.politician.count({
      where: {
        mandates: {
          some: {
            type: MandateType.SENATEUR,
            isCurrent: true,
          },
        },
      },
    }),
    db.mandate.count({
      where: {
        type: MandateType.SENATEUR,
        isCurrent: true,
      },
    }),
  ]);

  return {
    senators: senatorCount,
    currentMandates: currentSenatorMandates,
  };
}
