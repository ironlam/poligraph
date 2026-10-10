/**
 * Service to enrich politician careers from Wikidata.
 * 3 phases: P39 positions, P488 chairpersons, P112 founders.
 * Extracted from scripts/sync-careers.ts for Inngest compatibility.
 *
 * NOTE: CheckpointManager and resume logic are CLI-only concerns.
 */

import { WikidataService } from "@/lib/api";
import { parseDate } from "@/lib/parsing";
import { db } from "@/lib/db";
import { MandateType, DataSource, PartyRole } from "@/generated/prisma";
import { setCurrentParty, setPartyRole } from "@/services/politician";
import { isCurrentChair } from "./careers-chair";
import { WIKIDATA_SPARQL_RATE_LIMIT_MS } from "@/config/rate-limits";
import { isDuplicateMandateCandidate } from "./careers-dedup";
import { isGovernmentFunctionType } from "./government-sync-guard";

export interface CareersSyncResult {
  processed: number;
  mandatesCreated: number;
  mandatesSkipped: number;
  governmentFunctionsSkipped: number;
  partyPresidentsCreated: number;
  foundersCreated: number;
  errors: string[];
}

// Mapping from Wikidata position IDs to our MandateType
const POSITION_MAPPING: Record<string, { type: MandateType; institution: string }> = {
  // National level - President & Government
  Q30461: {
    type: MandateType.PRESIDENT_REPUBLIQUE,
    institution: "Présidence de la République",
  },
  Q1587677: { type: MandateType.PREMIER_MINISTRE, institution: "Gouvernement" },
  Q83307: { type: MandateType.MINISTRE, institution: "Gouvernement" },
  Q814694: { type: MandateType.MINISTRE_DELEGUE, institution: "Gouvernement" },
  Q26261727: {
    type: MandateType.SECRETAIRE_ETAT,
    institution: "Gouvernement",
  },

  // Deputies
  Q3044918: { type: MandateType.DEPUTE, institution: "Assemblée nationale" },
  Q21032547: { type: MandateType.DEPUTE, institution: "Assemblée nationale" },
  Q18941264: { type: MandateType.DEPUTE, institution: "Assemblée nationale" },
  Q55648587: { type: MandateType.DEPUTE, institution: "Assemblée nationale" },
  Q104728949: { type: MandateType.DEPUTE, institution: "Assemblée nationale" },

  // Senators
  Q3044923: { type: MandateType.SENATEUR, institution: "Sénat" },
  Q18558628: { type: MandateType.SENATEUR, institution: "Sénat" },
  Q14828018: { type: MandateType.SENATEUR, institution: "Sénat" },

  // European Parliament
  Q27169: {
    type: MandateType.DEPUTE_EUROPEEN,
    institution: "Parlement européen",
  },
  Q2824658: {
    type: MandateType.DEPUTE_EUROPEEN,
    institution: "Parlement européen",
  },

  // Local level
  Q30185: { type: MandateType.MAIRE, institution: "Mairie" },
  Q382617: { type: MandateType.ADJOINT_MAIRE, institution: "Mairie" },
  Q19546: {
    type: MandateType.PRESIDENT_REGION,
    institution: "Conseil régional",
  },
  Q1805817: {
    type: MandateType.PRESIDENT_DEPARTEMENT,
    institution: "Conseil départemental",
  },
  Q1162444: {
    type: MandateType.CONSEILLER_REGIONAL,
    institution: "Conseil régional",
  },
  Q21032554: {
    type: MandateType.CONSEILLER_DEPARTEMENTAL,
    institution: "Conseil départemental",
  },
  Q3780304: {
    type: MandateType.CONSEILLER_DEPARTEMENTAL,
    institution: "Conseil général",
  },
  Q17519573: {
    type: MandateType.CONSEILLER_MUNICIPAL,
    institution: "Conseil municipal",
  },
};

// Role positions (president/VP of chamber) — update role on existing mandate
const ROLE_POSITIONS: Record<string, { mandateType: MandateType; role: string }> = {
  Q20968036: {
    mandateType: MandateType.DEPUTE,
    role: "Président de l'Assemblée nationale",
  },
  Q3409222: {
    mandateType: MandateType.SENATEUR,
    role: "Président du Sénat",
  },
  Q19955577: {
    mandateType: MandateType.DEPUTE,
    role: "Vice-président de l'Assemblée nationale",
  },
  Q87432400: {
    mandateType: MandateType.SENATEUR,
    role: "Vice-président du Sénat",
  },
};

export async function syncCareers(options?: {
  limit?: number;
  foundersOnly?: boolean;
}): Promise<CareersSyncResult> {
  const { limit, foundersOnly = false } = options ?? {};

  const wikidata = new WikidataService({
    rateLimitMs: WIKIDATA_SPARQL_RATE_LIMIT_MS,
  });

  const stats: CareersSyncResult = {
    processed: 0,
    mandatesCreated: 0,
    mandatesSkipped: 0,
    governmentFunctionsSkipped: 0,
    partyPresidentsCreated: 0,
    foundersCreated: 0,
    errors: [],
  };

  // ========================================
  // Phase 1: P39 positions
  // ========================================
  if (!foundersOnly) {
    console.log("--- Phase 1: P39 positions ---");
    console.log("Fetching politicians with Wikidata IDs...");

    const externalIds = await db.externalId.findMany({
      where: {
        source: DataSource.WIKIDATA,
        politicianId: { not: null },
      },
      include: {
        politician: {
          include: { mandates: true },
        },
      },
      take: limit,
    });

    console.log(`Found ${externalIds.length} politicians with Wikidata IDs`);

    if (externalIds.length === 0) {
      return stats;
    }

    const wikidataIds = externalIds.map((e) => e.externalId).filter(Boolean);

    console.log("Fetching positions from Wikidata...");
    const positionsMap = await wikidata.getPositions(wikidataIds);
    console.log(`Fetched positions for ${positionsMap.size} entities`);

    // Collect position IDs for label fetching
    const labelIds = new Set<string>();
    positionsMap.forEach((positions) => {
      for (const pos of positions) {
        labelIds.add(pos.positionId);
      }
    });

    console.log(`Fetching labels for ${labelIds.size} entities...`);
    const labelsEntities = await wikidata.getEntities(Array.from(labelIds), ["labels"]);
    const labels = new Map<string, string>();
    labelsEntities.forEach((entity, id) => {
      const label = entity.labels.fr || entity.labels.en;
      if (label) labels.set(id, label);
    });

    for (const extId of externalIds) {
      const politician = extId.politician;
      if (!politician) continue;

      stats.processed++;

      const positions = positionsMap.get(extId.externalId) || [];

      for (const pos of positions) {
        const startDate = pos.startDate;
        const endDate = pos.endDate;
        if (!startDate) continue;

        // Check if this is a ROLE position
        const roleInfo = ROLE_POSITIONS[pos.positionId];
        if (roleInfo) {
          // Find ALL overlapping mandates (a presidency can span multiple legislatures)
          const overlappingMandates = politician.mandates.filter((m) => {
            if (m.type !== roleInfo.mandateType) return false;
            const mStart = new Date(m.startDate);
            const mEnd = m.endDate ? new Date(m.endDate) : new Date();
            const roleEnd = endDate || new Date();
            return mStart <= roleEnd && mEnd >= startDate;
          });

          if (overlappingMandates.length > 0) {
            for (const mandate of overlappingMandates) {
              try {
                await db.mandate.update({
                  where: { id: mandate.id },
                  data: { role: roleInfo.role },
                });
              } catch (error) {
                stats.errors.push(`${politician.fullName} (role update): ${error}`);
              }
              stats.mandatesSkipped++;
            }
          } else {
            const positionLabel = labels.get(pos.positionId) || pos.positionId;
            const externalMandateId = `wikidata-${extId.externalId}-${pos.positionId}-${startDate.toISOString().split("T")[0]}`;

            try {
              await db.mandate.create({
                data: {
                  politicianId: politician.id,
                  type: roleInfo.mandateType,
                  title: positionLabel,
                  institution:
                    roleInfo.mandateType === MandateType.DEPUTE ? "Assemblée nationale" : "Sénat",
                  role: roleInfo.role,
                  source: DataSource.WIKIDATA,
                  startDate,
                  endDate,
                  isCurrent: !endDate,
                  sourceUrl: `https://www.wikidata.org/wiki/${extId.externalId}`,
                  officialUrl: null,
                  externalId: externalMandateId,
                },
              });
              stats.mandatesCreated++;
            } catch (error) {
              stats.errors.push(`${politician.fullName}: ${error}`);
            }
          }
          continue;
        }

        // Regular mandate position
        const mandateInfo = POSITION_MAPPING[pos.positionId];
        if (!mandateInfo) continue;

        // Exclusion permanente : les fonctions gouvernementales relèvent du workflow par actes
        if (isGovernmentFunctionType(mandateInfo.type)) {
          stats.governmentFunctionsSkipped++;
          continue;
        }

        const positionLabel = labels.get(pos.positionId) || pos.positionId;

        // Guard: PRESIDENT_REPUBLIQUE must mention France
        if (
          mandateInfo.type === MandateType.PRESIDENT_REPUBLIQUE &&
          !/r[ée]publique|france/i.test(positionLabel)
        ) {
          stats.mandatesSkipped++;
          continue;
        }

        // Skip if this candidate duplicates an existing mandate (see
        // careers-dedup.ts). For DEPUTE/SENATEUR a politician can hold only one
        // active mandate of a given type; other types use a 30-day tolerance.
        if (
          isDuplicateMandateCandidate(politician.mandates, {
            type: mandateInfo.type,
            startDate,
            isCurrent: !endDate,
          })
        ) {
          stats.mandatesSkipped++;
          continue;
        }

        const externalMandateId = `wikidata-${extId.externalId}-${pos.positionId}-${startDate.toISOString().split("T")[0]}`;

        try {
          await db.mandate.create({
            data: {
              politicianId: politician.id,
              type: mandateInfo.type,
              title: positionLabel,
              institution: mandateInfo.institution,
              source: DataSource.WIKIDATA,
              startDate,
              endDate,
              isCurrent: !endDate,
              sourceUrl: `https://www.wikidata.org/wiki/${extId.externalId}`,
              officialUrl: null,
              externalId: externalMandateId,
            },
          });
          stats.mandatesCreated++;
        } catch (error) {
          stats.errors.push(`${politician.fullName}: ${error}`);
        }
      }
    }

    if (stats.governmentFunctionsSkipped > 0) {
      console.log(
        `Gel gouvernement : ${stats.governmentFunctionsSkipped} fonction(s) gouvernementale(s) ignorée(s)`
      );
    }

    // ========================================
    // Phase 2: Party leaders via P488
    // ========================================
    console.log("\n--- Phase 2: Party leaders (P488) ---");

    const partyExternalIds = await db.externalId.findMany({
      where: {
        source: DataSource.WIKIDATA,
        partyId: { not: null },
      },
      include: { party: true },
    });

    if (partyExternalIds.length > 0) {
      const partyWikidataIds = partyExternalIds.map((e) => e.externalId).filter(Boolean);
      console.log(`Fetching P488 for ${partyWikidataIds.length} parties...`);

      const partyEntities = await wikidata.getEntities(partyWikidataIds, ["claims"]);

      const chairpersonData: Array<{
        partyName: string;
        partyId: string;
        partyWikidataId: string;
        chairpersonWikidataId: string;
        startDate: Date | null;
        partyDissolvedDate: Date | null;
        partyWebsite: string | null;
      }> = [];

      for (const ext of partyExternalIds) {
        if (!ext.party) continue;
        const entity = partyEntities.get(ext.externalId);
        if (!entity) continue;

        const chairClaims = entity.claims["P488"];
        if (!chairClaims) continue;

        for (const claim of chairClaims) {
          const val = claim.mainsnak?.datavalue?.value;
          if (!val || typeof val !== "object" || !("id" in val)) continue;

          const endQual = claim.qualifiers?.["P582"];
          if (endQual && endQual.length > 0) continue;

          let chairStartDate: Date | null = null;
          const startQual = claim.qualifiers?.["P580"];
          if (startQual?.[0]?.datavalue?.value) {
            const timeValue = startQual[0].datavalue.value;
            if (typeof timeValue === "object" && "time" in timeValue) {
              const parsed = parseDate((timeValue as { time: string }).time);
              if (parsed) chairStartDate = parsed;
            }
          }

          chairpersonData.push({
            partyName: ext.party.name,
            partyId: ext.party.id,
            partyWikidataId: ext.externalId,
            chairpersonWikidataId: val.id as string,
            startDate: chairStartDate,
            partyDissolvedDate: ext.party.dissolvedDate ?? null,
            partyWebsite: ext.party.website || null,
          });
        }
      }

      if (chairpersonData.length > 0) {
        const chairpersonIds = chairpersonData.map((d) => d.chairpersonWikidataId);
        const chairLabels = await wikidata.getEntities(chairpersonIds, ["labels"]);

        for (const data of chairpersonData) {
          const chairLabel =
            chairLabels.get(data.chairpersonWikidataId)?.labels?.fr ||
            chairLabels.get(data.chairpersonWikidataId)?.labels?.en ||
            data.chairpersonWikidataId;

          const politicianExt = await db.externalId.findFirst({
            where: {
              source: DataSource.WIKIDATA,
              externalId: data.chairpersonWikidataId,
              politicianId: { not: null },
            },
            include: { politician: { select: { deathDate: true } } },
          });

          if (!politicianExt?.politicianId) continue;

          if (
            !isCurrentChair({
              startDate: data.startDate,
              partyDissolvedDate: data.partyDissolvedDate,
              politicianDeathDate: politicianExt.politician?.deathDate ?? null,
            })
          ) {
            stats.mandatesSkipped++;
            continue;
          }
          const chairStart = data.startDate!;

          // Never overwrite manual entries
          const manualEntry = await db.mandate.findFirst({
            where: {
              politicianId: politicianExt.politicianId,
              type: MandateType.PRESIDENT_PARTI,
              partyId: data.partyId,
              source: "MANUAL",
            },
          });
          if (manualEntry) {
            stats.mandatesSkipped++;
            continue;
          }

          const existing = await db.mandate.findFirst({
            where: {
              politicianId: politicianExt.politicianId,
              type: MandateType.PRESIDENT_PARTI,
              institution: data.partyName,
              isCurrent: true,
            },
          });

          if (existing) {
            stats.mandatesSkipped++;
            continue;
          }

          const externalMandateId = `wikidata-p488-${data.partyWikidataId}-${data.chairpersonWikidataId}`;

          try {
            const existingByExtId = await db.mandate.findFirst({
              where: { externalId: externalMandateId },
            });
            if (existingByExtId) {
              stats.mandatesSkipped++;
              continue;
            }
            await db.mandate.create({
              data: {
                politicianId: politicianExt.politicianId,
                type: MandateType.PRESIDENT_PARTI,
                title: `Dirigeant(e) - ${data.partyName}`,
                institution: data.partyName,
                partyId: data.partyId,
                source: DataSource.WIKIDATA,
                startDate: chairStart,
                isCurrent: true,
                sourceUrl: `https://www.wikidata.org/wiki/${data.partyWikidataId}`,
                officialUrl: data.partyWebsite || null,
                externalId: externalMandateId,
              },
            });
            await setCurrentParty(politicianExt.politicianId, data.partyId, {
              startDate: chairStart,
            });
            stats.mandatesCreated++;
            stats.partyPresidentsCreated++;
          } catch (error) {
            stats.errors.push(`Party leader ${chairLabel} @ ${data.partyName}: ${error}`);
          }
        }
      }

      console.log(`Party leaders: ${stats.partyPresidentsCreated} created`);
    }
  }

  // ========================================
  // Phase 3: Party founders via P112
  // ========================================
  console.log("\n--- Phase 3: Party founders (P112) ---");

  const founderPartyExternalIds = await db.externalId.findMany({
    where: {
      source: DataSource.WIKIDATA,
      partyId: { not: null },
    },
    include: { party: true },
  });

  if (founderPartyExternalIds.length > 0) {
    const founderPartyWikidataIds = founderPartyExternalIds
      .map((e) => e.externalId)
      .filter(Boolean);
    console.log(`Fetching P112 for ${founderPartyWikidataIds.length} parties...`);

    const founderPartyEntities = await wikidata.getEntities(founderPartyWikidataIds, ["claims"]);

    const founderData: Array<{
      partyName: string;
      partyId: string;
      founderWikidataId: string;
    }> = [];

    for (const ext of founderPartyExternalIds) {
      if (!ext.party) continue;
      const entity = founderPartyEntities.get(ext.externalId);
      if (!entity) continue;

      const founderClaims = entity.claims["P112"];
      if (!founderClaims) continue;

      for (const claim of founderClaims) {
        const val = claim.mainsnak?.datavalue?.value;
        if (!val || typeof val !== "object" || !("id" in val)) continue;

        founderData.push({
          partyName: ext.party.name,
          partyId: ext.party.id,
          founderWikidataId: val.id as string,
        });
      }
    }

    console.log(`Found ${founderData.length} founder claims`);

    if (founderData.length > 0) {
      for (const data of founderData) {
        const politicianExt = await db.externalId.findFirst({
          where: {
            source: DataSource.WIKIDATA,
            externalId: data.founderWikidataId,
            politicianId: { not: null },
          },
        });

        if (!politicianExt?.politicianId) continue;

        try {
          await setPartyRole(politicianExt.politicianId, data.partyId, PartyRole.FONDATEUR);
          stats.foundersCreated++;
        } catch (error) {
          stats.errors.push(`Founder @ ${data.partyName}: ${error}`);
        }

        // Rate limiting
        await new Promise((r) => setTimeout(r, WIKIDATA_SPARQL_RATE_LIMIT_MS));
      }
    }

    console.log(`Founders: ${stats.foundersCreated} created`);
  }

  return stats;
}
