/**
 * Phase 5b verification script — read-only against production.
 *
 * Shows:
 *   1. Vote index usage stats (pg_stat_user_indexes) — which indexes are hot
 *   2. EXPLAIN ANALYZE on the two critical queries that Phase 5b optimized
 *   3. A plain-language verdict per check
 *
 * Run:  npx dotenv -e .env -- npx tsx scripts/perf-check-vote-denorm.ts
 *   or:  npx dotenv -e .env -- npx tsx scripts/perf-check-vote-denorm.ts <politician-slug>
 */

import { db } from "../src/lib/db";

const DEFAULT_SLUG = process.argv[2];

type IndexStat = {
  indexrelname: string;
  idx_scan: bigint;
  idx_tup_read: bigint;
  idx_tup_fetch: bigint;
  index_size: string;
};

function fmt(n: bigint | number): string {
  return Number(n).toLocaleString("fr-FR");
}

function banner(title: string) {
  const line = "─".repeat(Math.max(60, title.length + 4));
  console.log("\n" + line);
  console.log("  " + title);
  console.log(line);
}

async function showIndexUsage() {
  banner("1. Vote index usage (pg_stat_user_indexes)");

  const rows = await db.$queryRaw<IndexStat[]>`
    SELECT
      indexrelname,
      idx_scan,
      idx_tup_read,
      idx_tup_fetch,
      pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
    FROM pg_stat_user_indexes
    WHERE relname = 'Vote'
    ORDER BY idx_scan DESC
  `;

  const header = ["Index", "scans", "tup_read", "size"] as const;
  console.log(
    `  ${header[0].padEnd(50)} ${header[1].padStart(12)} ${header[2].padStart(14)} ${header[3].padStart(10)}`
  );
  console.log("  " + "─".repeat(90));

  for (const r of rows) {
    console.log(
      `  ${r.indexrelname.padEnd(50)} ${fmt(r.idx_scan).padStart(12)} ${fmt(r.idx_tup_read).padStart(14)} ${r.index_size.padStart(10)}`
    );
  }

  // Verdicts
  const composite = rows.find((r) => r.indexrelname === "Vote_politicianId_chamber_votingDate_idx");
  const dateOnly = rows.find((r) => r.indexrelname === "Vote_politicianId_votingDate_idx");
  const legacy = rows.find((r) => r.indexrelname === "Vote_politicianId_idx");

  console.log("\n  Verdict:");
  if (composite && Number(composite.idx_scan) > 0) {
    console.log(
      `  ✓ [politicianId,chamber,votingDate] composite index IS being used (${fmt(composite.idx_scan)} scans)`
    );
  } else {
    console.log(
      `  ⚠ [politicianId,chamber,votingDate] composite has 0 scans — queries not hitting it yet`
    );
  }
  if (dateOnly && Number(dateOnly.idx_scan) > 0) {
    console.log(
      `  ✓ [politicianId,votingDate] composite index IS being used (${fmt(dateOnly.idx_scan)} scans)`
    );
  } else {
    console.log(
      `  ⚠ [politicianId,votingDate] composite has 0 scans — orderBy queries not hitting it yet`
    );
  }
  if (legacy) {
    const isDead =
      Number(legacy.idx_scan) < Number(composite?.idx_scan ?? 0) + Number(dateOnly?.idx_scan ?? 0);
    if (isDead) {
      console.log(
        `  ✓ Legacy [politicianId] index is colder than composites (${fmt(legacy.idx_scan)} scans) — Task 5b.5 drop is safe once scans plateau`
      );
    } else {
      console.log(
        `  ⚠ Legacy [politicianId] index is still hotter than composites (${fmt(legacy.idx_scan)}) — wait longer before dropping`
      );
    }
  }
}

async function pickPolitician(): Promise<{ id: string; slug: string; fullName: string } | null> {
  if (DEFAULT_SLUG) {
    const p = await db.politician.findUnique({
      where: { slug: DEFAULT_SLUG },
      select: { id: true, slug: true, fullName: true },
    });
    if (!p) {
      console.log(`\n  ⚠ No politician with slug "${DEFAULT_SLUG}" — falling back to auto-pick`);
    } else {
      return p;
    }
  }

  // Auto-pick: a deputy with the most votes (representative case)
  const result = await db.$queryRaw<
    { id: string; slug: string; fullName: string; voteCount: bigint }[]
  >`
    SELECT p.id, p.slug, p."fullName", COUNT(v.id) AS "voteCount"
    FROM "Politician" p
    JOIN "Vote" v ON v."politicianId" = p.id
    WHERE v.chamber = 'AN'
    GROUP BY p.id, p.slug, p."fullName"
    ORDER BY COUNT(v.id) DESC
    LIMIT 1
  `;
  const [r] = result;
  if (!r) return null;
  console.log(`\n  Auto-picked: ${r.fullName} (${fmt(r.voteCount)} votes)`);
  return { id: r.id, slug: r.slug, fullName: r.fullName };
}

async function explainVoteStatsQuery(politicianId: string) {
  banner("2. EXPLAIN ANALYZE — getPoliticianVotingStats critical path");
  console.log("  Query: Vote groupBy position WHERE politicianId + chamber + votingDate range");
  console.log("  (This is the Site 13 query — the biggest win from Phase 5b)\n");

  const start = new Date("2024-07-01");
  const end = new Date("2026-12-31");

  const plan = await db.$queryRaw<{ "QUERY PLAN": string }[]>`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT position, COUNT(*) FROM "Vote"
    WHERE "politicianId" = ${politicianId}
      AND chamber = 'AN'::"Chamber"
      AND "votingDate" >= ${start}
      AND "votingDate" <= ${end}
    GROUP BY position
  `;

  for (const row of plan) {
    console.log("  " + row["QUERY PLAN"]);
  }

  const planText = plan.map((r) => r["QUERY PLAN"]).join("\n");
  console.log("\n  Verdict:");
  if (planText.includes("Vote_politicianId_chamber_votingDate_idx")) {
    console.log(
      "  ✓ Uses the new [politicianId,chamber,votingDate] composite — Phase 5b win confirmed"
    );
  } else if (planText.match(/Index.*Scan.*Vote/)) {
    console.log("  ~ Uses a Vote index but not the target composite — check which one above");
  } else if (planText.includes("Seq Scan")) {
    console.log("  ✗ Sequential scan on Vote — indexes not being used, investigate");
  }
  const execMatch = planText.match(/Execution Time: ([\d.]+) ms/);
  if (execMatch) {
    console.log(`  Execution time: ${execMatch[1]} ms`);
  }
}

async function explainVotesOrderByQuery(politicianId: string) {
  banner("3. EXPLAIN ANALYZE — politician votes page (orderBy votingDate DESC)");
  console.log("  Query: Vote ORDER BY votingDate DESC LIMIT 20 WHERE politicianId = ?");
  console.log("  (This is the Site 7/8 query — politician profile votes tab)\n");

  const plan = await db.$queryRaw<{ "QUERY PLAN": string }[]>`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT id, position, "votingDate", "scrutinId"
    FROM "Vote"
    WHERE "politicianId" = ${politicianId}
    ORDER BY "votingDate" DESC
    LIMIT 20
  `;

  for (const row of plan) {
    console.log("  " + row["QUERY PLAN"]);
  }

  const planText = plan.map((r) => r["QUERY PLAN"]).join("\n");
  console.log("\n  Verdict:");
  if (planText.includes("Vote_politicianId_votingDate_idx")) {
    console.log(
      "  ✓ Uses the new [politicianId,votingDate] composite with backward index scan — no sort step needed"
    );
  } else if (planText.match(/Sort.*Vote/)) {
    console.log(
      "  ⚠ Uses a sort step — ideally the composite should provide pre-sorted rows. Check plan above"
    );
  } else if (planText.includes("Seq Scan")) {
    console.log("  ✗ Sequential scan — investigate");
  }
  const execMatch = planText.match(/Execution Time: ([\d.]+) ms/);
  if (execMatch) {
    console.log(`  Execution time: ${execMatch[1]} ms`);
  }
}

async function showTriggerStatus() {
  banner("4. Trigger status (Phase 5b denorm sync)");

  const rows = await db.$queryRaw<{ tgname: string; tgenabled: string }[]>`
    SELECT tgname, tgenabled::text
    FROM pg_trigger
    WHERE tgrelid = '"Scrutin"'::regclass
      AND NOT tgisinternal
  `;

  if (rows.length === 0) {
    console.log("  ✗ No triggers on Scrutin — denorm sync trigger is MISSING");
    return;
  }

  for (const r of rows) {
    const enabled = r.tgenabled === "O" ? "enabled" : `state=${r.tgenabled}`;
    console.log(`  ${r.tgname}: ${enabled}`);
  }

  const hasTrigger = rows.some((r) => r.tgname === "sync_vote_denorm_from_scrutin_trigger");
  console.log("\n  Verdict:");
  if (hasTrigger) {
    console.log("  ✓ Denorm sync trigger is installed on Scrutin");
  } else {
    console.log("  ✗ sync_vote_denorm_from_scrutin_trigger is MISSING");
  }
}

async function main() {
  console.log("\n═══ Phase 5b performance verification ═══");
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log(`  DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@")}`);

  await showIndexUsage();
  await showTriggerStatus();

  const politician = await pickPolitician();
  if (!politician) {
    console.log("\n  ⚠ No politician found — skipping EXPLAIN checks");
    return;
  }
  console.log(`\n  Using politician: ${politician.fullName} (${politician.slug})`);

  await explainVoteStatsQuery(politician.id);
  await explainVotesOrderByQuery(politician.id);

  console.log("\n═══ Done ═══\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
