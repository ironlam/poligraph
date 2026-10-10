/**
 * CLI script to enrich politician careers from Wikidata
 *
 * Uses Wikidata API to get P39 (position held) for historical mandates.
 * Requires politicians to have Wikidata IDs (run sync-wikidata-ids first).
 *
 * Usage:
 *   npm run sync:careers              # Sync careers for all politicians
 *   npm run sync:careers -- --stats   # Show current stats
 *   npm run sync:careers -- --dry-run # Preview without saving
 *   npm run sync:careers -- --limit=50 # Process only 50 politicians
 *   npm run sync:careers -- --resume  # Resume from last checkpoint
 */

import "dotenv/config";
import {
  createCLI,
  ProgressTracker,
  CheckpointManager,
  type SyncHandler,
  type SyncResult,
} from "../src/lib/sync";
import { WikidataService } from "../src/lib/api";
import { parseDate } from "../src/lib/parsing";
import { db } from "../src/lib/db";
import { MandateType, DataSource, PartyRole } from "../src/generated/prisma";
import { setCurrentParty, setPartyRole } from "../src/services/politician";
import { WIKIDATA_SPARQL_RATE_LIMIT_MS } from "../src/config/rate-limits";
import { isGovernmentFunctionType } from "../src/services/sync/government-sync-guard";
import { isCurrentChair } from "../src/services/sync/careers-chair";

// Mapping from Wikidata position IDs to our MandateType
const POSITION_MAPPING: Record<string, { type: MandateType; institution: string }> = {
  // National level - President & Government
  Q30461: { type: MandateType.PRESIDENT_REPUBLIQUE, institution: "Présidence de la République" },
  Q1587677: { type: MandateType.PREMIER_MINISTRE, institution: "Gouvernement" },
  Q83307: { type: MandateType.MINISTRE, institution: "Gouvernement" },
  Q814694: { type: MandateType.MINISTRE_DELEGUE, institution: "Gouvernement" },
  Q26261727: { type: MandateType.SECRETAIRE_ETAT, institution: "Gouvernement" },

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
  Q27169: { type: MandateType.DEPUTE_EUROPEEN, institution: "Parlement européen" },
  Q2824658: { type: MandateType.DEPUTE_EUROPEEN, institution: "Parlement européen" },

  // Local level
  Q30185: { type: MandateType.MAIRE, institution: "Mairie" },
  Q382617: { type: MandateType.ADJOINT_MAIRE, institution: "Mairie" },
  Q19546: { type: MandateType.PRESIDENT_REGION, institution: "Conseil régional" },
  Q1805817: { type: MandateType.PRESIDENT_DEPARTEMENT, institution: "Conseil départemental" },
  Q1162444: { type: MandateType.CONSEILLER_REGIONAL, institution: "Conseil régional" },
  Q21032554: { type: MandateType.CONSEILLER_DEPARTEMENTAL, institution: "Conseil départemental" },
  Q3780304: { type: MandateType.CONSEILLER_DEPARTEMENTAL, institution: "Conseil général" },
  Q17519573: { type: MandateType.CONSEILLER_MUNICIPAL, institution: "Conseil municipal" },
};

// ============================================================================
// Role positions
// ============================================================================

// Positions that represent ROLES within an existing mandate (not separate mandates)
// When matched, we update the `role` field on an overlapping mandate instead of creating a new one.
const ROLE_POSITIONS: Record<string, { mandateType: MandateType; role: string }> = {
  // Présidence Assemblée nationale
  Q2824697: { mandateType: MandateType.DEPUTE, role: "Président de l'Assemblée nationale" },
  // Présidence Sénat
  Q42512885: { mandateType: MandateType.SENATEUR, role: "Président du Sénat" },
  // Vice-présidences
  Q19600701: { mandateType: MandateType.DEPUTE, role: "Vice-président de l'Assemblée nationale" },
  Q56055912: { mandateType: MandateType.SENATEUR, role: "Vice-président du Sénat" },
};

const handler: SyncHandler = {
  name: "Politic Tracker - Career Sync from Wikidata",
  description: "Enriches politician careers from Wikidata P39",

  options: [
    {
      name: "--resume",
      type: "boolean",
      description: "Resume from last checkpoint",
    },
    {
      name: "--founders-only",
      type: "boolean",
      description: "Only run Phase 3 (founders import from P112)",
    },
  ],

  showHelp() {
    console.log(`
Politic Tracker - Career Sync from Wikidata

Requires: Run sync-wikidata-ids first to associate Wikidata IDs to politicians.
Data source: Wikidata property P39 (position held)

Features:
  - Checkpoint support: use --resume to continue after interruption
  - Uses WikidataService with retry and rate limiting
    `);
  },

  async showStats() {
    const [totalPoliticians, withWikidata, totalMandates, mandatesByType] = await Promise.all([
      db.politician.count(),
      db.externalId.count({
        where: {
          source: DataSource.WIKIDATA,
          politicianId: { not: null },
        },
      }),
      db.mandate.count(),
      db.mandate.groupBy({
        by: ["type"],
        _count: true,
        orderBy: { _count: { type: "desc" } },
      }),
    ]);

    console.log("\n" + "=".repeat(50));
    console.log("Career Sync Stats");
    console.log("=".repeat(50));
    console.log(`Total politicians: ${totalPoliticians}`);
    console.log(
      `With Wikidata ID: ${withWikidata} (${((withWikidata / totalPoliticians) * 100).toFixed(1)}%)`
    );
    console.log(`\nTotal mandates: ${totalMandates}`);
    console.log("\nMandates by type:");
    for (const { type, _count } of mandatesByType) {
      console.log(`  ${type}: ${_count}`);
    }
  },

  async sync(options): Promise<SyncResult> {
    const {
      dryRun = false,
      limit,
      resume = false,
      foundersOnly = false,
    } = options as {
      dryRun?: boolean;
      limit?: number;
      resume?: boolean;
      foundersOnly?: boolean;
    };

    const wikidata = new WikidataService({ rateLimitMs: WIKIDATA_SPARQL_RATE_LIMIT_MS });
    const checkpoint = new CheckpointManager("sync-careers", { autoSaveInterval: 50 });

    const stats = {
      processed: 0,
      mandatesCreated: 0,
      mandatesSkipped: 0,
      governmentFunctionsSkipped: 0,
      partyPresidentsCreated: 0,
      foundersCreated: 0,
    };
    const errors: string[] = [];

    // Skip Phase 1 + 2 if --founders-only
    if (foundersOnly) {
      console.log("Running Phase 3 only (founders import)...\n");
    }

    if (!foundersOnly) {
      // Check for resume
      let startIndex = 0;
      if (resume && checkpoint.canResume()) {
        const resumeData = checkpoint.resume();
        if (resumeData) {
          startIndex = (resumeData.fromIndex ?? 0) + 1;
          stats.processed = resumeData.processedCount;
          console.log(`Resuming from index ${startIndex}\n`);
        }
      } else {
        checkpoint.start();
      }
      console.log("Fetching politicians with Wikidata IDs...");

      const externalIds = await db.externalId.findMany({
        where: {
          source: DataSource.WIKIDATA,
          politicianId: { not: null },
        },
        include: {
          politician: {
            include: {
              mandates: true,
            },
          },
        },
        // Rotation cursor: least-recently-checked first so a bounded (--limit)
        // run eventually covers everyone across successive weekly syncs.
        orderBy: { politician: { careerCheckedAt: { sort: "asc", nulls: "first" } } },
        take: limit,
      });

      console.log(`Found ${externalIds.length} politicians with Wikidata IDs\n`);

      if (externalIds.length === 0) {
        checkpoint.complete();
        return { success: true, duration: 0, stats, errors };
      }

      const progress = new ProgressTracker({
        total: externalIds.length,
        label: "Syncing careers",
        showBar: true,
        showETA: true,
        logInterval: 25,
      });

      // Collect all Wikidata IDs for batch fetching
      const wikidataIds = externalIds
        .slice(startIndex)
        .map((e) => e.externalId)
        .filter(Boolean);

      // Fetch all positions in batch
      console.log("Fetching positions from Wikidata...");
      const positionsMap = await wikidata.getPositions(wikidataIds);
      console.log(`Fetched positions for ${positionsMap.size} entities\n`);

      // Collect all position/location IDs for label fetching
      const labelIds = new Set<string>();
      positionsMap.forEach((positions) => {
        for (const pos of positions) {
          labelIds.add(pos.positionId);
        }
      });

      // Fetch labels
      console.log(`Fetching labels for ${labelIds.size} entities...`);
      const labelsEntities = await wikidata.getEntities(Array.from(labelIds), ["labels"]);
      const labels = new Map<string, string>();
      labelsEntities.forEach((entity, id) => {
        const label = entity.labels.fr || entity.labels.en;
        if (label) labels.set(id, label);
      });
      console.log(`Fetched ${labels.size} labels\n`);

      // Track which politicians we processed so we can stamp their rotation
      // cursor (careerCheckedAt) after the loop.
      const processedPoliticianIds: string[] = [];

      // Process each politician
      for (let i = startIndex; i < externalIds.length; i++) {
        const extId = externalIds[i];
        const politician = extId!.politician;
        if (!politician) {
          progress.tick();
          continue;
        }

        stats.processed++;
        processedPoliticianIds.push(politician.id);

        const positions = positionsMap.get(extId!.externalId) || [];

        for (const pos of positions) {
          const startDate = pos.startDate;
          const endDate = pos.endDate;
          if (!startDate) continue;

          // Check if this is a ROLE position (president/vice-president of chamber)
          const roleInfo = ROLE_POSITIONS[pos.positionId];
          if (roleInfo) {
            // Find an overlapping mandate of the right type to attach the role to
            const overlappingMandate = politician.mandates.find((m) => {
              if (m.type !== roleInfo.mandateType) return false;
              const mStart = new Date(m.startDate);
              const mEnd = m.endDate ? new Date(m.endDate) : new Date();
              // Check date overlap: role period intersects mandate period
              const roleEnd = endDate || new Date();
              return mStart <= roleEnd && mEnd >= startDate;
            });

            if (overlappingMandate) {
              if (dryRun) {
                console.log(
                  `[DRY-RUN] ${politician.fullName} - SET ROLE "${roleInfo.role}" on ${overlappingMandate.type} mandate`
                );
              } else {
                try {
                  await db.mandate.update({
                    where: { id: overlappingMandate.id },
                    data: { role: roleInfo.role },
                  });
                } catch (error) {
                  errors.push(`${politician.fullName} (role update): ${error}`);
                }
              }
              stats.mandatesSkipped++;
            } else {
              // No overlapping mandate found — create a new one with the role
              const positionLabel = labels.get(pos.positionId) || pos.positionId;
              const externalMandateId = `wikidata-${extId!.externalId}-${pos.positionId}-${startDate.toISOString().split("T")[0]}`;

              if (dryRun) {
                console.log(
                  `[DRY-RUN] ${politician.fullName} - CREATE ${positionLabel} with role "${roleInfo.role}" (${startDate.getFullYear()})`
                );
                stats.mandatesCreated++;
              } else {
                try {
                  await db.mandate.create({
                    data: {
                      politicianId: politician.id,
                      type: roleInfo.mandateType,
                      title: positionLabel,
                      institution:
                        roleInfo.mandateType === MandateType.DEPUTE
                          ? "Assemblée nationale"
                          : "Sénat",
                      role: roleInfo.role,
                      source: DataSource.WIKIDATA,
                      startDate,
                      endDate,
                      isCurrent: !endDate,
                      sourceUrl: `https://www.wikidata.org/wiki/${extId!.externalId}`,
                      officialUrl: null,
                      externalId: externalMandateId,
                    },
                  });
                  stats.mandatesCreated++;
                } catch (error) {
                  errors.push(`${politician.fullName}: ${error}`);
                }
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

          // Generate title
          const positionLabel = labels.get(pos.positionId) || pos.positionId;
          const title = positionLabel;

          // Guard: PRESIDENT_REPUBLIQUE and PREMIER_MINISTRE are unique positions
          // Only accept if the Wikidata label explicitly mentions France/République
          if (
            mandateInfo.type === MandateType.PRESIDENT_REPUBLIQUE &&
            !/r[ée]publique|france/i.test(positionLabel)
          ) {
            stats.mandatesSkipped++;
            continue;
          }

          // Check if mandate already exists (within 30 days of start date)
          const existingMandate = politician.mandates.find((m) => {
            if (m.type !== mandateInfo.type) return false;
            if (!m.startDate) return false;
            const existingStart = new Date(m.startDate);
            const diff = Math.abs(existingStart.getTime() - startDate.getTime());
            return diff / (1000 * 60 * 60 * 24) < 30;
          });

          if (existingMandate) {
            stats.mandatesSkipped++;
            continue;
          }

          const externalMandateId = `wikidata-${extId!.externalId}-${pos.positionId}-${startDate.toISOString().split("T")[0]}`;

          if (dryRun) {
            console.log(`[DRY-RUN] ${politician.fullName} - ${title} (${startDate.getFullYear()})`);
            stats.mandatesCreated++;
          } else {
            try {
              await db.mandate.create({
                data: {
                  politicianId: politician.id,
                  type: mandateInfo.type,
                  title,
                  institution: mandateInfo.institution,
                  source: DataSource.WIKIDATA,
                  startDate,
                  endDate,
                  isCurrent: !endDate,
                  sourceUrl: `https://www.wikidata.org/wiki/${extId!.externalId}`,
                  officialUrl: null,
                  externalId: externalMandateId,
                },
              });
              stats.mandatesCreated++;
            } catch (error) {
              errors.push(`${politician.fullName}: ${error}`);
            }
          }
        }

        progress.tick();
        checkpoint.tick(extId!.externalId, i);
      }

      progress.finish();

      // Stamp the rotation cursor for the batch we just processed so the next
      // bounded run advances to the next slice of politicians.
      if (!dryRun && processedPoliticianIds.length > 0) {
        await db.politician.updateMany({
          where: { id: { in: processedPoliticianIds } },
          data: { careerCheckedAt: new Date() },
        });
      }

      checkpoint.complete();
    } // end if (!foundersOnly) — Phase 1

    // ====================================================================
    // Phase 2: Party leaders via P488 (chairperson) on party entities
    // More reliable than P39 — fetches current leader from party entity
    // ====================================================================

    if (!foundersOnly) {
      console.log("\n--- Phase 2: Party leaders (P488) ---");

      const partyExternalIds = await db.externalId.findMany({
        where: {
          source: DataSource.WIKIDATA,
          partyId: { not: null },
        },
        include: {
          party: true,
        },
      });

      if (partyExternalIds.length > 0) {
        const partyWikidataIds = partyExternalIds.map((e) => e.externalId).filter(Boolean);
        console.log(`Fetching P488 for ${partyWikidataIds.length} parties...`);

        const partyEntities = await wikidata.getEntities(partyWikidataIds, ["claims"]);

        // Collect chairperson Q-IDs for label resolution
        const chairpersonIds: string[] = [];
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

          // P488 = chairperson
          const chairClaims = entity.claims["P488"];
          if (!chairClaims) continue;

          for (const claim of chairClaims) {
            const val = claim.mainsnak?.datavalue?.value;
            if (!val || typeof val !== "object" || !("id" in val)) continue;

            // Only current chairperson (no end date qualifier)
            const endQual = claim.qualifiers?.["P582"];
            if (endQual && endQual.length > 0) continue; // Has end date = past leader

            // Extract start date from P580 qualifier
            let startDate: Date | null = null;
            const startQual = claim.qualifiers?.["P580"];
            if (startQual?.[0]?.datavalue?.value) {
              const timeValue = startQual[0].datavalue.value;
              if (typeof timeValue === "object" && "time" in timeValue) {
                const parsed = parseDate((timeValue as { time: string }).time);
                if (parsed) startDate = parsed;
              }
            }

            chairpersonIds.push(val.id as string);
            chairpersonData.push({
              partyName: ext.party.name,
              partyId: ext.party.id,
              partyWikidataId: ext.externalId,
              chairpersonWikidataId: val.id as string,
              startDate,
              partyDissolvedDate: ext.party.dissolvedDate ?? null,
              partyWebsite: ext.party.website || null,
            });
          }
        }

        if (chairpersonData.length > 0) {
          // Resolve chairperson labels
          const chairLabels = await wikidata.getEntities(chairpersonIds, ["labels"]);

          for (const data of chairpersonData) {
            const chairLabel =
              chairLabels.get(data.chairpersonWikidataId)?.labels?.fr ||
              chairLabels.get(data.chairpersonWikidataId)?.labels?.en ||
              data.chairpersonWikidataId;

            // Find this politician in our database by Wikidata ID
            const politicianExt = await db.externalId.findFirst({
              where: {
                source: DataSource.WIKIDATA,
                externalId: data.chairpersonWikidataId,
                politicianId: { not: null },
              },
              include: { politician: { select: { deathDate: true } } },
            });

            if (!politicianExt?.politicianId) {
              if (dryRun) {
                console.log(
                  `[DRY-RUN] ${chairLabel} - PRESIDENT_PARTI @ ${data.partyName} (politician not in DB)`
                );
              }
              continue;
            }

            // Same rule as the service (#1001): no undated leadership, no dissolved party, no
            // dead politician. This CLI is what the weekly workflow runs.
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

            // Check if mandate already exists
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

            if (dryRun) {
              console.log(`[DRY-RUN] ${chairLabel} - PRESIDENT_PARTI @ ${data.partyName}`);
              stats.mandatesCreated++;
              stats.partyPresidentsCreated++;
            } else {
              try {
                // Check by externalId to avoid duplicates on re-run
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
                // Also set current party affiliation (idempotent)
                await setCurrentParty(politicianExt.politicianId, data.partyId, {
                  startDate: chairStart,
                });
                stats.mandatesCreated++;
                stats.partyPresidentsCreated++;
              } catch (error) {
                errors.push(`Party leader ${chairLabel} @ ${data.partyName}: ${error}`);
              }
            }
          }
        }

        console.log(`Party leaders: ${stats.partyPresidentsCreated} created`);
      }
    } // end if (!foundersOnly) — Phase 2

    // ====================================================================
    // Phase 3: Party founders via P112 (founded by) on party entities
    // Sets PartyRole.FONDATEUR on matching PartyMembership records
    // ====================================================================

    console.log("\n--- Phase 3: Party founders (P112) ---");

    const founderPartyExternalIds = await db.externalId.findMany({
      where: {
        source: DataSource.WIKIDATA,
        partyId: { not: null },
      },
      include: {
        party: true,
      },
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

        // P112 = founded by
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
        // Resolve founder Wikidata IDs to our politicians
        const founderWikidataIds = [...new Set(founderData.map((d) => d.founderWikidataId))];
        const founderLabels = await wikidata.getEntities(founderWikidataIds, ["labels"]);

        for (const data of founderData) {
          const founderLabel =
            founderLabels.get(data.founderWikidataId)?.labels?.fr ||
            founderLabels.get(data.founderWikidataId)?.labels?.en ||
            data.founderWikidataId;

          // Find politician in our DB by Wikidata ID
          const politicianExt = await db.externalId.findFirst({
            where: {
              source: DataSource.WIKIDATA,
              externalId: data.founderWikidataId,
              politicianId: { not: null },
            },
          });

          if (!politicianExt?.politicianId) {
            if (dryRun) {
              console.log(
                `[DRY-RUN] ${founderLabel} - FONDATEUR @ ${data.partyName} (politician not in DB)`
              );
            }
            continue;
          }

          if (dryRun) {
            console.log(`[DRY-RUN] ${founderLabel} - FONDATEUR @ ${data.partyName}`);
            stats.foundersCreated++;
          } else {
            try {
              await setPartyRole(politicianExt.politicianId, data.partyId, PartyRole.FONDATEUR);
              stats.foundersCreated++;
            } catch (error) {
              errors.push(`Fondateur ${founderLabel} @ ${data.partyName}: ${error}`);
            }
          }

          // Rate limiting
          await new Promise((r) => setTimeout(r, WIKIDATA_SPARQL_RATE_LIMIT_MS));
        }
      }

      console.log(`Founders: ${stats.foundersCreated} created`);
    }

    return {
      success: errors.length === 0,
      duration: 0,
      stats,
      errors,
    };
  },
};

createCLI(handler);
