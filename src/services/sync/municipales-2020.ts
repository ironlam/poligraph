/**
 * Import script for 2020 French municipal election results.
 *
 * Downloads 5 CSV/TXT files from data.gouv.fr:
 *   - T1 large communes (>=1000 inhabitants, tab-delimited)
 *   - T1 small communes (<1000, semicolon-delimited)
 *   - T2 large communes (>=1000, semicolon-delimited)
 *   - T2 small communes (<1000, semicolon-delimited)
 *   - Elected officials (tab-delimited)
 *
 * Parses using the wide-format parser, cross-references communes in DB,
 * and bulk-inserts Candidacy + ElectionRound records.
 */

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import { NUANCE_POLITIQUE_MAPPING } from "@/config/labels";
import {
  parseWideResultRow,
  reconstructInseeCode,
  type ListResult,
  type CommuneResult,
} from "./parse-wide-results";
import { decodeAndSplit, downloadBuffer } from "./csv-download";

// ── Data source URLs ────────────────────────────────────────────────────────

const URLS = {
  t1Large: "https://www.data.gouv.fr/fr/datasets/r/5129e7cf-2999-4eaf-8dd7-3bcda37bd0a3",
  t1Small: "https://www.data.gouv.fr/fr/datasets/r/dacfcb29-7e58-4326-9d34-8ea7c5a9466c",
  t2Large: "https://www.data.gouv.fr/fr/datasets/r/e7cae0aa-5e36-4370-b724-6f233014d0d6",
  t2Small: "https://www.data.gouv.fr/fr/datasets/r/7a5faf5f-7e3b-4de6-9f1d-a8e3ad176476",
  elus: "https://www.data.gouv.fr/fr/datasets/r/f736f325-d42b-4ccf-a82c-e97122bc4861",
};

const FIXED_COLS = 18;

// ── Election metadata ───────────────────────────────────────────────────────

const ELECTION_SLUG = "municipales-2020";
const ELECTION_META = {
  slug: ELECTION_SLUG,
  type: "MUNICIPALES" as const,
  scope: "MUNICIPAL" as const,
  title: "Elections municipales 2020",
  shortTitle: "Municipales 2020",
  round1Date: new Date("2020-03-15"),
  round2Date: new Date("2020-06-28"),
  dateConfirmed: true,
  status: "COMPLETED" as const,
};

// ── Types ───────────────────────────────────────────────────────────────────

type ListWithRound2 = ListResult & {
  round2Votes?: number;
  round2Pct?: number;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

// ── Main sync function ──────────────────────────────────────────────────────

export async function syncMunicipales2020(statsOnly = false) {
  console.log("=== Municipales 2020 — Import ===\n");

  // ── Step 1: Download all 5 files in parallel ──────────────────────────
  console.log("Downloading 5 files from data.gouv.fr...");
  const [bufT1Large, bufT1Small, bufT2Large, bufT2Small, bufElus] = await Promise.all([
    downloadBuffer(URLS.t1Large),
    downloadBuffer(URLS.t1Small),
    downloadBuffer(URLS.t2Large),
    downloadBuffer(URLS.t2Small),
    downloadBuffer(URLS.elus),
  ]);
  console.log(
    `  Downloaded: T1L=${bufT1Large.length}B, T1S=${bufT1Small.length}B, ` +
      `T2L=${bufT2Large.length}B, T2S=${bufT2Small.length}B, elus=${bufElus.length}B`
  );

  // ── Step 2: Parse T1 files ────────────────────────────────────────────
  console.log("\nParsing T1 results...");
  const rowsT1Large = decodeAndSplit(bufT1Large, "\t");
  const rowsT1Small = decodeAndSplit(bufT1Small, ";");

  const t1Results: CommuneResult[] = [];
  for (const cols of rowsT1Large) {
    if (cols.length < FIXED_COLS) continue;
    t1Results.push(parseWideResultRow(cols));
  }
  for (const cols of rowsT1Small) {
    if (cols.length < FIXED_COLS) continue;
    t1Results.push(parseWideResultRow(cols));
  }
  console.log(`  T1: ${t1Results.length} communes parsed`);

  // ── Step 3: Parse T2 files ────────────────────────────────────────────
  console.log("Parsing T2 results...");
  const rowsT2Large = decodeAndSplit(bufT2Large, ";");
  const rowsT2Small = decodeAndSplit(bufT2Small, ";");

  const t2Results: CommuneResult[] = [];
  for (const cols of rowsT2Large) {
    if (cols.length < FIXED_COLS) continue;
    t2Results.push(parseWideResultRow(cols));
  }
  for (const cols of rowsT2Small) {
    if (cols.length < FIXED_COLS) continue;
    t2Results.push(parseWideResultRow(cols));
  }
  console.log(`  T2: ${t2Results.length} communes parsed`);

  // ── Step 4: Build T1 index by commune+list for round2 merge ───────────
  console.log("Merging T2 into T1 entries...");

  // Map: inseeCode -> Map<panelNumber, ListWithRound2>
  const t1Index = new Map<string, Map<number, ListWithRound2>>();
  for (const commune of t1Results) {
    const listMap = new Map<number, ListWithRound2>();
    for (const list of commune.lists) {
      listMap.set(list.panelNumber, list as ListWithRound2);
    }
    t1Index.set(commune.inseeCode, listMap);
  }

  let mergedCount = 0;
  for (const commune of t2Results) {
    const listMap = t1Index.get(commune.inseeCode);
    if (!listMap) continue;
    for (const list of commune.lists) {
      const match = listMap.get(list.panelNumber);
      if (match) {
        match.round2Votes = list.votes;
        match.round2Pct = list.pctExpressed;
        mergedCount++;
      }
    }
  }
  console.log(`  Merged ${mergedCount} round-2 results`);

  // ── Step 5: Parse elected officials ───────────────────────────────────
  console.log("Parsing elected officials...");
  const elusRows = decodeAndSplit(bufElus, "\t");
  // Build set of "inseeCode|lastName|firstName" for elected officials
  const elusSet = new Set<string>();

  for (const cols of elusRows) {
    if (cols.length < 6) continue;
    const deptCode = cols[0]?.trim() ?? "";
    const communeCode = cols[1]?.trim() ?? "";
    const lastName = cols[4]?.trim() ?? "";
    const firstName = cols[5]?.trim() ?? "";

    if (!deptCode || !communeCode || !lastName) continue;

    const inseeCode = reconstructInseeCode(deptCode, communeCode);
    elusSet.add(`${inseeCode}|${lastName.toUpperCase()}|${firstName.toUpperCase()}`);
  }
  console.log(`  Elus: ${elusSet.size} elected officials parsed`);

  // ── Step 6: Load existing communes from DB ────────────────────────────
  console.log("Loading communes from DB...");
  const communes = await db.commune.findMany({ select: { id: true } });
  const communeSet = new Set(communes.map((c: { id: string }) => c.id));
  console.log(`  ${communeSet.size} communes in DB`);

  // ── Build candidacy entries ───────────────────────────────────────────
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

    for (const list of commune.lists) {
      const r2 = list as ListWithRound2;
      const candidateName = `${list.firstName} ${list.lastName}`;
      const partyLabel = NUANCE_POLITIQUE_MAPPING[list.nuanceCode] ?? (list.nuanceCode || null);

      // Check if this candidate is elected
      const eluKey = `${commune.inseeCode}|${list.lastName.toUpperCase()}|${list.firstName.toUpperCase()}`;
      const isElected = elusSet.has(eluKey);

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
        isElected,
      });
    }
  }

  console.log(`  ${entries.length} candidacy entries built`);
  console.log(`  ${skippedNoCommune} communes skipped (not in DB)`);

  // ── Compute national participation stats ──────────────────────────────
  let t1Registered = 0;
  let t1Voters = 0;
  let t1Blank = 0;
  let t1Null = 0;
  for (const c of t1Results) {
    t1Registered += c.registeredVoters;
    t1Voters += c.actualVoters;
    t1Blank += c.blankVotes;
    t1Null += c.nullVotes;
  }
  const t1Rate = t1Registered > 0 ? (t1Voters / t1Registered) * 100 : 0;

  let t2Registered = 0;
  let t2Voters = 0;
  let t2Blank = 0;
  let t2Null = 0;
  for (const c of t2Results) {
    t2Registered += c.registeredVoters;
    t2Voters += c.actualVoters;
    t2Blank += c.blankVotes;
    t2Null += c.nullVotes;
  }
  const t2Rate = t2Registered > 0 ? (t2Voters / t2Registered) * 100 : 0;

  console.log(
    `\nParticipation: T1=${t1Rate.toFixed(2)}% (${t1Voters}/${t1Registered}), ` +
      `T2=${t2Rate.toFixed(2)}% (${t2Voters}/${t2Registered})`
  );

  // ── Stats-only mode ───────────────────────────────────────────────────
  if (statsOnly) {
    console.log("\n[STATS ONLY — no DB writes]");
    console.log(`  T1 communes: ${t1Results.length}`);
    console.log(`  T2 communes: ${t2Results.length}`);
    console.log(`  Elected officials: ${elusSet.size}`);
    console.log(`  Candidacy entries: ${entries.length}`);
    console.log(`  Communes skipped (not in DB): ${skippedNoCommune}`);
    console.log(`  Elected candidates matched: ${entries.filter((e) => e.isElected).length}`);
    await db.$disconnect();
    return;
  }

  // ── Step 7: Upsert election record ────────────────────────────────────
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

  // ── Step 8: Delete existing candidacies for this election ─────────────
  console.log("Deleting existing candidacies for this election...");
  const deleted = await db.candidacy.deleteMany({
    where: { electionId: election.id },
  });
  console.log(`  Deleted ${deleted.count} existing candidacies`);

  // ── Step 9: Bulk insert candidacies via raw SQL ───────────────────────
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

  // ── Step 10: Create ElectionRound records ─────────────────────────────
  console.log("Creating ElectionRound records...");

  // Delete existing rounds for this election
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
        blankVotes: t1Blank,
        nullVotes: t1Null,
      },
      {
        electionId: election.id,
        round: 2,
        date: ELECTION_META.round2Date,
        registeredVoters: t2Registered,
        actualVoters: t2Voters,
        participationRate: parseFloat(t2Rate.toFixed(2)),
        blankVotes: t2Blank,
        nullVotes: t2Null,
      },
    ],
  });
  console.log("  Created round 1 and round 2 records");

  // ── Done ──────────────────────────────────────────────────────────────
  console.log(`\n=== Import complete ===`);
  console.log(`  Candidacies inserted: ${inserted}`);
  console.log(`  Elected: ${entries.filter((e) => e.isElected).length}`);
  console.log(`  Communes covered: ${new Set(entries.map((e) => e.communeId)).size}`);

  await db.$disconnect();
}
