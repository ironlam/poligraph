#!/usr/bin/env tsx
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PRESIDENTIAL_SEARCH_EVALUATION_CASES } from "@/config/presidential-search-evaluation";
import { parseCLIOptions } from "@/lib/cli/parse-options";
import { db } from "@/lib/db";
import {
  buildPresidentialSearchEvaluationReport,
  evaluatePresidentialSearchCase,
} from "@/lib/presidentielle/search-evaluation";
import { searchPresidentialCorpus } from "@/services/presidentielle/corpus-search";
import type { PresidentialSearchStrategy } from "@/services/presidentielle/hybrid-search";

const REPORT_DIR = path.resolve(".tmp/presidential-search-evaluation");

function parseOptions(args: string[]): {
  electionSlug: string;
  topK: number;
  limit: number;
  strategy: PresidentialSearchStrategy;
} {
  const parsed = parseCLIOptions(args, [
    { name: "--election", type: "string" },
    { name: "--top-k", type: "number" },
    { name: "--limit", type: "number" },
    { name: "--strategy", type: "string" },
  ]);
  const electionSlug =
    typeof parsed.election === "string" ? parsed.election : "presidentielle-2027";
  const topK = typeof parsed.topK === "number" ? parsed.topK : 5;
  const limit = typeof parsed.limit === "number" ? parsed.limit : 12;
  const strategy =
    parsed.strategy === "hybrid" || parsed.strategy === "semantic" ? parsed.strategy : "lexical";
  if (
    parsed.strategy !== undefined &&
    parsed.strategy !== "lexical" &&
    parsed.strategy !== "hybrid" &&
    parsed.strategy !== "semantic"
  ) {
    throw new Error("--strategy doit valoir lexical, semantic ou hybrid");
  }
  if (!Number.isInteger(topK) || topK < 1 || topK > 20) {
    throw new Error("--top-k doit être un entier compris entre 1 et 20");
  }
  if (!Number.isInteger(limit) || limit < topK || limit > 50) {
    throw new Error("--limit doit être un entier compris entre --top-k et 50");
  }
  return { electionSlug, topK, limit, strategy };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const evaluations = [];

  for (const testCase of PRESIDENTIAL_SEARCH_EVALUATION_CASES) {
    const startedAt = performance.now();
    const result = await searchPresidentialCorpus(
      options.electionSlug,
      testCase.query,
      options.limit,
      { strategy: options.strategy }
    );
    if (result === null) throw new Error(`Élection introuvable : ${options.electionSlug}`);
    const evaluation = evaluatePresidentialSearchCase({
      testCase,
      result,
      latencyMs: Math.round(performance.now() - startedAt),
      topK: options.topK,
    });
    evaluations.push(evaluation);
    console.log(
      `[search:evaluate] ${evaluation.passed ? "OK" : "ECHEC"} ${testCase.id} ` +
        `results=${evaluation.returned} latency=${evaluation.latencyMs}ms`
    );
  }

  const report = buildPresidentialSearchEvaluationReport({
    electionSlug: options.electionSlug,
    topK: options.topK,
    cases: evaluations,
    strategy: options.strategy,
  });
  await mkdir(REPORT_DIR, { recursive: true });
  const timestamp = report.generatedAt.replace(/[:.]/g, "-");
  const reportPath = path.join(REPORT_DIR, `${timestamp}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    `[search:evaluate] recall@${options.topK}=${report.metrics.recallAtK.toFixed(3)} ` +
      `precision@${options.topK}=${report.metrics.precisionAtK.toFixed(3)} ` +
      `zero=${report.metrics.zeroResultRate.toFixed(3)} p95=${report.metrics.latencyP95Ms}ms`
  );
  console.log(`[search:evaluate] rapport : ${reportPath}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
