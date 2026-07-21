/**
 * One-shot historical backfill for the scrutin -> dossier reconciliation (#477).
 *
 * Fail-closed by design:
 * - Defaults to dry-run (read-only). Writing requires BOTH --apply and
 *   --confirm-production, because .env / .env.prod point at the same database
 *   (see CLAUDE.local.md): there is no separate dev DB to rehearse against.
 * - reconcileScrutinDossier is called with applyMutations:false, so it only
 *   PLANS transitions; it writes nothing itself. Phase A (repairScrutinDossier)
 *   is the only thing that performs the dossierLegislatifId write, atomically
 *   with the title STALE transition. A dry-run therefore makes zero writes.
 * - Expectation guards (--expected-repoints/new-links/clears) abort before any
 *   write if the planned counts do not match what the operator expects from
 *   the pre-run dry-run numbers.
 * - The per-item repair loop is guarded: one failing transition is logged and
 *   skipped rather than aborting the whole backfill. Because the reconciler
 *   recomputes transitions fresh against live DB state each run, a repaired
 *   scrutin becomes NOOP on the next run and drops out of appliedTransitions
 *   on its own; the backfill is naturally resumable by re-running it.
 */
import { writeFileSync } from "fs";

export interface BackfillArgs {
  apply: boolean;
  applyClears: boolean;
  regenerate: boolean;
  retryFailed: boolean;
  regenBatch: number;
  expectedRepoints?: number;
  expectedNewLinks?: number;
  expectedClears?: number;
  reportPath: string;
}

export function parseBackfillArgs(argv: string[]): BackfillArgs {
  const has = (f: string) => argv.includes(f);
  const num = (f: string) => {
    const hit = argv.find((a) => a.startsWith(`${f}=`));
    return hit ? Number(hit.split("=")[1]) : undefined;
  };
  const apply = has("--apply");
  if (apply && !has("--confirm-production")) {
    throw new Error("--apply requires --confirm-production (this DB is production)");
  }
  return {
    apply,
    applyClears: has("--apply-clears"),
    regenerate: has("--regenerate"),
    retryFailed: has("--retry-failed"),
    regenBatch: num("--regen-batch") ?? 25,
    expectedRepoints: num("--expected-repoints"),
    expectedNewLinks: num("--expected-new-links"),
    expectedClears: num("--expected-clears"),
    reportPath:
      argv.find((a) => a.startsWith("--report="))?.split("=")[1] ??
      "scripts/.local/backfill-477-report.json",
  };
}

async function main() {
  const args = parseBackfillArgs(process.argv.slice(2));
  const { db } = await import("@/lib/db");
  const { reconcileScrutinDossier } = await import("@/services/sync/reconcile-scrutin-dossier");
  const { repairScrutinDossier, drainDossierRepointRegen, requeueLinklessTitlesWithLinks } =
    await import("@/services/sync/reconcile-scrutin-dossier/remediate");

  // Sanitised DB identity (no credentials).
  const url = new URL(process.env.DATABASE_URL ?? "postgres://unknown/unknown");
  console.log(
    `[backfill] DB target: ${url.host}${url.pathname}  apply=${args.apply} clears=${args.applyClears}`
  );

  const repairRunId = "backfill-477";
  // applyMutations:false -> the reconciler only PLANS (writes nothing). Phase A
  // (repairScrutinDossier) performs the dossierLegislatifId write atomically with
  // the title STALE. So a dry-run (no --apply) is fully read-only.
  const result = await reconcileScrutinDossier({
    applyClears: args.applyClears,
    applyMutations: false,
    repairRunId,
  });

  const repoints = result.appliedTransitions.filter((t) => t.action === "REPOINT").length;
  const newLinks = result.appliedTransitions.filter((t) => t.action === "NEW_LINK").length;
  const clears = result.appliedTransitions.filter((t) => t.action === "CLEAR").length;
  console.log(
    `[backfill] planned repoints=${repoints} new-links=${newLinks} clears=${clears} ambiguous(kept)=${
      result.decisions.filter((d) => d.action === "KEEP").length
    }`
  );

  const guardFail =
    (args.expectedRepoints !== undefined && args.expectedRepoints !== repoints) ||
    (args.expectedNewLinks !== undefined && args.expectedNewLinks !== newLinks) ||
    (args.expectedClears !== undefined && args.expectedClears !== clears);
  if (guardFail) throw new Error("[backfill] expectation guard mismatch; aborting");

  // Persist the resumable report BEFORE any regen so resume can rely on it.
  const report = result.appliedTransitions.map((t) => ({
    transition: t,
    repairStatus: "PENDING",
    attempts: 0,
  }));
  writeFileSync(args.reportPath, JSON.stringify({ repairRunId, report }, null, 2));

  if (!args.apply) {
    console.log("[backfill] dry-run only. Re-run with --apply --confirm-production to write.");
    await db.$disconnect();
    return;
  }

  // Phase A does the dossier write + title/link repair per applied transition
  // (atomic STALE-then-write in A1; the reconciler wrote nothing above).
  // Per-item guard: one failing transition must not abort the whole backfill:
  // log it and continue. A re-run resumes it (the reconciler is idempotent, so
  // a repaired scrutin becomes NOOP and drops out of appliedTransitions next run).
  const repairCounts: Record<string, number> = {};
  for (const t of result.appliedTransitions) {
    try {
      const r = await repairScrutinDossier(t, repairRunId);
      repairCounts[r.repairStatus] = (repairCounts[r.repairStatus] ?? 0) + 1;
    } catch (e) {
      repairCounts.THREW = (repairCounts.THREW ?? 0) + 1;
      console.error(`[backfill] repair threw for ${t.externalId}: ${String(e)}`);
    }
  }
  console.log(`[backfill] repair statuses: ${JSON.stringify(repairCounts)}`);
  await requeueLinklessTitlesWithLinks();

  if (args.regenerate) {
    let drained = { claimed: 0, regenerated: 0, failed: 0 };
    // Loop the bounded drain until the queue empties (resumable across restarts via DB state).
    for (;;) {
      const r = await drainDossierRepointRegen({ limit: args.regenBatch });
      drained = {
        claimed: drained.claimed + r.claimed,
        regenerated: drained.regenerated + r.regenerated,
        failed: drained.failed + r.failed,
      };
      if (r.claimed === 0) break;
    }
    console.log(`[backfill] regen: ${JSON.stringify(drained)}`);
  }
  await db.$disconnect();
}

// Guarded so importing this module (e.g. from the parseBackfillArgs unit test)
// never touches the database: main() only runs when this file is the process
// entry point, not on import.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
