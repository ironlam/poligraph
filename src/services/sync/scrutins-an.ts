/**
 * Votes AN sync service
 *
 * Imports scrutins and individual votes from data.assemblee-nationale.fr (official Open Data).
 * Downloads a ZIP file containing JSON scrutins, parses them,
 * and upserts Scrutin + Vote records.
 */

import { db } from "@/lib/db";
import { syncMetadata, hashFile, hashVotes, ProgressTracker } from "@/lib/sync";
import { computeGroupPositionsForScrutin } from "@/services/sync/compute-group-positions";
import { writeVotesForScrutin } from "@/services/sync/scrutins-vote-writer";
import { generateDateSlug, generateUniqueSlug } from "@/lib/utils";
import { VotePosition, VotingResult, DataSource } from "@/generated/prisma";
import { classifyScrutinTitle } from "@/lib/scrutin-type";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { createWriteStream, mkdirSync, rmSync, readdirSync, readFileSync } from "fs";
import { extractZip } from "@/lib/parsing/unzip";
import { safeJsonParseOrThrow } from "@/lib/api/safe-json";
import { createHash } from "crypto";
import {
  hashOfficialGroupSnapshot,
  parseOfficialGroupCountsDetailed,
} from "@/lib/scrutins/official-group-counts";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const LEGISLATURE = 17;
const TEMP_DIR = "/tmp/scrutins-an";
const ZIP_URL_TEMPLATE =
  "https://data.assemblee-nationale.fr/static/openData/repository/{leg}/loi/scrutins/Scrutins.json.zip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DownloadResult {
  notModified: boolean;
  etag?: string;
}

interface ANScrutin {
  scrutin: {
    uid: string;
    numero: string;
    legislature: string;
    dateScrutin: string;
    titre: string;
    typeVote?: {
      codeTypeVote?: string;
      libelleTypeVote?: string;
    } | null;
    sort: {
      code: string;
      libelle: string;
    };
    syntheseVote: {
      nombreVotants: string;
      suffragesExprimes: string;
      decompte: {
        pour: string;
        contre: string;
        abstentions: string;
        nonVotants: string;
      };
    };
    ventilationVotes: {
      organe: {
        groupes: {
          groupe: ANGroupeVote[];
        };
      };
    };
  };
}

interface ANGroupeVote {
  organeRef: string;
  nombreMembresGroupe: string;
  vote: {
    positionMajoritaire?: string;
    decompteVoix?: {
      pour?: string | number | null;
      contre?: string | number | null;
      abstentions?: string | number | null;
      nonVotants?: string | number | null;
      nonVotantsVolontaires?: string | number | null;
    } | null;
    decompteNominatif: {
      pours?: { votant: ANVotant | ANVotant[] } | null;
      contres?: { votant: ANVotant | ANVotant[] } | null;
      abstentions?: { votant: ANVotant | ANVotant[] } | null;
      nonVotants?: { votant: ANVotant | ANVotant[] } | null;
    };
  };
}

interface ANVotant {
  acteurRef: string;
  mandatRef: string;
}

export interface ScrutinsANSyncStats {
  scrutinsProcessed: number;
  scrutinsCreated: number;
  scrutinsUpdated: number;
  scrutinsSkipped: number;
  votesCreated: number;
  votesSkipped: number;
  errors: string[];
  politiciansNotFound: Set<string>;
}

export interface OfficialGroupSnapshotRow {
  sourceIndex: number;
  organeRef: string | null;
  memberCount: number | null;
  forCount: number | null;
  againstCount: number | null;
  abstainCount: number | null;
  nonVoterCount: number | null;
  voluntaryNonVoterCount: number | null;
  majorityPosition: string | null;
  issues: string[];
}

export interface OfficialGroupSnapshot {
  hash: string;
  sourceHash: string;
  sourceUrl: string;
  fetchedAt: Date;
  rows: OfficialGroupSnapshotRow[];
  issues: string[];
}

interface OfficialVoteMetadata {
  codeTypeVote: string | null;
  libelleTypeVote: string | null;
}

interface ExistingOfficialGroupSnapshot {
  id: string;
  officialGroupsHash: string | null;
  officialGroupsSourceHash: string | null;
  officialGroupsSourceUrl: string | null;
  codeTypeVote: string | null;
  libelleTypeVote: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Download a file from URL with optional ETag for conditional requests.
 * Streaming binary download — does not use HTTPClient.
 */
function downloadFile(url: string, dest: string, etag?: string | null): Promise<DownloadResult> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const headers: Record<string, string> = {};
    if (etag) {
      headers["If-None-Match"] = etag;
    }
    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers,
    };

    https
      .get(options, (response) => {
        if (response.statusCode === 304) {
          resolve({ notModified: true, etag: etag || undefined });
          return;
        }
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            downloadFile(redirectUrl, dest, etag).then(resolve).catch(reject);
            return;
          }
        }
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          return;
        }
        const file = createWriteStream(dest);
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve({
            notModified: false,
            etag: response.headers.etag || undefined,
          });
        });
      })
      .on("error", (err) => {
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
  });
}

/**
 * Extract individual votes from AN scrutin JSON format
 */
function extractVotes(scrutin: ANScrutin): Array<{ acteurRef: string; position: VotePosition }> {
  const votes: Array<{ acteurRef: string; position: VotePosition }> = [];

  const groupes = scrutin.scrutin.ventilationVotes?.organe?.groupes?.groupe;
  if (!groupes) return votes;

  for (const groupe of groupes) {
    const decompte = groupe.vote?.decompteNominatif;
    if (!decompte) continue;

    const extractVotants = (
      data: { votant: ANVotant | ANVotant[] } | null | undefined,
      position: VotePosition
    ) => {
      if (!data?.votant) return;
      const votants = Array.isArray(data.votant) ? data.votant : [data.votant];
      for (const v of votants) {
        if (v.acteurRef) {
          votes.push({ acteurRef: v.acteurRef, position });
        }
      }
    };

    extractVotants(decompte.pours, "POUR");
    extractVotants(decompte.contres, "CONTRE");
    extractVotants(decompte.abstentions, "ABSTENTION");
    extractVotants(decompte.nonVotants, "NON_VOTANT");
  }

  return votes;
}

/**
 * Build map of AN acteur ID -> politician ID
 */
async function buildActeurToIdMap(): Promise<Map<string, string>> {
  const externalIds = await db.externalId.findMany({
    where: {
      source: DataSource.ASSEMBLEE_NATIONALE,
      politicianId: { not: null },
    },
    select: { externalId: true, politicianId: true },
  });

  const map = new Map<string, string>();
  for (const ext of externalIds) {
    if (ext.politicianId) {
      map.set(ext.externalId, ext.politicianId);
    }
  }

  return map;
}

/**
 * Parse voting result code
 */
function parseVotingResult(code: string): VotingResult {
  return code.toLowerCase().includes("adopt") ? "ADOPTED" : "REJECTED";
}

/**
 * Generate a unique slug for an AN scrutin
 */
async function generateUniqueScrutinSlug(date: Date, title: string): Promise<string> {
  const baseSlug = generateDateSlug(date, title);
  return generateUniqueSlug(baseSlug, (s) =>
    db.scrutin.findUnique({ where: { slug: s } }).then(Boolean)
  );
}

/**
 * Build the independent official group snapshot for one raw AN scrutin.
 *
 * `sourceHash` is the hash of the raw JSON file, while `hash` is a stable hash
 * of the parsed official section. Keeping both lets the importer detect a
 * source change without coupling it to the nominative `votesHash`.
 */
export function buildOfficialGroupSnapshot(
  rawScrutin: unknown,
  sourceHash: string,
  sourceUrl: string,
  fetchedAt: Date
): OfficialGroupSnapshot {
  const parsed = parseOfficialGroupCountsDetailed(rawScrutin);
  const issues = [...parsed.issues];
  const rows: OfficialGroupSnapshotRow[] = [];

  for (const count of parsed.counts) {
    rows.push({
      sourceIndex: count.sourceIndex,
      organeRef: count.organeRef,
      memberCount: count.memberCount,
      forCount: count.forCount,
      againstCount: count.againstCount,
      abstainCount: count.abstainCount,
      nonVoterCount: count.nonVoterCount,
      voluntaryNonVoterCount: count.voluntaryNonVoterCount,
      majorityPosition: count.majorityPosition,
      issues: [...count.issues],
    });
  }

  return {
    hash: hashOfficialGroupSnapshot(parsed.counts, issues),
    sourceHash,
    sourceUrl,
    fetchedAt,
    rows,
    issues,
  };
}

/**
 * Replace an official group snapshot only when its parsed hash changed.
 * Children and the scrutin-level provenance are updated in one transaction so
 * a public reader cannot observe half of a new official snapshot.
 */
async function persistOfficialGroupSnapshot(
  existing: ExistingOfficialGroupSnapshot,
  snapshot: OfficialGroupSnapshot,
  metadata: OfficialVoteMetadata,
  force: boolean
): Promise<boolean> {
  const countsChanged = force || existing.officialGroupsHash !== snapshot.hash;
  const sourceChanged =
    existing.officialGroupsSourceHash !== snapshot.sourceHash ||
    existing.officialGroupsSourceUrl !== snapshot.sourceUrl;
  const metadataChanged =
    existing.codeTypeVote !== metadata.codeTypeVote ||
    existing.libelleTypeVote !== metadata.libelleTypeVote;
  if (!countsChanged && !sourceChanged && !metadataChanged) return false;

  await db.$transaction(async (tx) => {
    if (countsChanged) {
      await tx.scrutinOfficialGroupCount.deleteMany({ where: { scrutinId: existing.id } });
      if (snapshot.rows.length > 0) {
        await tx.scrutinOfficialGroupCount.createMany({
          data: snapshot.rows.map((row) => ({ scrutinId: existing.id, ...row })),
        });
      }
    }
    await tx.scrutin.update({
      where: { id: existing.id },
      data: {
        ...metadata,
        ...(countsChanged || sourceChanged
          ? {
              officialGroupsHash: snapshot.hash,
              officialGroupsSourceHash: snapshot.sourceHash,
              officialGroupsSourceUrl: snapshot.sourceUrl,
              officialGroupsSourceFetchedAt: snapshot.fetchedAt,
              officialGroupsIssues: snapshot.issues,
            }
          : {}),
      },
    });
  });

  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sync votes from Assemblée nationale
 */
export async function syncScrutinsAN(
  legislature: number = LEGISLATURE,
  dryRun: boolean = false,
  todayOnly: boolean = false,
  force: boolean = false,
  officialGroupsOnly: boolean = false
): Promise<ScrutinsANSyncStats> {
  const stats: ScrutinsANSyncStats = {
    scrutinsProcessed: 0,
    scrutinsCreated: 0,
    scrutinsUpdated: 0,
    scrutinsSkipped: 0,
    votesCreated: 0,
    votesSkipped: 0,
    errors: [],
    politiciansNotFound: new Set<string>(),
  };

  // Keep the additive metadata backfill independent from the regular vote
  // archive state. Marking the latter from this mode could make a subsequent
  // normal sync skip new nominative votes.
  const SOURCE_KEY = officialGroupsOnly
    ? `official-groups-an-zip:${legislature}`
    : `votes-an-zip:${legislature}`;

  try {
    // Step 1: Download ZIP (with ETag for conditional download)
    console.log("Downloading scrutins ZIP from data.assemblee-nationale.fr...");
    const zipUrl = ZIP_URL_TEMPLATE.replace("{leg}", String(legislature));
    const zipPath = path.join(TEMP_DIR, "scrutins.zip");

    // Clean and create temp dir
    if (fs.existsSync(TEMP_DIR)) {
      rmSync(TEMP_DIR, { recursive: true });
    }
    mkdirSync(TEMP_DIR, { recursive: true });

    // Check ETag from previous sync
    // The separate metadata-only source key prevents it from inheriting the
    // regular vote sync's ETag/hash state. `--force` remains available when an
    // already completed backfill must be replayed for newly imported rows.
    // The operator-only metadata mode always reads the archive: a prior run
    // may have filled the archive cache while some database rows were absent.
    const bypassArchiveCache = force || officialGroupsOnly;
    const prevState = bypassArchiveCache ? null : await syncMetadata.get(SOURCE_KEY);
    const downloadResult = await downloadFile(
      zipUrl,
      zipPath,
      bypassArchiveCache ? null : prevState?.etag
    );

    if (downloadResult.notModified) {
      console.log("✓ ZIP not modified (HTTP 304), skipping sync");
      if (!dryRun) {
        await syncMetadata.markCompleted(SOURCE_KEY, { etag: downloadResult.etag });
      }
      return stats;
    }

    // Verify content hash (fallback if ETag not supported)
    const zipHash = await hashFile(zipPath);
    if (!bypassArchiveCache && prevState?.contentHash === zipHash) {
      console.log("✓ ZIP content identical (hash match), skipping sync");
      if (!dryRun) {
        await syncMetadata.markCompleted(SOURCE_KEY, {
          contentHash: zipHash,
          etag: downloadResult.etag,
        });
      }
      rmSync(TEMP_DIR, { recursive: true });
      return stats;
    }

    console.log("✓ Downloaded ZIP file");
    const sourceFetchedAt = new Date();

    // Step 2: Extract ZIP
    console.log("Extracting ZIP...");
    const jsonDir = path.join(TEMP_DIR, "json");
    mkdirSync(jsonDir, { recursive: true });
    extractZip(zipPath, TEMP_DIR);
    console.log("✓ Extracted ZIP file");

    // Step 3: List JSON files
    const jsonFiles = readdirSync(jsonDir).filter((f) => f.endsWith(".json"));
    const total = jsonFiles.length;
    console.log(
      `Found ${total} scrutins to process${todayOnly ? " (filtering for today only)" : ""}\n`
    );

    // Step 4: Build acteur map
    const acteurToId = officialGroupsOnly
      ? new Map<string, string>()
      : await (async () => {
          console.log("Building acteur ID to politician map...");
          const map = await buildActeurToIdMap();
          console.log(`✓ Found ${map.size} deputies with AN IDs in database\n`);
          return map;
        })();

    // Step 5: Process each scrutin
    const progress = new ProgressTracker({
      total,
      label: "Scrutins",
      logInterval: 100,
    });

    for (let i = 0; i < jsonFiles.length; i++) {
      const file = jsonFiles[i];

      try {
        const filePath = path.join(jsonDir, file!);
        const content = readFileSync(filePath, "utf-8");
        const data = safeJsonParseOrThrow<ANScrutin>(content);
        const s = data.scrutin;

        // Filter by today's date if --today flag is set
        if (todayOnly) {
          const today = new Date().toISOString().split("T")[0];
          if (s.dateScrutin !== today) {
            stats.scrutinsSkipped++;
            progress.tick();
            continue;
          }
        }

        const externalId = s.uid;
        const votingDate = new Date(s.dateScrutin);
        const votesFor = parseInt(s.syntheseVote?.decompte?.pour || "0", 10);
        const votesAgainst = parseInt(s.syntheseVote?.decompte?.contre || "0", 10);
        const votesAbstain = parseInt(s.syntheseVote?.decompte?.abstentions || "0", 10);

        // Extract scrutin number from UID (e.g., VTANR5L17V5283 -> 5283)
        const scrutinNumber = s.numero || s.uid.replace(/^VTANR5L\d+V/, "");
        const sourceUrl = `https://www.assemblee-nationale.fr/dyn/${legislature}/scrutins/${scrutinNumber}`;
        // A metadata-only backfill must never touch nominative votes. Avoid
        // parsing that section entirely in this mode to make that contract
        // explicit and keep the backfill cheap.
        const individualVotes = officialGroupsOnly ? [] : extractVotes(data);

        if (!dryRun) {
          // Metadata-only mode is intentionally limited to rows already in
          // Poligraph. It fills the additive official snapshot and never
          // creates a scrutin or rewrites its individual votes.
          const existing = await db.scrutin.findUnique({
            where: { externalId },
          });

          if (officialGroupsOnly) {
            if (!existing) {
              stats.scrutinsSkipped++;
            } else {
              const metadata = {
                codeTypeVote: s.typeVote?.codeTypeVote?.trim() || null,
                libelleTypeVote: s.typeVote?.libelleTypeVote?.trim() || null,
              };
              const officialGroupSnapshot = buildOfficialGroupSnapshot(
                data,
                createHash("sha256").update(content).digest("hex"),
                zipUrl,
                sourceFetchedAt
              );
              const changed = await persistOfficialGroupSnapshot(
                existing,
                officialGroupSnapshot,
                metadata,
                force
              );
              if (changed) stats.scrutinsUpdated++;
              else stats.scrutinsSkipped++;
            }
          } else {
            // Upsert scrutin

            const scrutinData = {
              externalId,
              title: s.titre,
              description: null,
              votingDate,
              legislature: parseInt(s.legislature, 10),
              votesFor,
              votesAgainst,
              votesAbstain,
              result: parseVotingResult(s.sort?.code || "rejeté"),
              sourceUrl,
              type: classifyScrutinTitle(s.titre),
              codeTypeVote: s.typeVote?.codeTypeVote?.trim() || null,
              libelleTypeVote: s.typeVote?.libelleTypeVote?.trim() || null,
            };

            let scrutin;
            if (existing) {
              const updateData: typeof scrutinData & { slug?: string } = { ...scrutinData };
              if (!existing.slug) {
                updateData.slug = await generateUniqueScrutinSlug(votingDate, s.titre);
              }
              scrutin = await db.scrutin.update({
                where: { id: existing.id },
                data: updateData,
              });
              stats.scrutinsUpdated++;
            } else {
              const slug = await generateUniqueScrutinSlug(votingDate, s.titre);
              scrutin = await db.scrutin.create({
                data: { ...scrutinData, slug },
              });
              stats.scrutinsCreated++;
            }

            // Process votes
            const votesToCreate: { politicianId: string; position: VotePosition }[] = [];

            for (const vote of individualVotes) {
              const politicianId = acteurToId.get(vote.acteurRef);
              if (politicianId) {
                votesToCreate.push({
                  politicianId,
                  position: vote.position,
                });
              } else {
                stats.politiciansNotFound.add(vote.acteurRef);
              }
            }

            // Check votes hash to skip unchanged scrutins
            if (votesToCreate.length > 0) {
              const newHash = hashVotes(votesToCreate);

              if (scrutin.votesHash === newHash) {
                stats.votesSkipped += votesToCreate.length;
              } else {
                await writeVotesForScrutin({
                  scrutinId: scrutin.id,
                  votingDate: scrutin.votingDate,
                  chamber: scrutin.chamber,
                  scrutinType: scrutin.type,
                  votes: votesToCreate,
                });

                await db.scrutin.update({
                  where: { id: scrutin.id },
                  data: { votesHash: newHash },
                });

                await computeGroupPositionsForScrutin(scrutin.id);
                stats.votesCreated += votesToCreate.length;
              }
            }
          }
        } else {
          // Dry run: just count
          if (officialGroupsOnly) {
            // Reads are allowed in dry-run mode so the report can state how
            // many existing rows would be refreshed. No model is mutated.
            const existing = await db.scrutin.findUnique({ where: { externalId } });
            if (existing) stats.scrutinsUpdated++;
            else stats.scrutinsSkipped++;
          } else {
            if (individualVotes.length > 0) {
              for (const vote of individualVotes) {
                if (!acteurToId.has(vote.acteurRef)) {
                  stats.politiciansNotFound.add(vote.acteurRef);
                }
              }
            }
            stats.scrutinsCreated++;
            stats.votesCreated += individualVotes.filter((v) => acteurToId.has(v.acteurRef)).length;
          }
        }

        stats.scrutinsProcessed++;
      } catch (err) {
        stats.errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
      }

      progress.update({
        processed: i + 1,
        created: stats.scrutinsCreated,
        updated: stats.scrutinsUpdated,
        skipped: stats.scrutinsSkipped,
        errors: stats.errors.length,
      });
    }

    progress.finish();

    // Cleanup
    rmSync(TEMP_DIR, { recursive: true });

    // Track sync metadata
    if (!dryRun && (!officialGroupsOnly || stats.errors.length === 0)) {
      await syncMetadata.markCompleted(SOURCE_KEY, {
        etag: downloadResult.etag,
        contentHash: zipHash,
        itemCount: stats.scrutinsProcessed,
      });
    }
  } catch (err) {
    stats.errors.push(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return stats;
}

/**
 * Get statistics for AN votes in the database
 */
export async function getScrutinsANStats(): Promise<{
  scrutinsCount: number;
  votesCount: number;
  legislatures: Array<{ legislature: number; count: number }>;
}> {
  const scrutinsCount = await db.scrutin.count({
    where: { externalId: { startsWith: "VTANR" } },
  });
  const votesCount = await db.vote.count({
    where: { scrutin: { externalId: { startsWith: "VTANR" } } },
  });
  const legislatures = await db.scrutin.groupBy({
    by: ["legislature"],
    _count: true,
    orderBy: { legislature: "desc" },
    where: { externalId: { startsWith: "VTANR" } },
  });

  return {
    scrutinsCount,
    votesCount,
    legislatures: legislatures.map((l) => ({
      legislature: l.legislature ?? 0,
      count: l._count,
    })),
  };
}
