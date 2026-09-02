/**
 * Import script for 2014 French municipal election results.
 *
 * Downloads 2 TXT files from data.gouv.fr (communes >= 1000 only):
 *   - T1 results (semicolon-delimited, Latin-1)
 *   - T2 results (semicolon-delimited, Latin-1)
 *
 * Uses the 2014-specific parser, cross-references communes in DB,
 * and bulk-inserts Candidacy + ElectionRound records.
 */

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import { NUANCE_POLITIQUE_MAPPING } from "@/config/labels";
import { parseWideResultRow2014 } from "./parse-wide-results-2014";
import { type ListResult, type CommuneResult } from "./parse-wide-results";
import { decodeAndSplit, downloadBuffer } from "./csv-download";

const URLS = {
  t1: "https://www.data.gouv.fr/api/1/datasets/r/936f6d38-5969-46e5-8b9d-c7646d6390ec",
  t2: "https://www.data.gouv.fr/api/1/datasets/r/28ed59fd-d285-42f1-9eb6-d82ff2eaa4b3",
};

const FIXED_COLS_2014 = 17;

const ELECTION_SLUG = "municipales-2014";
const ELECTION_META = {
  slug: ELECTION_SLUG,
  type: "MUNICIPALES" as const,
  scope: "MUNICIPAL" as const,
  title: "Elections municipales 2014",
  shortTitle: "Municipales 2014",
  round1Date: new Date("2014-03-23"),
  round2Date: new Date("2014-03-30"),
  dateConfirmed: true,
  status: "COMPLETED" as const,
};

type ListWithRound2 = ListResult & {
  round2Votes?: number;
  round2Pct?: number;
  round2SeatsWon?: number | null;
};

/**
 * Deliberately NOT the `normalizeListName` exported by `./resultats-t1`.
 *
 * That one also strips punctuation and collapses runs of whitespace. The 2014 source file keeps
 * hyphens and apostrophes inside list labels, and folding them here would merge lists that the
 * import must keep apart. Same name, different contract: leave them separate.
 */
function normalizeListName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

export async function syncMunicipales2014(statsOnly = false) {
  console.log("=== Municipales 2014 - Import ===\n");

  console.log("Downloading 2 files from data.gouv.fr...");
  const [bufT1, bufT2] = await Promise.all([downloadBuffer(URLS.t1), downloadBuffer(URLS.t2)]);
  console.log(`  Downloaded: T1=${bufT1.length}B, T2=${bufT2.length}B`);

  console.log("\nParsing T1 results...");
  const rowsT1 = decodeAndSplit(bufT1, ";");
  const t1Results: CommuneResult[] = [];
  for (const cols of rowsT1) {
    if (cols.length < FIXED_COLS_2014) continue;
    t1Results.push(parseWideResultRow2014(cols));
  }
  console.log(`  T1: ${t1Results.length} communes parsed`);

  console.log("Parsing T2 results...");
  const rowsT2 = decodeAndSplit(bufT2, ";");
  const t2Results: CommuneResult[] = [];
  for (const cols of rowsT2) {
    if (cols.length < FIXED_COLS_2014) continue;
    t2Results.push(parseWideResultRow2014(cols));
  }
  console.log(`  T2: ${t2Results.length} communes parsed`);

  // Merge T2 into T1 by normalized list name, fallback to tete de liste last name
  console.log("Merging T2 into T1 entries...");
  const t1Index = new Map<string, Map<string, ListWithRound2>>();
  for (const commune of t1Results) {
    const listMap = new Map<string, ListWithRound2>();
    for (const list of commune.lists) {
      const key = normalizeListName(list.listName || `${list.lastName} ${list.firstName}`);
      listMap.set(key, list as ListWithRound2);
    }
    t1Index.set(commune.inseeCode, listMap);
  }

  let mergedCount = 0;
  let unmatchedCount = 0;
  for (const commune of t2Results) {
    const listMap = t1Index.get(commune.inseeCode);
    if (!listMap) continue;
    for (const list of commune.lists) {
      const key = normalizeListName(list.listName || `${list.lastName} ${list.firstName}`);
      const match = listMap.get(key);
      if (match) {
        match.round2Votes = list.votes;
        match.round2Pct = list.pctExpressed;
        match.round2SeatsWon = list.seatsWon;
        mergedCount++;
      } else {
        // Fallback: match by tete de liste last name
        const byName = [...listMap.values()].find(
          (t1List) => t1List.lastName.toUpperCase() === list.lastName.toUpperCase()
        );
        if (byName) {
          byName.round2Votes = list.votes;
          byName.round2Pct = list.pctExpressed;
          byName.round2SeatsWon = list.seatsWon;
          mergedCount++;
        } else {
          unmatchedCount++;
        }
      }
    }
  }
  console.log(`  Merged ${mergedCount} round-2 results (${unmatchedCount} unmatched)`);

  console.log("Loading communes from DB...");
  const communes = await db.commune.findMany({ select: { id: true } });
  const communeSet = new Set(communes.map((c: { id: string }) => c.id));
  console.log(`  ${communeSet.size} communes in DB`);

  console.log("Building candidacy entries...");

  interface CandidacyEntry {
    candidateName: string;
    partyLabel: string | null;
    listName: string | null;
    communeId: string | null;
    constituencyCode: string | null;
    round1Votes: number;
    round1Pct: number;
    round1Qualified: boolean | null;
    round2Votes: number | null;
    round2Pct: number | null;
    isElected: boolean;
  }

  const entries: CandidacyEntry[] = [];
  let skippedNoCommune = 0;

  for (const commune of t1Results) {
    if (!communeSet.has(commune.inseeCode)) {
      skippedNoCommune++;
      continue;
    }

    // Determine winner by max seatsWon (no separate elus file for 2014)
    const hasT2 = commune.lists.some((l) => (l as ListWithRound2).round2Votes != null);

    let maxSeats = -1;
    let winnerIdx = -1;
    for (let i = 0; i < commune.lists.length; i++) {
      const list = commune.lists[i]! as ListWithRound2;
      const seats = hasT2 ? (list.round2SeatsWon ?? list.seatsWon ?? 0) : (list.seatsWon ?? 0);
      if (seats > maxSeats) {
        maxSeats = seats;
        winnerIdx = i;
      }
    }

    for (let i = 0; i < commune.lists.length; i++) {
      const list = commune.lists[i]!;
      const r2 = list as ListWithRound2;
      const candidateName = `${list.firstName} ${list.lastName}`;
      const partyLabel = NUANCE_POLITIQUE_MAPPING[list.nuanceCode] ?? (list.nuanceCode || null);

      entries.push({
        candidateName,
        partyLabel,
        listName: list.listName || candidateName,
        communeId: commune.inseeCode,
        constituencyCode: commune.inseeCode,
        round1Votes: list.votes,
        round1Pct: list.pctExpressed,
        round1Qualified: list.seatsWon != null && list.seatsWon > 0 ? true : null,
        round2Votes: r2.round2Votes ?? null,
        round2Pct: r2.round2Pct ?? null,
        isElected: i === winnerIdx && maxSeats > 0,
      });
    }
  }

  console.log(`  ${entries.length} candidacy entries built`);
  console.log(`  ${skippedNoCommune} communes skipped (not in DB)`);

  // Compute national participation stats
  let t1Registered = 0;
  let t1Voters = 0;
  let t1BlankNull = 0;
  for (const c of t1Results) {
    t1Registered += c.registeredVoters;
    t1Voters += c.actualVoters;
    t1BlankNull += c.blankVotes;
  }
  const t1Rate = t1Registered > 0 ? (t1Voters / t1Registered) * 100 : 0;

  let t2Registered = 0;
  let t2Voters = 0;
  let t2BlankNull = 0;
  for (const c of t2Results) {
    t2Registered += c.registeredVoters;
    t2Voters += c.actualVoters;
    t2BlankNull += c.blankVotes;
  }
  const t2Rate = t2Registered > 0 ? (t2Voters / t2Registered) * 100 : 0;

  console.log(
    `\nParticipation: T1=${t1Rate.toFixed(2)}% (${t1Voters}/${t1Registered}), ` +
      `T2=${t2Rate.toFixed(2)}% (${t2Voters}/${t2Registered})`
  );

  if (statsOnly) {
    console.log("\n[STATS ONLY - no DB writes]");
    console.log(`  T1 communes: ${t1Results.length}`);
    console.log(`  T2 communes: ${t2Results.length}`);
    console.log(`  Candidacy entries: ${entries.length}`);
    console.log(`  Communes skipped (not in DB): ${skippedNoCommune}`);
    console.log(`  Elected: ${entries.filter((e) => e.isElected).length}`);
    await db.$disconnect();
    return;
  }

  console.log("\nUpserting election record...");
  const election = await db.election.upsert({
    where: { slug: ELECTION_SLUG },
    create: ELECTION_META,
    update: {
      title: ELECTION_META.title,
      shortTitle: ELECTION_META.shortTitle,
      status: ELECTION_META.status,
    },
  });
  console.log(`  Election: ${election.id} (${election.slug})`);

  console.log("Deleting existing candidacies for this election...");
  const deleted = await db.candidacy.deleteMany({
    where: { electionId: election.id },
  });
  console.log(`  Deleted ${deleted.count} existing candidacies`);

  console.log(`Inserting ${entries.length} candidacies...`);

  const CHUNK_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);
    const values = Prisma.join(
      chunk.map(
        (e) =>
          Prisma.sql`(gen_random_uuid(), ${election.id},
          ${e.candidateName}, ${e.partyLabel}, ${e.listName},
          ${e.communeId}, ${e.constituencyCode},
          ${e.round1Votes}, ${e.round1Pct}, ${e.round1Qualified ?? null},
          ${e.round2Votes ?? null}, ${e.round2Pct ?? null}, ${e.isElected},
          NOW(), NOW())`
      )
    );

    await db.$executeRaw`
      INSERT INTO "Candidacy" (
        "id", "electionId",
        "candidateName", "partyLabel", "listName",
        "communeId", "constituencyCode",
        "round1Votes", "round1Pct", "round1Qualified",
        "round2Votes", "round2Pct", "isElected",
        "createdAt", "updatedAt"
      ) VALUES ${values}
    `;

    inserted += chunk.length;
    if ((i / CHUNK_SIZE) % 20 === 0 || i + CHUNK_SIZE >= entries.length) {
      console.log(`  Inserted ${inserted}/${entries.length}`);
    }
  }

  console.log("Creating ElectionRound records...");

  await db.electionRound.deleteMany({
    where: { electionId: election.id },
  });

  await db.electionRound.createMany({
    data: [
      {
        electionId: election.id,
        round: 1,
        date: ELECTION_META.round1Date,
        registeredVoters: t1Registered,
        actualVoters: t1Voters,
        participationRate: parseFloat(t1Rate.toFixed(2)),
        blankVotes: t1BlankNull,
        nullVotes: 0,
      },
      {
        electionId: election.id,
        round: 2,
        date: ELECTION_META.round2Date,
        registeredVoters: t2Registered,
        actualVoters: t2Voters,
        participationRate: parseFloat(t2Rate.toFixed(2)),
        blankVotes: t2BlankNull,
        nullVotes: 0,
      },
    ],
  });
  console.log("  Created round 1 and round 2 records");

  console.log(`\n=== Import complete ===`);
  console.log(`  Candidacies inserted: ${inserted}`);
  console.log(`  Elected: ${entries.filter((e) => e.isElected).length}`);
  console.log(`  Communes covered: ${new Set(entries.map((e) => e.communeId)).size}`);

  await db.$disconnect();
}
