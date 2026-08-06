import { db } from "@/lib/db";
import { generateSlug } from "@/lib/utils";
import { MandateType, DataSource } from "@/generated/prisma";
import { parse } from "csv-parse/sync";
import { GouvernementCSV, GouvernementSyncResult, GOUV_FUNCTION_MAPPING } from "./types";
import { politicianService } from "@/services/politician";
import { parseFrenchDate as parseCanonicalFrenchDate } from "@/lib/parsing";
import * as fs from "fs";
import * as path from "path";
import { HTTPClient } from "@/lib/api/http-client";
import { DATA_GOUV_RATE_LIMIT_MS } from "@/config/rate-limits";
import { upsertPoliticianExternalId } from "@/lib/prisma-helpers";
import { sanitizeGovernmentTitle } from "./government-title";

const client = new HTTPClient({ rateLimitMs: DATA_GOUV_RATE_LIMIT_MS });

// Local corrections file path
const CORRECTIONS_FILE = path.join(process.cwd(), "data", "government-corrections.json");

interface GovernmentCorrections {
  endMandates: Array<{
    politicianName: string;
    mandateType: string;
    endDate: string;
  }>;
  newMembers: Array<{
    firstName: string;
    lastName: string;
    fullName: string;
    civility?: string;
    birthDate?: string;
    mandate: {
      type: string;
      title: string;
      startDate: string;
      government: string;
    };
    party?: string;
  }>;
  updateMembers: Array<{
    politicianName: string;
    updates: Record<string, unknown>;
    _disabled?: boolean;
  }>;
}

const DATA_GOUV_CSV_URL =
  "https://static.data.gouv.fr/resources/historique-des-gouvernements-de-la-veme-republique/20250313-105416/liste-membres-gouvernements-5eme-republique.csv";

/**
 * Parse French date format: "vendredi 13 décembre 2024"
 * Strips the leading day-name and delegates to the canonical parser.
 */
function parseFrenchDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === "") return null;
  // Remove leading day name: "vendredi 13 décembre 2024" → "13 décembre 2024"
  const withoutDayName = dateStr.trim().replace(/^\S+\s+/, "");
  return parseCanonicalFrenchDate(withoutDayName);
}

/**
 * Fetch and parse government members CSV
 */
async function fetchGovernmentCSV(): Promise<GouvernementCSV[]> {
  console.log(`Fetching government data from: ${DATA_GOUV_CSV_URL}`);

  const { data: csvText } = await client.getText(DATA_GOUV_CSV_URL);
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter: ";",
    bom: true,
  }) as GouvernementCSV[];

  console.log(`Parsed ${records.length} government member records`);
  return records;
}

/**
 * Get current government members (those without end date)
 */
function getCurrentGovernment(records: GouvernementCSV[]): GouvernementCSV[] {
  // Find records without end date (current government)
  const current = records.filter((r) => !r.date_fin_fonction || r.date_fin_fonction.trim() === "");
  console.log(`Found ${current.length} current government members`);
  return current;
}

/**
 * Map function code to MandateType
 */
function getMandateType(code: string): MandateType {
  const mapping = GOUV_FUNCTION_MAPPING[code];
  switch (mapping) {
    case "PREMIER_MINISTRE":
      return MandateType.PREMIER_MINISTRE;
    case "MINISTRE":
      return MandateType.MINISTRE;
    case "MINISTRE_DELEGUE":
      return MandateType.MINISTRE_DELEGUE;
    case "SECRETAIRE_ETAT":
      return MandateType.SECRETAIRE_ETAT;
    default:
      return MandateType.MINISTRE;
  }
}

/**
 * Sync a single government member
 */
async function syncGouvernementMember(
  member: GouvernementCSV
): Promise<{ status: "created" | "updated" | "error"; mandateCreated: boolean }> {
  try {
    const slug = generateSlug(`${member.prenom}-${member.nom}`);
    const fullName = `${member.prenom} ${member.nom}`;

    // Parse dates
    const startDate = parseFrenchDate(member.date_debut_fonction);
    const endDate = parseFrenchDate(member.date_fin_fonction);

    if (!startDate) {
      console.warn(`Could not parse start date for ${fullName}: ${member.date_debut_fonction}`);
      return { status: "error", mandateCreated: false };
    }

    // Check if politician exists by external ID first
    const existingByExtId = await db.externalId.findFirst({
      where: {
        source: DataSource.GOUVERNEMENT,
        externalId: { startsWith: `gouv-${member.id}-` },
        politician: {
          OR: [
            { slug },
            {
              firstName: { equals: member.prenom, mode: "insensitive" },
              lastName: { equals: member.nom, mode: "insensitive" },
            },
          ],
        },
      },
      include: { politician: { include: { mandates: true } } },
    });

    let existing = existingByExtId?.politician;

    // Fallback: try to find by slug
    if (!existing) {
      existing = await db.politician.findUnique({
        where: { slug },
        include: { mandates: true },
      });
    }

    // Fallback: try by name
    if (!existing) {
      existing = await db.politician.findFirst({
        where: {
          firstName: { equals: member.prenom, mode: "insensitive" },
          lastName: { equals: member.nom, mode: "insensitive" },
        },
        include: { mandates: true },
      });
    }

    const mandateType = getMandateType(member.code_fonction);
    const isCurrent = !endDate;
    const externalId = `gouv-${member.id}-${member.code_fonction}-${startDate.toISOString().split("T")[0]}`;

    // Photo URL from gouvernement.fr (if available)
    // Note: gouvernement.fr doesn't have a reliable photo API, so we'll rely on other sources
    const photoUrl = null;

    const politicianData = {
      slug,
      firstName: member.prenom,
      lastName: member.nom,
      fullName,
    };

    const governmentNameValue = `Gouvernement ${member.gouvernement}`;

    const mandateData = {
      type: mandateType,
      title: sanitizeGovernmentTitle(member.fonction),
      institution: `Gouvernement ${member.gouvernement}`,
      startDate,
      endDate,
      isCurrent,
      source: DataSource.GOUVERNEMENT,
      sourceUrl: "https://www.info.gouv.fr/composition-du-gouvernement",
      officialUrl: "https://www.info.gouv.fr/composition-du-gouvernement",
      externalId,
    };

    let status: "created" | "updated" = "updated";
    let mandateCreated = false;

    if (existing) {
      // Check if this specific mandate already exists (by externalId OR by type+date proximity)
      const existingMandate =
        existing.mandates.find((m) => m.externalId === externalId) ||
        existing.mandates.find((m) => {
          if (m.type !== mandateType) return false;
          const diff = Math.abs(m.startDate.getTime() - startDate.getTime());
          return diff < 3 * 24 * 60 * 60 * 1000; // Within 3 days
        });

      if (!existingMandate) {
        // Create new mandate for existing politician
        await db.mandate.create({
          data: {
            ...mandateData,
            politicianId: existing.id,
            governmentData: { create: { governmentName: governmentNameValue } },
          },
        });
        mandateCreated = true;
      } else {
        // Update existing mandate
        await db.mandate.update({
          where: { id: existingMandate.id },
          data: {
            ...mandateData,
            governmentData: {
              upsert: {
                create: { governmentName: governmentNameValue },
                update: { governmentName: governmentNameValue },
              },
            },
          },
        });
      }

      // Upsert external ID
      await upsertPoliticianExternalId(
        existing.id,
        DataSource.GOUVERNEMENT,
        externalId,
        "https://www.info.gouv.fr/composition-du-gouvernement"
      );
    } else {
      // Create new politician with mandate
      const newPolitician = await db.politician.create({
        data: {
          ...politicianData,
          photoSource: photoUrl ? "gouvernement" : null,
          mandates: {
            create: {
              ...mandateData,
              governmentData: { create: { governmentName: governmentNameValue } },
            },
          },
        },
      });

      await upsertPoliticianExternalId(
        newPolitician.id,
        DataSource.GOUVERNEMENT,
        externalId,
        "https://www.info.gouv.fr/composition-du-gouvernement"
      );
      status = "created";
      mandateCreated = true;
    }

    return { status, mandateCreated };
  } catch (error) {
    console.error(`Error syncing ${member.prenom} ${member.nom}:`, error);
    return { status: "error", mandateCreated: false };
  }
}

/**
 * Main sync function - imports current government members
 */
export async function syncGouvernement(
  options: { currentOnly?: boolean } = {}
): Promise<GouvernementSyncResult> {
  const { currentOnly = true } = options;

  const result: GouvernementSyncResult = {
    success: false,
    membersCreated: 0,
    membersUpdated: 0,
    mandatesCreated: 0,
    errors: [],
  };

  try {
    console.log("Starting government sync...");

    // 1. Fetch all government data
    const allRecords = await fetchGovernmentCSV();

    // 2. Filter to current government if requested
    const records = currentOnly ? getCurrentGovernment(allRecords) : allRecords;

    // 3. Close stale government mandates not in current CSV
    if (currentOnly && records.length > 0) {
      const currentPoliticianSlugs = new Set(
        records.map((r) => generateSlug(`${r.prenom}-${r.nom}`))
      );

      const ministerTypes = [
        MandateType.PREMIER_MINISTRE,
        MandateType.MINISTRE,
        MandateType.MINISTRE_DELEGUE,
        MandateType.SECRETAIRE_ETAT,
      ];

      const staleMandates = await db.mandate.findMany({
        where: {
          type: { in: ministerTypes },
          isCurrent: true,
        },
        include: { politician: { select: { slug: true, fullName: true } } },
      });

      let closedCount = 0;
      for (const mandate of staleMandates) {
        if (!currentPoliticianSlugs.has(mandate.politician.slug)) {
          await db.mandate.update({
            where: { id: mandate.id },
            data: { isCurrent: false, endDate: new Date() },
          });
          closedCount++;
        }
      }

      if (closedCount > 0) {
        console.log(`Closed ${closedCount} stale government mandates`);
      }
    }

    // 4. Sync members
    console.log(`Syncing ${records.length} government members...`);
    for (const member of records) {
      const { status, mandateCreated } = await syncGouvernementMember(member);
      if (status === "created") result.membersCreated++;
      else if (status === "updated") result.membersUpdated++;
      else result.errors.push(`${member.prenom} ${member.nom}`);

      if (mandateCreated) result.mandatesCreated++;
    }

    // 4. Apply local corrections (for data not yet in data.gouv.fr)
    const corrections = await applyLocalCorrections();
    result.membersCreated += corrections.applied;
    result.errors.push(...corrections.errors);

    result.success = true;
    console.log("Sync completed:", result);
  } catch (error) {
    result.errors.push(String(error));
    console.error("Sync failed:", error);
  }

  return result;
}

/**
 * Apply local corrections from JSON file
 */
async function applyLocalCorrections(): Promise<{ applied: number; errors: string[] }> {
  const result = { applied: 0, errors: [] as string[] };

  if (!fs.existsSync(CORRECTIONS_FILE)) {
    console.log("No corrections file found, skipping local corrections");
    return result;
  }

  console.log("\n📝 Applying local corrections...");

  try {
    const correctionsData = fs.readFileSync(CORRECTIONS_FILE, "utf-8");
    const corrections: GovernmentCorrections = JSON.parse(correctionsData);

    // 1. End mandates
    for (const endMandate of corrections.endMandates || []) {
      if (!endMandate.politicianName) continue; // skip comment entries
      try {
        const politician = await db.politician.findFirst({
          where: { fullName: { equals: endMandate.politicianName, mode: "insensitive" } },
        });

        if (politician) {
          const mandateType = endMandate.mandateType as MandateType;
          const updated = await db.mandate.updateMany({
            where: {
              politicianId: politician.id,
              type: mandateType,
              isCurrent: true,
            },
            data: {
              endDate: new Date(endMandate.endDate),
              isCurrent: false,
            },
          });

          if (updated.count > 0) {
            console.log(
              `   ✓ Ended mandate for ${endMandate.politicianName} (${endMandate.mandateType})`
            );
            result.applied++;
          }
        } else {
          result.errors.push(`Politician not found: ${endMandate.politicianName}`);
        }
      } catch (e) {
        result.errors.push(`Error ending mandate for ${endMandate.politicianName}: ${e}`);
      }
    }

    // 2. New members
    for (const newMember of corrections.newMembers || []) {
      if (!newMember.firstName) continue; // skip comment entries
      try {
        const slug = generateSlug(`${newMember.firstName}-${newMember.lastName}`);

        // Find or create politician
        let politician = await db.politician.findUnique({ where: { slug } });

        if (!politician) {
          politician = await db.politician.findFirst({
            where: {
              firstName: { equals: newMember.firstName, mode: "insensitive" },
              lastName: { equals: newMember.lastName, mode: "insensitive" },
            },
          });
        }

        // Find party if specified
        let partyId: string | null = null;
        if (newMember.party) {
          const party = await db.party.findFirst({
            where: {
              OR: [
                { name: { contains: newMember.party, mode: "insensitive" } },
                { shortName: { equals: newMember.party, mode: "insensitive" } },
              ],
            },
          });
          partyId = party?.id || null;
        }

        const mandateType = newMember.mandate.type as MandateType;
        const startDate = new Date(newMember.mandate.startDate);

        if (!politician) {
          // Create new politician
          politician = await db.politician.create({
            data: {
              slug,
              firstName: newMember.firstName,
              lastName: newMember.lastName,
              fullName: newMember.fullName,
              civility: newMember.civility,
              birthDate: newMember.birthDate ? new Date(newMember.birthDate) : null,
            },
          });

          // Set party affiliation via service (creates PartyMembership)
          if (partyId) {
            await politicianService.setCurrentParty(politician.id, partyId);
          }

          console.log(`   ✓ Created politician: ${newMember.fullName}`);
        }

        // Check if mandate already exists
        const existingMandate = await db.mandate.findFirst({
          where: {
            politicianId: politician.id,
            type: mandateType,
            startDate,
          },
        });

        if (!existingMandate) {
          const govName = `Gouvernement ${newMember.mandate.government}`;
          await db.mandate.create({
            data: {
              politicianId: politician.id,
              type: mandateType,
              title: newMember.mandate.title,
              institution: `Gouvernement ${newMember.mandate.government}`,
              startDate,
              isCurrent: true,
              source: DataSource.GOUVERNEMENT,
              sourceUrl: "https://www.info.gouv.fr/composition-du-gouvernement",
              officialUrl: "https://www.info.gouv.fr/composition-du-gouvernement",
              governmentData: { create: { governmentName: govName } },
            },
          });
          console.log(`   ✓ Created mandate: ${newMember.fullName} - ${newMember.mandate.title}`);
          result.applied++;
        } else if (!existingMandate.isCurrent) {
          await db.mandate.update({
            where: { id: existingMandate.id },
            data: { isCurrent: true, endDate: null },
          });
          console.log(`   ✓ Restored mandate: ${newMember.fullName} - ${newMember.mandate.title}`);
          result.applied++;
        } else {
          console.log(`   - Mandate already exists for ${newMember.fullName}`);
        }
      } catch (e) {
        result.errors.push(`Error adding member ${newMember.fullName}: ${e}`);
      }
    }

    // 3. Update members
    for (const updateMember of corrections.updateMembers || []) {
      if (updateMember._disabled) continue;

      try {
        const updated = await db.politician.updateMany({
          where: { fullName: { equals: updateMember.politicianName, mode: "insensitive" } },
          data: updateMember.updates as Record<string, unknown>,
        });

        if (updated.count > 0) {
          console.log(`   ✓ Updated ${updateMember.politicianName}`);
          result.applied++;
        }
      } catch (e) {
        result.errors.push(`Error updating ${updateMember.politicianName}: ${e}`);
      }
    }

    console.log(`\n   Corrections applied: ${result.applied}`);
    if (result.errors.length > 0) {
      console.log(`   Errors: ${result.errors.length}`);
    }
  } catch (e) {
    result.errors.push(`Error reading corrections file: ${e}`);
  }

  return result;
}

/**
 * Get government stats
 */
export async function getGouvernementStats() {
  const ministerTypes = [
    MandateType.PREMIER_MINISTRE,
    MandateType.MINISTRE,
    MandateType.MINISTRE_DELEGUE,
    MandateType.SECRETAIRE_ETAT,
  ];

  const [currentMembers, allMandates] = await Promise.all([
    db.mandate.count({
      where: {
        type: { in: ministerTypes },
        isCurrent: true,
      },
    }),
    db.mandate.count({
      where: {
        type: { in: ministerTypes },
      },
    }),
  ]);

  return {
    currentGovernmentMembers: currentMembers,
    totalGovernmentMandates: allMandates,
  };
}
