/**
 * Gated catch-up tool for the scrutin -> amendment linker (recent-scrutin
 * backlog). User-accord-gated: report-only by default, `--apply` performs
 * real writes against the production database (see CLAUDE.local.md — .env
 * and .env.prod point at the same Supabase instance). Do NOT run in CI.
 *
 * Reconciliation (given, not recomputed by this tool): the recent unlinked
 * votes since the default --since cutoff are 476 AMENDEMENT (all with a
 * dossier — the linkable candidates) + 63 non-amendment (ARTICLE/MOTION/
 * FINAL/AUTRE — out of the linker's scope). Success criterion is
 * `recentLinkableUnlinked -> 0`, NOT raw unlinked = 0: the 63 non-amendment
 * votes are expected to stay unlinked forever.
 *
 * linkScrutinsToAmendments has no cursor: `limit` always selects the top-N
 * most recent scrutins (by votingDate) for the legislature, not an
 * unprocessed slice. Re-running it with the same options re-scans the same
 * rows (idempotent, harmless). So --batch should be set comfortably above
 * the reported linkableCandidates count to cover the whole catch-up window
 * in a single effective pass; the iteration loop mainly guards against a
 * batch that turns out to be too small, or a genuinely stuck backlog.
 *
 * Usage:
 *   npx dotenv -e .env -- npx tsx scripts/backfill-scrutin-amendment-links.ts
 *   npx dotenv -e .env -- npx tsx scripts/backfill-scrutin-amendment-links.ts --apply
 *   npx dotenv -e .env -- npx tsx scripts/backfill-scrutin-amendment-links.ts --apply --since=2026-06-28 --batch=600
 */
import { db } from "@/lib/db";
import { linkScrutinsToAmendments } from "@/services/sync/link-scrutins-to-amendments";
import { evaluateLinkLoopStep } from "@/services/sync/link-scrutins-to-amendments/backfill-loop";

const OUT_OF_SCOPE_TYPES = ["ARTICLE", "MOTION", "FINAL", "AUTRE"] as const;

export interface BackfillLinksArgs {
  apply: boolean;
  since: string;
  batch: number;
  maxIterations: number;
  legislature: number;
}

export function parseArgs(argv: string[]): BackfillLinksArgs {
  const val = (f: string) =>
    argv
      .find((a) => a.startsWith(`${f}=`))
      ?.split("=")
      .slice(1)
      .join("=");
  return {
    apply: argv.includes("--apply"),
    since: val("--since") ?? "2026-06-28",
    batch: Number(val("--batch") ?? 200),
    maxIterations: Number(val("--max-iterations") ?? 50),
    legislature: Number(val("--legislature") ?? 17),
  };
}

interface ClassificationReport {
  since: string;
  legislature: number;
  linkableCount: number;
  outOfScopeByType: Record<string, number>;
  amendementNoDossierCount: number;
}

/**
 * Classifies the recent unlinked votes (read-only, no writes) into:
 * - linkableCandidates: AMENDEMENT + dossier, still unlinked — the linker's target.
 * - outOfScopeByType: ARTICLE/MOTION/FINAL/AUTRE — not amendment votes, out of pipeline scope.
 * - amendementNoDossier: AMENDEMENT with no dossier — cannot be scoped safely, out of reach for now.
 */
async function classifyRecentUnlinked(
  legislature: number,
  sinceDate: Date
): Promise<ClassificationReport> {
  const recentUnlinkedWhere = {
    legislature,
    votingDate: { gte: sinceDate },
    amendmentLinks: { none: {} },
  };

  const [linkableCount, outOfScopeGroups, amendementNoDossierCount] = await Promise.all([
    db.scrutin.count({
      where: { ...recentUnlinkedWhere, type: "AMENDEMENT", dossierLegislatifId: { not: null } },
    }),
    db.scrutin.groupBy({
      by: ["type"],
      where: { ...recentUnlinkedWhere, type: { in: [...OUT_OF_SCOPE_TYPES] } },
      _count: true,
    }),
    db.scrutin.count({
      where: { ...recentUnlinkedWhere, type: "AMENDEMENT", dossierLegislatifId: null },
    }),
  ]);

  const outOfScopeByType: Record<string, number> = {};
  for (const t of OUT_OF_SCOPE_TYPES) outOfScopeByType[t] = 0;
  for (const g of outOfScopeGroups) {
    if (g.type) outOfScopeByType[g.type] = g._count;
  }

  return {
    since: sinceDate.toISOString().slice(0, 10),
    legislature,
    linkableCount,
    outOfScopeByType,
    amendementNoDossierCount,
  };
}

function printReport(report: ClassificationReport): void {
  console.log(
    `[backfill] recent-unlinked classification  since=${report.since}  legislature=${report.legislature}`
  );
  console.log(`  linkableCandidates (AMENDEMENT + dossier, unlinked): ${report.linkableCount}`);
  console.log("  outOfScopeByType (not amendment votes, out of pipeline scope):");
  for (const [type, count] of Object.entries(report.outOfScopeByType)) {
    console.log(`    ${type}: ${count}`);
  }
  console.log(
    `  amendementNoDossier (AMENDEMENT sans dossier identifiable): ${report.amendementNoDossierCount}`
  );
}

/** Fetches the still-unlinked linkable candidates for the stuck-backlog error report. */
async function fetchLinkableCandidates(legislature: number, sinceDate: Date, take = 50) {
  return db.scrutin.findMany({
    where: {
      legislature,
      votingDate: { gte: sinceDate },
      amendmentLinks: { none: {} },
      type: "AMENDEMENT",
      dossierLegislatifId: { not: null },
    },
    select: {
      externalId: true,
      title: true,
      dossierLegislatif: { select: { number: true, externalId: true } },
    },
    take,
    orderBy: { votingDate: "desc" },
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sinceDate = new Date(`${args.since}T00:00:00.000Z`);
  if (Number.isNaN(sinceDate.getTime())) {
    throw new Error(`[backfill] invalid --since date: ${args.since}`);
  }

  console.log(
    `[backfill] scrutin-amendment link backfill  apply=${args.apply}  since=${args.since}  batch=${args.batch}  max-iterations=${args.maxIterations}  legislature=${args.legislature}`
  );

  const initialReport = await classifyRecentUnlinked(args.legislature, sinceDate);
  printReport(initialReport);

  if (!args.apply) {
    console.log("[backfill] report-only (pass --apply to link)");
    await db.$disconnect();
    return;
  }

  // The linker has no cursor: it always re-scans the top-N most recent
  // scrutins. A --batch below the linkable-candidate count re-scans the same
  // rows every iteration and reports a false "backlog stuck". Floor the
  // effective batch so a single pass can cover the whole catch-up window.
  const effectiveBatch = Math.max(args.batch, initialReport.linkableCount + 50);
  if (effectiveBatch !== args.batch) {
    console.log(
      `[backfill] raising --batch=${args.batch} to effective batch=${effectiveBatch} ` +
        `(linkableCandidates=${initialReport.linkableCount} + 50 margin)`
    );
  } else {
    console.log(`[backfill] effective batch=${effectiveBatch}`);
  }

  for (let iteration = 1; ; iteration++) {
    const stats = await linkScrutinsToAmendments({
      legislature: args.legislature,
      limit: effectiveBatch,
    });
    const current = await classifyRecentUnlinked(args.legislature, sinceDate);
    console.log(
      `[backfill] iter ${iteration}: scanned=${stats.scrutinsScanned} linked=${stats.scrutinsLinked} linksCreated=${stats.linksCreated} linkableRemaining=${current.linkableCount}`
    );

    const decision = evaluateLinkLoopStep({
      linksCreatedThisIteration: stats.linksCreated,
      recentLinkableUnlinked: current.linkableCount,
      iteration,
      maxIterations: args.maxIterations,
    });

    if (decision.action === "continue") continue;

    if (decision.action === "done") {
      console.log(`[backfill] done: ${decision.reason}`);
      printReport(current);
      await db.$disconnect();
      return;
    }

    // decision.action === "error"
    console.error(`[backfill] error: ${decision.reason}`);
    const stuck = await fetchLinkableCandidates(args.legislature, sinceDate);
    console.error(`[backfill] stuck linkable candidates (up to ${stuck.length} shown):`);
    for (const s of stuck) {
      const dossierRef = s.dossierLegislatif?.number ?? s.dossierLegislatif?.externalId ?? "?";
      console.error(`  ${s.externalId}  dossier=${dossierRef}  ${s.title.slice(0, 100)}`);
    }
    await db.$disconnect();
    process.exitCode = 1;
    return;
  }
}

// Guarded so importing this module never touches the database: main() only
// runs when this file is the process entry point, not on import.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
