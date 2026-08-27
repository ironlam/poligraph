/**
 * Votes Sénat sync service
 *
 * Imports scrutins and individual votes from senat.fr.
 * Scrapes session pages for scrutin lists, fetches HTML metadata
 * and JSON vote data, then upserts Scrutin + Vote records.
 */

import { db } from "@/lib/db";
import { syncMetadata, hashContent, hashVotes, ProgressTracker } from "@/lib/sync";
import { computeGroupPositionsForScrutin } from "@/services/sync/compute-group-positions";
import { writeVotesForScrutin } from "@/services/sync/scrutins-vote-writer";
import { HTTPClient } from "@/lib/api/http-client";
import { decodeHtmlEntities, parseFrenchDate } from "@/lib/parsing";
import { generateDateSlug, generateUniqueSlug } from "@/lib/utils";
import { VotePosition, VotingResult, DataSource, Chamber } from "@/generated/prisma";
import { classifyScrutinTitle } from "@/lib/scrutin-type";
import { SENAT_RATE_LIMIT_MS } from "@/config/rate-limits";
import {
  assessSenateVoteSource,
  mapSenateVotePosition,
  type SenateSourceVote,
} from "@/lib/votes/senate-participation";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = "https://www.senat.fr";

export const AVAILABLE_SESSIONS = [
  2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010, 2009,
  2008, 2007, 2006,
];

const senatClient = new HTTPClient({
  baseUrl: BASE_URL,
  rateLimitMs: SENAT_RATE_LIMIT_MS,
  timeout: 30000,
  retries: 3,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScrutinMetadata {
  number: number;
  date: Date;
  title: string;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  officialVoters: number | null;
  officialNonVoters: number | null;
  result: VotingResult;
  sourceUrl: string;
}

export interface ScrutinsSenatSyncStats {
  scrutinsProcessed: number;
  scrutinsCreated: number;
  scrutinsUpdated: number;
  scrutinsSkipped: number;
  votesCreated: number;
  votesSkipped: number;
  cursorSkipped: number;
  errors: string[];
  senatorsNotFound: Set<string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get list of scrutin numbers from a session page
 */
async function getScrutinListForSession(session: number): Promise<string[]> {
  const { data: html } = await senatClient.getText(`/scrutin-public/scr${session}.html`, {
    skipCache: true,
  });

  const regex = new RegExp(`(?:/scrutin-public/)?${session}/scr${session}-(\\d+)\\.html`, "g");
  const numbers: string[] = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    if (!numbers.includes(match[1]!)) {
      numbers.push(match[1]!);
    }
  }

  return numbers.sort((a, b) => parseInt(b) - parseInt(a));
}

/**
 * Parse scrutin metadata from HTML page
 */
export function parseScrutinMetadata(
  html: string,
  session: number,
  number: string
): ScrutinMetadata | null {
  try {
    const decodedHtml = decodeHtmlEntities(html);
    const textContent = decodedHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    // Extract title — prefer <p class="page-lead"> (descriptive) over h1 (generic "Scrutin n°X")
    const pageLeadMatch = decodedHtml.match(/<p\s+class="page-lead">([\s\S]*?)<\/p>/i);
    const h1Match = decodedHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

    let title = `Scrutin n°${number}`;
    if (pageLeadMatch) {
      const leadText = pageLeadMatch[1]!
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (leadText.length > 5) {
        title = leadText;
      }
    } else if (h1Match) {
      const h1Text = h1Match[1]!
        .replace(/<[^>]+>/g, " ")
        .replace(/\s*En savoir plus\s*/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (h1Text.length > 5) {
        title = h1Text;
      }
    }

    // Extract date — format: "séance du 11 juillet 2025"
    // Use [\wÀ-ÿ]+ to match French month names with accents
    const dateMatch = textContent.match(/séance\s+du\s+(\d{1,2})\s+([\wÀ-ÿ]+)\s+(\d{4})/i);
    let date = new Date();

    if (dateMatch) {
      const parsed = parseFrenchDate(`${dateMatch[1]} ${dateMatch[2]} ${dateMatch[3]}`);
      if (parsed) date = parsed;
    }

    // Extract vote counts
    const forMatch =
      html.match(/<strong>\s*(\d+)\s*<\/strong>\s*pour/i) ||
      textContent.match(/(\d+)\s+pour(?!\s+part)/i);
    const againstMatch =
      html.match(/<strong>\s*(\d+)\s*<\/strong>\s*contre/i) || textContent.match(/(\d+)\s+contre/i);
    const abstainMatch =
      textContent.match(/abstention[s]?\s*:?\s*(\d+)/i) ||
      html.match(/<strong>\s*(\d+)\s*<\/strong>\s*abstention/i);

    const votesFor = forMatch ? parseInt(forMatch[1]!) : 0;
    const votesAgainst = againstMatch ? parseInt(againstMatch[1]!) : 0;
    const votesAbstain = abstainMatch ? parseInt(abstainMatch[1]!) : 0;
    const votersMatch = textContent.match(/(\d+)\s+votants/i);
    const nonVotersMatch = textContent.match(
      /N['’]ont\s+pas\s+pris\s+part\s+au\s+vote\s*:?\s*(\d+)/i
    );

    // Determine result
    const hasAdoption = /Le\s+Sénat\s+a\s+adopté|a\s+été\s+adopté/i.test(textContent);
    const hasRejection = /n['']a\s+pas\s+adopté|a\s+été\s+rejeté|rejet/i.test(textContent);
    const result: VotingResult = hasAdoption && !hasRejection ? "ADOPTED" : "REJECTED";

    return {
      number: parseInt(number),
      date,
      title,
      votesFor,
      votesAgainst,
      votesAbstain,
      officialVoters: votersMatch ? parseInt(votersMatch[1]!, 10) : null,
      officialNonVoters: nonVotersMatch ? parseInt(nonVotersMatch[1]!, 10) : null,
      result,
      sourceUrl: `${BASE_URL}/scrutin-public/${session}/scr${session}-${number}.html`,
    };
  } catch (error) {
    console.error(`Error parsing scrutin metadata: ${error}`);
    return null;
  }
}

/**
 * Fetch individual votes from JSON endpoint
 */
async function fetchVotesJson(session: number, number: string): Promise<SenateSourceVote[]> {
  const { data } = await senatClient.get<{ votes?: SenateSourceVote[] }>(
    `/scrutin-public/${session}/scr${session}-${number}.json`,
    { skipCache: true }
  );
  if (!Array.isArray(data.votes)) {
    throw new Error("Réponse JSON Sénat sans liste de votes");
  }
  return data.votes;
}

function senateVotesSourceUrl(session: number, number: string): string {
  return `${BASE_URL}/scrutin-public/${session}/scr${session}-${number}.json`;
}

function hashSenateSourceVotes(votes: SenateSourceVote[]): string {
  return hashContent(JSON.stringify(votes));
}

/**
 * Build map of Senate matricule -> politician ID
 */
async function buildMatriculeToIdMap(): Promise<Map<string, string>> {
  const externalIds = await db.externalId.findMany({
    where: {
      source: DataSource.SENAT,
      politicianId: { not: null },
    },
    select: { externalId: true, politicianId: true },
  });

  const map = new Map<string, string>();
  for (const ext of externalIds) {
    if (ext.politicianId) {
      map.set(ext.externalId, ext.politicianId);
      if (ext.externalId.endsWith("F")) {
        map.set(ext.externalId.slice(0, -1), ext.politicianId);
      }
    }
  }

  return map;
}

/**
 * Generate a unique slug for a Sénat scrutin (with "senat-" prefix)
 */
async function generateUniqueScrutinSlug(date: Date, title: string): Promise<string> {
  const senatSlug = `senat-${generateDateSlug(date, title)}`.slice(0, 80);
  return generateUniqueSlug(senatSlug, (s) =>
    db.scrutin.findUnique({ where: { slug: s } }).then(Boolean)
  );
}

/**
 * Determine legislature from session year
 */
function sessionToLegislature(session: number): number {
  if (session >= 2023) return 2023;
  if (session >= 2020) return 2020;
  if (session >= 2017) return 2017;
  if (session >= 2014) return 2014;
  if (session >= 2011) return 2011;
  if (session >= 2008) return 2008;
  return session;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sync votes from Sénat
 */
export async function syncScrutinsSenat(
  session: number | null = null,
  dryRun: boolean = false,
  todayOnly: boolean = false,
  force: boolean = false
): Promise<ScrutinsSenatSyncStats> {
  const stats: ScrutinsSenatSyncStats = {
    scrutinsProcessed: 0,
    scrutinsCreated: 0,
    scrutinsUpdated: 0,
    scrutinsSkipped: 0,
    votesCreated: 0,
    votesSkipped: 0,
    cursorSkipped: 0,
    errors: [],
    senatorsNotFound: new Set<string>(),
  };

  try {
    // Build matricule map
    console.log("Building matricule to politician ID map...");
    const matriculeToId = await buildMatriculeToIdMap();
    console.log(`✓ Found ${matriculeToId.size} senators with Sénat IDs in database\n`);

    // Determine which sessions to process
    const sessionsToProcess = session !== null ? [session] : AVAILABLE_SESSIONS;
    console.log(`Processing sessions: ${sessionsToProcess.join(", ")}\n`);

    for (const currentSession of sessionsToProcess) {
      console.log(`\n--- Session ${currentSession}-${currentSession + 1} ---`);

      const sessionKey = `votes-senat:${currentSession}`;

      // Get list of scrutins for this session
      console.log(`Fetching scrutin list for session ${currentSession}...`);
      let scrutinNumbers: string[];

      try {
        scrutinNumbers = await getScrutinListForSession(currentSession);
      } catch (error) {
        console.log(`⚠️ Could not fetch session ${currentSession}: ${error}`);
        continue;
      }

      console.log(`✓ Found ${scrutinNumbers.length} scrutins for session ${currentSession}\n`);

      if (scrutinNumbers.length === 0) continue;

      // Cursor-based incremental sync
      let cursorNum = 0;
      if (!force && !todayOnly) {
        const prevState = await syncMetadata.get(sessionKey);
        if (prevState?.cursor) {
          cursorNum = parseInt(prevState.cursor, 10);
          if (!isNaN(cursorNum) && cursorNum > 0) {
            console.log(`Cursor: resuming from n°${cursorNum} (skipping already processed)`);
          }
        }
      }

      // Process each scrutin
      let maxProcessedNumber = cursorNum;

      const progress = new ProgressTracker({
        total: scrutinNumbers.length,
        label: `Session ${currentSession}`,
        logInterval: 20,
      });

      for (let i = 0; i < scrutinNumbers.length; i++) {
        const number = scrutinNumbers[i];
        const numInt = parseInt(number!, 10);

        // Skip scrutins already processed (cursor-based)
        if (!force && !todayOnly && cursorNum > 0 && numInt <= cursorNum) {
          stats.cursorSkipped++;
          progress.tick();
          continue;
        }

        try {
          // Fetch HTML page for metadata
          const { data: html } = await senatClient.getText(
            `/scrutin-public/${currentSession}/scr${currentSession}-${number}.html`,
            { skipCache: true }
          );

          // Parse metadata
          const metadata = parseScrutinMetadata(html, currentSession, number!);
          if (!metadata) {
            stats.scrutinsSkipped++;
            progress.tick();
            continue;
          }

          // Filter by today's date if --today flag is set
          if (todayOnly) {
            const today = new Date().toISOString().split("T")[0];
            const scrutinDate = metadata.date.toISOString().split("T")[0];
            if (scrutinDate! < today!) break;
            if (scrutinDate !== today) {
              stats.scrutinsSkipped++;
              progress.tick();
              continue;
            }
          }

          // Fetch votes JSON
          const votes = await fetchVotesJson(currentSession, number!);
          const officialTotals =
            metadata.officialVoters == null || metadata.officialNonVoters == null
              ? null
              : {
                  voters: metadata.officialVoters,
                  nonVoters: metadata.officialNonVoters,
                  votesFor: metadata.votesFor,
                  votesAgainst: metadata.votesAgainst,
                  votesAbstain: metadata.votesAbstain,
                };
          const sourceAssessment = officialTotals
            ? assessSenateVoteSource(votes, officialTotals)
            : {
                status: "INVALID" as const,
                expectedCount: 0,
                observedCount: votes.length,
                reason: "official_totals_missing",
              };
          const sourceUrl = senateVotesSourceUrl(currentSession, number!);
          const sourceHash = hashSenateSourceVotes(votes);
          const fetchedAt = new Date();

          const externalId = `SENAT-${currentSession}-${number}`;

          if (!dryRun) {
            const existing = await db.scrutin.findUnique({
              where: { externalId },
            });

            const scrutinData = {
              externalId,
              title: metadata.title,
              description: null,
              votingDate: metadata.date,
              legislature: sessionToLegislature(currentSession),
              chamber: Chamber.SENAT,
              votesFor: metadata.votesFor,
              votesAgainst: metadata.votesAgainst,
              votesAbstain: metadata.votesAbstain,
              result: metadata.result,
              sourceUrl: metadata.sourceUrl,
              type: classifyScrutinTitle(metadata.title),
            };

            let scrutin;
            if (existing) {
              const updateData: typeof scrutinData & { slug?: string } = { ...scrutinData };
              if (!existing.slug) {
                updateData.slug = await generateUniqueScrutinSlug(metadata.date, metadata.title);
              }
              scrutin = await db.scrutin.update({
                where: { id: existing.id },
                data: updateData,
              });
              stats.scrutinsUpdated++;
            } else {
              const slug = await generateUniqueScrutinSlug(metadata.date, metadata.title);
              scrutin = await db.scrutin.create({
                data: { ...scrutinData, slug },
              });
              stats.scrutinsCreated++;
            }

            const pendingImport = {
              sourceUrl,
              fetchedAt,
              expectedCount: sourceAssessment.expectedCount,
              observedCount: sourceAssessment.observedCount,
              resolvedCount: 0,
              sourceHash,
              // COMPLETE is set only after the local vote rewrite succeeds.
              status:
                sourceAssessment.status === "COMPLETE"
                  ? ("INCOMPLETE" as const)
                  : sourceAssessment.status,
              statusReason:
                sourceAssessment.status === "COMPLETE"
                  ? "pending_local_vote_rewrite"
                  : sourceAssessment.reason,
            };
            await db.scrutinVoteImport.upsert({
              where: { scrutinId: scrutin.id },
              create: { scrutinId: scrutin.id, ...pendingImport },
              update: pendingImport,
            });

            if (sourceAssessment.status !== "COMPLETE") {
              stats.scrutinsSkipped++;
              stats.errors.push(
                `Session ${currentSession} n°${number}: source nominative ${sourceAssessment.status.toLowerCase()} (${sourceAssessment.reason})`
              );
              progress.tick();
              continue;
            }

            // Process only validated source rows. Unknown codes cannot reach this mapping.
            const votesToCreate: { politicianId: string; position: VotePosition }[] = [];

            for (const vote of votes) {
              const politicianId = matriculeToId.get(vote.matricule);
              if (politicianId) {
                votesToCreate.push({
                  politicianId,
                  position: mapSenateVotePosition(vote.vote),
                });
              } else {
                stats.senatorsNotFound.add(vote.matricule);
              }
            }

            // Check votes hash to skip unchanged scrutins
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

              await computeGroupPositionsForScrutin(scrutin.id);
              stats.votesCreated += votesToCreate.length;
            }

            await db.scrutinVoteImport.update({
              where: { scrutinId: scrutin.id },
              data: {
                resolvedCount: votesToCreate.length,
                status: "COMPLETE",
                statusReason: null,
              },
            });
            await db.scrutin.update({
              where: { id: scrutin.id },
              data: { votesHash: newHash },
            });

            // Track max processed number for cursor
            if (numInt > maxProcessedNumber) {
              maxProcessedNumber = numInt;
            }
          } else {
            // Dry run: just count
            stats.scrutinsCreated++;
            if (sourceAssessment.status === "COMPLETE") {
              for (const vote of votes) {
                if (!matriculeToId.has(vote.matricule)) {
                  stats.senatorsNotFound.add(vote.matricule);
                } else {
                  stats.votesCreated++;
                }
              }
            } else {
              stats.scrutinsSkipped++;
              stats.errors.push(
                `Session ${currentSession} n°${number}: source nominative ${sourceAssessment.status.toLowerCase()} (${sourceAssessment.reason})`
              );
            }
          }

          stats.scrutinsProcessed++;
        } catch (err) {
          stats.errors.push(
            `Session ${currentSession} n°${number}: ${err instanceof Error ? err.message : String(err)}`
          );
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

      // Update cursor for this session
      if (!dryRun && maxProcessedNumber > cursorNum) {
        await syncMetadata.markCompleted(sessionKey, {
          cursor: String(maxProcessedNumber),
          itemCount: stats.scrutinsProcessed,
        });
      }
    }
  } catch (err) {
    stats.errors.push(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return stats;
}

/**
 * Get statistics for Senate votes in the database
 */
export async function getScrutinsSenatStats(): Promise<{
  scrutinsCount: number;
  votesCount: number;
  sessions: Array<{ legislature: number; count: number }>;
}> {
  const scrutinsCount = await db.scrutin.count({
    where: { chamber: Chamber.SENAT },
  });
  const votesCount = await db.vote.count({
    where: { chamber: Chamber.SENAT },
  });
  const sessions = await db.scrutin.groupBy({
    by: ["legislature"],
    where: { chamber: Chamber.SENAT },
    _count: true,
    orderBy: { legislature: "desc" },
  });

  return {
    scrutinsCount,
    votesCount,
    sessions: sessions.map((s) => ({
      legislature: s.legislature ?? 0,
      count: s._count,
    })),
  };
}
