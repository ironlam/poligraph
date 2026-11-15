/**
 * Import 2026 municipal election results from the official
 * data.gouv.fr CSV (published day after each round).
 *
 * Downloads the "Résultats - Communes" CSV, parses it with the 2026 wide-format
 * parser, and updates:
 *   - CommuneElectionRound (participation per commune, round 1 or 2)
 *   - Candidacy (round1/round2 Votes, Pct, Qualified, isElected)
 *   - StatsSnapshot (aggregate stats for the landing page)
 *
 * Supports both T1 (--round=1, default) and T2 (--round=2).
 * Overwrites any data previously imported by the scraper (resultats-t1.ts).
 * Idempotent — safe to re-run.
 */

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import { matchListCandidacies, planSeatWrites } from "./list-seats";
import {
  splitCsvLine,
  parseWideResultRow2026,
  withDecidedSeats,
  type CommuneResult2026,
  type ListResult2026,
} from "./parse-wide-results-2026";
import { USER_AGENT } from "@/config/site";

// --- Data source URLs ---

const URLS = {
  t1: "https://www.data.gouv.fr/fr/datasets/r/4feeef01-24f7-4d5a-914f-8aa806f31ec2",
  t2: "https://www.data.gouv.fr/fr/datasets/r/6ff67a28-01bf-459e-beca-dd7aa8132dc1",
};

const ELECTION_SLUG = "municipales-2026";

// --- Types ---

interface SyncOptions {
  dryRun?: boolean;
  dept?: string;
  round?: 1 | 2;
  /** Write the seats of each list and nothing else: no votes, participation or snapshot. */
  seatsOnly?: boolean;
}

interface SyncStats {
  communesProcessed: number;
  communesSkipped: number;
  candidaciesUpdated: number;
  candidaciesNotMatched: number;
  elected: number;
  participationSum: number;
  participationCount: number;
}

// --- Helpers ---

async function downloadCsv(url: string): Promise<string> {
  console.log(`Downloading CSV from ${url}...`);
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const text = await response.text();
  console.log(`  Downloaded ${(text.length / 1024 / 1024).toFixed(1)} MB`);
  return text;
}

function parseCsvLines(text: string): CommuneResult2026[] {
  const lines = text.split(/\r?\n/);
  // Skip header
  const dataLines = lines.slice(1).filter((line) => line.trim().length > 0);

  const results: CommuneResult2026[] = [];
  for (const line of dataLines) {
    const cols = splitCsvLine(line);
    if (cols.length < 18) continue;
    results.push(withDecidedSeats(parseWideResultRow2026(cols)));
  }
  return results;
}

// --- DB operations ---

async function upsertCommuneParticipation(
  communeId: string,
  electionId: string,
  round: 1 | 2,
  data: CommuneResult2026
) {
  await db.communeElectionRound.upsert({
    where: {
      communeId_electionId_round: {
        communeId,
        electionId,
        round,
      },
    },
    update: {
      registeredVoters: data.registeredVoters,
      actualVoters: data.actualVoters,
      participationRate: new Prisma.Decimal(data.participationRate),
      blankVotes: data.blankVotes,
      nullVotes: data.nullVotes,
      validVotes: data.expressedVotes,
    },
    create: {
      communeId,
      electionId,
      round,
      registeredVoters: data.registeredVoters,
      actualVoters: data.actualVoters,
      participationRate: new Prisma.Decimal(data.participationRate),
      blankVotes: data.blankVotes,
      nullVotes: data.nullVotes,
      validVotes: data.expressedVotes,
    },
  });
}

/** Find candidacy IDs matching a list via 3-level cascade (exact, short, partial). */
async function findMatchingCandidacyIds(
  electionId: string,
  communeId: string,
  list: ListResult2026
): Promise<string[]> {
  const candidacies = await db.candidacy.findMany({
    where: { electionId, communeId },
    select: { id: true, listName: true },
  });
  const { ids, partial } = matchListCandidacies(candidacies, list);
  if (partial) {
    console.warn(
      `  [FALLBACK] "${list.listName}" matched ${ids.length} via partial in ${communeId}`
    );
  }
  return ids;
}

async function updateCandidacyResultsT1(
  electionId: string,
  communeId: string,
  list: ListResult2026
): Promise<number> {
  const matchingIds = await findMatchingCandidacyIds(electionId, communeId, list);
  if (matchingIds.length === 0) return 0;

  const round1Qualified = list.pctExpressed >= 10;

  await db.candidacy.updateMany({
    where: { id: { in: matchingIds } },
    data: {
      round1Votes: list.votes,
      round1Pct: new Prisma.Decimal(list.pctExpressed),
      round1Qualified,
      isElected: list.isElected,
    },
  });

  return matchingIds.length;
}

async function updateCandidacyResultsT2(
  electionId: string,
  communeId: string,
  list: ListResult2026,
  isWinner: boolean
): Promise<number> {
  const matchingIds = await findMatchingCandidacyIds(electionId, communeId, list);
  if (matchingIds.length === 0) return 0;

  await db.candidacy.updateMany({
    where: { id: { in: matchingIds } },
    data: {
      round2Votes: list.votes,
      round2Pct: new Prisma.Decimal(list.pctExpressed),
      isElected: isWinner,
    },
  });

  return matchingIds.length;
}

const SEAT_BATCH = 1000;

/**
 * Seats of each list, written on its head of list and nowhere else: no vote, percentage or
 * elected flag is touched. Batched, and a row already holding the value is not rewritten. A
 * commune with a list that cannot be matched keeps no seats: partial seats would read as a council.
 */
async function syncSeats(electionId: string, communes: CommuneResult2026[], dryRun: boolean) {
  const heads = await db.candidacy.findMany({
    where: { electionId, listPosition: 1, communeId: { not: null } },
    select: { id: true, listName: true, communeId: true },
  });
  const plan = planSeatWrites(
    communes,
    heads.flatMap((h) => (h.communeId ? [{ ...h, communeId: h.communeId }] : []))
  );
  for (const reason of plan.skipped) console.warn(`  [WARN] Seats, ${reason}`);

  let written = 0;
  let cleared = 0;
  if (!dryRun) {
    for (let i = 0; i < plan.clear.length; i += SEAT_BATCH) {
      const { count } = await db.candidacy.updateMany({
        where: { id: { in: plan.clear.slice(i, i + SEAT_BATCH) }, municipalSeats: { not: null } },
        data: { municipalSeats: null },
      });
      cleared += count;
    }
    for (let i = 0; i < plan.rows.length; i += SEAT_BATCH) {
      const values = plan.rows
        .slice(i, i + SEAT_BATCH)
        .map((row) => Prisma.sql`(${row.id}::text, ${row.seats}::int)`);
      written += await db.$executeRaw`
        UPDATE "Candidacy" AS c SET "municipalSeats" = v.seats
        FROM (VALUES ${Prisma.join(values)}) AS v(id, seats)
        WHERE c.id = v.id AND c."municipalSeats" IS DISTINCT FROM v.seats`;
    }
  }
  console.log(`Communes with seats: ${plan.communes}`);
  console.log(`Lists with seats: ${plan.lists} (${plan.seats} seats)`);
  console.log(`Heads of list matched: ${plan.rows.length}`);
  console.log(`Lists not matched: ${plan.skipped.length}`);
  console.log(`Communes left without seats (a list not matched): ${plan.incompleteCommunes}`);
  console.log(`Rows written: ${written}, rows cleared: ${cleared}`);
}

async function updateResultsSnapshot(stats: Record<string, number>) {
  const key = "municipales-2026-resultats";
  const existing = await db.statsSnapshot.findUnique({ where: { key } });
  const merged = {
    ...((existing?.data as Record<string, unknown>) ?? {}),
    ...stats,
    source: "csv-datagouv",
    updatedAt: new Date().toISOString(),
  };

  await db.statsSnapshot.upsert({
    where: { key },
    update: { data: merged, computedAt: new Date() },
    create: { key, data: merged, computedAt: new Date() },
  });
}

// --- Main sync function ---

export async function syncResultatsCsv({
  dryRun = false,
  dept,
  round = 1,
  seatsOnly = false,
}: SyncOptions = {}) {
  const roundLabel = round === 1 ? "T1" : "T2";
  console.log(`\n=== Sync Resultats CSV 2026 ${roundLabel} ${dryRun ? "(DRY RUN)" : ""} ===\n`);

  const csvUrl = round === 1 ? URLS.t1 : URLS.t2;
  if (!csvUrl) {
    console.error(`No CSV URL configured for ${roundLabel}. Update URLS.t2 in resultats-csv.ts`);
    await db.$disconnect();
    return;
  }

  // Load election
  const election = await db.election.findUnique({
    where: { slug: ELECTION_SLUG },
    select: { id: true },
  });

  if (!election) {
    console.error(`Election ${ELECTION_SLUG} not found in DB`);
    await db.$disconnect();
    return;
  }

  // Load communes in DB for validation
  const communes = await db.commune.findMany({ select: { id: true } });
  const communeSet = new Set(communes.map((c) => c.id));
  console.log(`${communeSet.size} communes in DB\n`);

  // Download and parse CSV
  const csvText = await downloadCsv(csvUrl);
  let allResults = parseCsvLines(csvText);
  console.log(`${allResults.length} communes parsed from CSV\n`);

  // Filter by department if requested
  if (dept) {
    allResults = allResults.filter((r) => r.deptCode === dept);
    console.log(`Filtered to ${allResults.length} communes for dept ${dept}\n`);
  }

  if (seatsOnly) {
    await syncSeats(election.id, allResults, dryRun);
    await db.$disconnect();
    return;
  }

  const stats: SyncStats = {
    communesProcessed: 0,
    communesSkipped: 0,
    candidaciesUpdated: 0,
    candidaciesNotMatched: 0,
    elected: 0,
    participationSum: 0,
    participationCount: 0,
  };

  let currentDept = "";

  for (const commune of allResults) {
    // Log department transitions
    if (commune.deptCode !== currentDept) {
      if (currentDept) {
        console.log(`  dept ${currentDept}: done`);
      }
      currentDept = commune.deptCode;
      console.log(`\n--- Department ${currentDept} (${commune.deptName}) ---`);
    }

    // Skip communes not in DB
    if (!communeSet.has(commune.inseeCode)) {
      stats.communesSkipped++;
      continue;
    }

    // Skip communes with no lists (participation-only rows)
    if (commune.lists.length === 0) {
      stats.communesSkipped++;
      continue;
    }

    if (!dryRun) {
      // Upsert participation
      await upsertCommuneParticipation(commune.inseeCode, election.id, round, commune);

      if (round === 1) {
        for (const list of commune.lists) {
          const count = await updateCandidacyResultsT1(election.id, commune.inseeCode, list);
          if (count > 0) {
            stats.candidaciesUpdated += count;
          } else {
            stats.candidaciesNotMatched++;
            console.warn(
              `  [WARN] No match: "${list.listName}" (${list.nuanceCode}) in ${commune.inseeCode} ${commune.communeName}`
            );
          }
        }
      } else {
        // T2: the list with the most votes wins (plurality rule)
        let maxVotes = -1;
        let winnerIdx = 0;
        for (let i = 0; i < commune.lists.length; i++) {
          if (commune.lists[i]!.votes > maxVotes) {
            maxVotes = commune.lists[i]!.votes;
            winnerIdx = i;
          }
        }
        for (let i = 0; i < commune.lists.length; i++) {
          const list = commune.lists[i]!;
          const count = await updateCandidacyResultsT2(
            election.id,
            commune.inseeCode,
            list,
            i === winnerIdx
          );
          if (count > 0) {
            stats.candidaciesUpdated += count;
          } else {
            stats.candidaciesNotMatched++;
            console.warn(
              `  [WARN] No match: "${list.listName}" (${list.nuanceCode}) in ${commune.inseeCode} ${commune.communeName}`
            );
          }
        }
      }
    }

    if (round === 1) {
      const hasElected = commune.lists.some((l) => l.isElected);
      if (hasElected) stats.elected++;
    } else {
      // At T2, every commune elects a winner
      stats.elected++;
    }

    stats.participationSum += commune.participationRate;
    stats.participationCount++;
    stats.communesProcessed++;
  }

  // Update stats snapshot
  if (!dryRun && stats.participationCount > 0) {
    const avgParticipation =
      Math.round((stats.participationSum / stats.participationCount) * 100) / 100;

    if (round === 1) {
      await updateResultsSnapshot({
        communesDepouillees: stats.communesProcessed,
        participationMoyenne: avgParticipation,
        eluesT1: stats.elected,
        auSecondTour: stats.communesProcessed - stats.elected,
      });
    } else {
      await updateResultsSnapshot({
        communesDepouilleesT2: stats.communesProcessed,
        participationMoyenneT2: avgParticipation,
        eluesT2: stats.elected,
      });
    }
    console.log("\nStatsSnapshot updated");
  }

  await syncSeats(election.id, allResults, dryRun);

  // National participation (weighted by registered voters)
  let totalRegistered = 0;
  let totalVoters = 0;
  for (const c of allResults) {
    totalRegistered += c.registeredVoters;
    totalVoters += c.actualVoters;
  }
  const nationalRate = totalRegistered > 0 ? (totalVoters / totalRegistered) * 100 : 0;

  console.log(`\n=== Summary (${roundLabel}) ===`);
  console.log(`Communes parsed from CSV: ${allResults.length}`);
  console.log(`Communes processed: ${stats.communesProcessed}`);
  console.log(`Communes skipped (not in DB): ${stats.communesSkipped}`);
  console.log(`Candidacies updated: ${stats.candidaciesUpdated}`);
  console.log(`Lists not matched: ${stats.candidaciesNotMatched}`);
  console.log(`Elected: ${stats.elected}`);
  console.log(
    `National participation: ${nationalRate.toFixed(2)}% (${totalVoters}/${totalRegistered})`
  );
  if (stats.participationCount > 0) {
    console.log(
      `Avg commune participation: ${(stats.participationSum / stats.participationCount).toFixed(2)}%`
    );
  }

  await db.$disconnect();
}
