#!/usr/bin/env tsx
/**
 * Retrofit script: rescan existing PUBLISHED affairs against the new
 * affair-matching resolver and flag ones where the resolver disagrees with
 * the current politician link.
 *
 * Read-only. Writes data/retrofit-flags.json with non-AGREES cases.
 *
 * Usage:
 *   npx dotenv -e .env -- npx tsx scripts/rescan-affair-politicians.ts
 *   npx dotenv -e .env -- npx tsx scripts/rescan-affair-politicians.ts --limit=500
 *   npx dotenv -e .env -- npx tsx scripts/rescan-affair-politicians.ts --since=2024-01-01
 *   npx dotenv -e .env -- npx tsx scripts/rescan-affair-politicians.ts --verbose
 */
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { scoreAffairAgainstCandidates } from "@/lib/affair-matching";
import { loadCandidatePool, loadSurnameVocabulary } from "@/lib/affair-matching/persistence";
import { CandidatePrefilter } from "@/lib/affair-matching/candidate-prefilter";
import { SourceType } from "@/generated/prisma";

type FlagType = "AGREES" | "DIFFERENT_WINNER" | "UNDECIDED" | "NO_MATCH";

interface FlagEntry {
  affairId: string;
  affairTitle: string;
  currentPoliticianId: string;
  currentPoliticianName: string | null;
  resolverTopCandidateId: string | null;
  resolverTopCandidateName: string | null;
  judgment: string;
  topScore: number;
  gap: number;
  flag: FlagType;
  createdAt: string;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const sinceArg = args.find((a) => a.startsWith("--since="));
  const verbose = args.includes("--verbose");
  return {
    limit: limitArg ? Number(limitArg.split("=")[1]) : undefined,
    since: sinceArg ? new Date(sinceArg.split("=")[1] ?? "") : undefined,
    verbose,
  };
}

async function main() {
  const { limit, since, verbose } = parseArgs();

  console.log("[retrofit] Loading politician pool...");
  const pool = await loadCandidatePool();
  const vocabulary = await loadSurnameVocabulary();
  const poolById = new Map(pool.map((p) => [p.id, p]));
  console.log(`[retrofit] Loaded ${pool.length} politicians`);

  const prefilter = new CandidatePrefilter(pool);

  const where: Record<string, unknown> = { publicationStatus: "PUBLISHED" };
  if (since) where.createdAt = { gte: since };

  const total = await db.affair.count({ where });
  const toScan = limit ? Math.min(limit, total) : total;
  console.log(`[retrofit] Scanning ${toScan} of ${total} PUBLISHED affairs`);

  const BATCH_SIZE = 200;
  const flags: FlagEntry[] = [];
  const counters: Record<FlagType, number> = {
    AGREES: 0,
    DIFFERENT_WINNER: 0,
    UNDECIDED: 0,
    NO_MATCH: 0,
  };

  let processed = 0;
  let skip = 0;

  while (processed < toScan) {
    const take = Math.min(BATCH_SIZE, toScan - processed);
    const batch = await db.affair.findMany({
      where,
      take,
      skip,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        factsDate: true,
        createdAt: true,
        politicianId: true,
        politician: { select: { id: true, firstName: true, lastName: true } },
        sources: { take: 2, select: { title: true, excerpt: true } },
      },
    });

    if (batch.length === 0) break;

    for (const affair of batch) {
      const sourceText = affair.sources
        .map((s) => [s.title, s.excerpt].filter(Boolean).join(" "))
        .filter(Boolean)
        .join(" ");
      const text = [affair.title, affair.description, sourceText].filter(Boolean).join("\n\n");

      if (!text || text.length < 20) {
        processed++;
        continue;
      }

      const prefiltered = prefilter.filter(text);
      const currentPol = poolById.get(affair.politicianId);
      if (currentPol && !prefiltered.some((c) => c.id === currentPol.id)) {
        prefiltered.push(currentPol);
      }

      const decision = scoreAffairAgainstCandidates(
        {
          text,
          metadata: {
            source: SourceType.MANUAL,
            factsDate: affair.factsDate,
            sourceRef: `retrofit:${affair.id}`,
          },
        },
        prefiltered,
        vocabulary
      );

      const top = decision.topCandidates[0];
      let flag: FlagType;
      if (decision.judgment === "SAME") {
        flag = top?.candidateId === affair.politicianId ? "AGREES" : "DIFFERENT_WINNER";
      } else if (decision.judgment === "UNDECIDED") {
        flag = "UNDECIDED";
      } else {
        flag = "NO_MATCH";
      }
      counters[flag]++;

      if (flag !== "AGREES") {
        const topPol = top ? poolById.get(top.candidateId) : undefined;
        flags.push({
          affairId: affair.id,
          affairTitle: affair.title,
          currentPoliticianId: affair.politicianId,
          currentPoliticianName: affair.politician
            ? `${affair.politician.firstName} ${affair.politician.lastName}`
            : null,
          resolverTopCandidateId: top?.candidateId ?? null,
          resolverTopCandidateName: topPol ? `${topPol.firstName} ${topPol.lastName}` : null,
          judgment: decision.judgment,
          topScore: decision.topScore,
          gap: decision.gap,
          flag,
          createdAt: affair.createdAt.toISOString(),
        });
      }

      if (verbose) {
        const topPol = top ? poolById.get(top.candidateId) : undefined;
        const topName = topPol ? `${topPol.firstName} ${topPol.lastName}` : "(none)";
        console.log(
          `  [${flag}] ${affair.title.slice(0, 70)} : ${decision.judgment} score=${decision.topScore.toFixed(1)} gap=${decision.gap.toFixed(1)} top=${topName}`
        );
      }

      processed++;
    }

    skip += batch.length;
    console.log(`[retrofit] Processed ${processed}/${toScan}...`);
  }

  const outDir = path.join(process.cwd(), "data");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "retrofit-flags.json");
  await fs.writeFile(outPath, JSON.stringify(flags, null, 2));

  console.log(`\n[retrofit] Wrote ${flags.length} flags to ${outPath}`);
  console.log("[retrofit] Summary:");
  console.log(`  AGREES:           ${counters.AGREES}`);
  console.log(`  DIFFERENT_WINNER: ${counters.DIFFERENT_WINNER}   (potential miss-links)`);
  console.log(`  UNDECIDED:        ${counters.UNDECIDED}          (low-confidence current links)`);
  console.log(`  NO_MATCH:         ${counters.NO_MATCH}           (orphan affairs)`);
  console.log(`  TOTAL processed:  ${processed}`);

  if (flags.length > 0) {
    const byFlag = (f: FlagType) => flags.filter((e) => e.flag === f).slice(0, 3);

    const diffWinners = byFlag("DIFFERENT_WINNER");
    if (diffWinners.length > 0) {
      console.log("\n[retrofit] Sample DIFFERENT_WINNER cases:");
      for (const entry of diffWinners) {
        console.log(
          `  ${entry.affairTitle.slice(0, 60)} : current=${entry.currentPoliticianName ?? "?"} resolver=${entry.resolverTopCandidateName ?? "none"} score=${entry.topScore.toFixed(1)}`
        );
      }
    }

    const undecided = byFlag("UNDECIDED");
    if (undecided.length > 0) {
      console.log("\n[retrofit] Sample UNDECIDED cases:");
      for (const entry of undecided) {
        console.log(
          `  ${entry.affairTitle.slice(0, 60)} : current=${entry.currentPoliticianName ?? "?"} score=${entry.topScore.toFixed(1)}`
        );
      }
    }

    const noMatch = byFlag("NO_MATCH");
    if (noMatch.length > 0) {
      console.log("\n[retrofit] Sample NO_MATCH cases:");
      for (const entry of noMatch) {
        console.log(
          `  ${entry.affairTitle.slice(0, 60)} : current=${entry.currentPoliticianName ?? "?"}`
        );
      }
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
