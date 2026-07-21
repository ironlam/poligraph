/**
 * One-shot historical backfill for the scrutin -> dossier reconciliation (#477).
 *
 * Fail-closed by design:
 * - Defaults to dry-run (read-only). Writing requires BOTH --apply and
 *   --confirm-production, because .env / .env.prod point at the same database
 *   (see CLAUDE.local.md): there is no separate dev DB to rehearse against.
 * - reconcileScrutinDossier is plan-only: it computes transitions but writes
 *   nothing itself. Phase A (repairScrutinDossier) is the only thing that
 *   performs the dossierLegislatifId write, atomically with the title STALE
 *   transition. A dry-run therefore makes zero writes.
 * - Expectation guards (--expected-repoints/new-links/clears) abort before any
 *   write if the planned counts do not match what the operator expects from
 *   the pre-run dry-run numbers.
 * - The per-item repair loop is guarded: one failing transition is logged and
 *   skipped rather than aborting the whole backfill. Because the reconciler
 *   recomputes transitions fresh against live DB state each run, a repaired
 *   scrutin becomes NOOP on the next run and drops out of appliedTransitions
 *   on its own; the backfill is naturally resumable by re-running it (no
 *   separate --retry-failed flag needed).
 *
 * Staged rollout scoping (#477):
 * - --only-external-ids=<csv> is the SELECTOR: restricts the run to those
 *   scrutins (e.g. 4 scrutins, then a sitting-cluster, then all), through the
 *   identical code path above. Absent -> all applied transitions, unchanged.
 * - --limit=<N> is a deterministic safety CAP only: it aborts if the
 *   resolved in-scope count exceeds it, it never selects or truncates.
 * - selectBackfillScope (pure, unit-tested) resolves the scope and reports
 *   any unknown externalId, empty resolved scope, or over-cap as an error
 *   that aborts BEFORE any write and BEFORE the report file is written.
 * - The regen/requeue drain is scoped the same way, so a Stage-1 run cannot
 *   touch out-of-scope rows (see remediate.ts).
 *
 * --regen-only mode:
 * - Once Phase A has repaired a scrutin, the reconciler classifies it NOOP on
 *   the next run (the dossier pointer no longer differs), so it drops out of
 *   appliedTransitions and --only-external-ids resolves to zero. There was no
 *   way to regenerate an already-repaired scope without re-running the whole
 *   reconciliation. --regen-only skips the ZIP download and reconciliation
 *   entirely and drains the regen queue for a scope built from either
 *   --only-external-ids (resolved to scrutinIds via the DB) or --from-report
 *   (the scrutinIds already recorded in a prior report file).
 * - resolveRegenScope (pure, unit-tested) validates that exactly one scope
 *   source was given and that it is non-empty. Unknown-externalId detection
 *   and missing/invalid report files are checked in main() (DB/fs access),
 *   and abort before any write.
 * - In --regen-only, --limit is repurposed as the per-drain-batch size (same
 *   meaning as --regen-batch), not the safety cap it is in the normal path:
 *   resolveRegenBatchSize prefers an explicit --regen-batch, else --limit,
 *   else a default of 25.
 */
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { dirname } from "path";
import type { ScrutinDossierTransition } from "@/services/sync/reconcile-scrutin-dossier/types";

export interface BackfillArgs {
  apply: boolean;
  applyClears: boolean;
  regenerate: boolean;
  regenBatch: number;
  regenOnly: boolean;
  fromReport?: string;
  onlyExternalIds?: string[];
  limit?: number;
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
  const onlyExternalIdsFlag = argv.find((a) => a.startsWith("--only-external-ids="));
  const onlyExternalIds = onlyExternalIdsFlag
    ? onlyExternalIdsFlag
        .slice("--only-external-ids=".length)
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    : undefined;
  return {
    apply,
    applyClears: has("--apply-clears"),
    regenerate: has("--regenerate"),
    regenBatch: num("--regen-batch") ?? 25,
    regenOnly: has("--regen-only"),
    fromReport: argv.find((a) => a.startsWith("--from-report="))?.split("=")[1],
    onlyExternalIds,
    limit: num("--limit"),
    expectedRepoints: num("--expected-repoints"),
    expectedNewLinks: num("--expected-new-links"),
    expectedClears: num("--expected-clears"),
    reportPath:
      argv.find((a) => a.startsWith("--report="))?.split("=")[1] ??
      "scripts/.local/backfill-477-report.json",
  };
}

/**
 * Pure validator for --regen-only's scope source. Exactly one of
 * --only-external-ids or --from-report must be given, and it must resolve to
 * a non-empty scope. Both inputs are presence-based (undefined means "flag
 * absent"): the caller extracts fromReportTransitions from the report file
 * (or resolves onlyExternalIds against the DB) before calling this, since
 * that resolution needs fs/DB access this function must stay free of.
 */
export function resolveRegenScope(opts: {
  onlyExternalIds?: string[];
  fromReportTransitions?: string[];
}): { errors: string[] } {
  const hasIds = opts.onlyExternalIds !== undefined;
  const hasReport = opts.fromReportTransitions !== undefined;

  if (hasIds && hasReport) {
    return {
      errors: [
        "--only-external-ids and --from-report are mutually exclusive; provide exactly one scope source",
      ],
    };
  }
  if (!hasIds && !hasReport) {
    return {
      errors: ["--regen-only requires a scope source: --only-external-ids or --from-report"],
    };
  }

  const errors: string[] = [];
  if (hasIds && (opts.onlyExternalIds as string[]).length === 0) {
    errors.push("--only-external-ids resolved to an empty scope");
  }
  if (hasReport && (opts.fromReportTransitions as string[]).length === 0) {
    errors.push("--from-report resolved to an empty scope (no transitions found in the report)");
  }
  return { errors };
}

/**
 * Resolves the per-drain-batch size for --regen-only from raw argv (not
 * BackfillArgs.regenBatch, which already defaults to 25 for the unrelated
 * --regenerate path and would therefore always win here). An explicit
 * --regen-batch wins; otherwise falls back to --limit (repurposed in
 * --regen-only as a batch size, not the scope-count safety cap it is in the
 * normal reconciliation path); otherwise defaults to 25.
 */
export function resolveRegenBatchSize(argv: string[], limit?: number): number {
  const hit = argv.find((a) => a.startsWith("--regen-batch="));
  if (hit) return Number(hit.split("=")[1]);
  return limit ?? 25;
}

/**
 * Reads a prior backfill report file and extracts the deduped scrutinIds of
 * its transitions. Throws (never returns partial data) if the file is
 * missing, not valid JSON, or has no "report" array, so --regen-only aborts
 * before any write rather than silently regenerating an empty or wrong scope.
 */
function loadFromReportScrutinIds(path: string): string[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (e) {
    throw new Error(`[backfill] --regen-only: cannot read --from-report=${path}: ${String(e)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `[backfill] --regen-only: --from-report=${path} is not valid JSON: ${String(e)}`
    );
  }
  const report = (parsed as { report?: unknown })?.report;
  if (!Array.isArray(report)) {
    throw new Error(`[backfill] --regen-only: --from-report=${path} has no "report" array`);
  }
  const ids = new Set<string>();
  for (const entry of report) {
    const scrutinId = (entry as { transition?: { scrutinId?: unknown } })?.transition?.scrutinId;
    if (typeof scrutinId === "string" && scrutinId.length > 0) ids.add(scrutinId);
  }
  return Array.from(ids);
}

/**
 * --regen-only orchestration: builds a scrutinId scope from either
 * --only-external-ids (resolved against the DB, unknown ids abort) or
 * --from-report (scrutinIds already recorded in a prior report), then drains
 * the regen queue for that scope. Dry-run (no --apply) only reports the
 * drain-eligible count and writes nothing; --apply requires
 * --confirm-production, already enforced by parseBackfillArgs.
 */
async function runRegenOnly(args: BackfillArgs): Promise<void> {
  const { db } = await import("@/lib/db");
  const { reclaimAbandonedRegen, drainDossierRepointRegen } =
    await import("@/services/sync/reconcile-scrutin-dossier/remediate");

  // Presence-only mutual-exclusion check BEFORE any file read: if both
  // --only-external-ids and --from-report are given (or neither is), abort
  // now with resolveRegenScope's clear error, rather than letting
  // loadFromReportScrutinIds below fail first with a file read/parse error
  // when a --from-report path happens to be invalid.
  const hasIds = args.onlyExternalIds !== undefined;
  const hasReport = args.fromReport !== undefined;
  if ((hasIds && hasReport) || (!hasIds && !hasReport)) {
    const presenceCheck = resolveRegenScope({
      onlyExternalIds: args.onlyExternalIds,
      fromReportTransitions: hasReport ? [] : undefined,
    });
    console.error("[backfill] --regen-only scope resolution failed, aborting before any write:");
    for (const e of presenceCheck.errors) console.error(`  - ${e}`);
    await db.$disconnect();
    throw new Error("[backfill] --regen-only scope resolution errors; see log above");
  }

  const fromReportScrutinIds = args.fromReport
    ? loadFromReportScrutinIds(args.fromReport)
    : undefined;

  const scopeCheck = resolveRegenScope({
    onlyExternalIds: args.onlyExternalIds,
    fromReportTransitions: fromReportScrutinIds,
  });
  if (scopeCheck.errors.length > 0) {
    console.error("[backfill] --regen-only scope resolution failed, aborting before any write:");
    for (const e of scopeCheck.errors) console.error(`  - ${e}`);
    await db.$disconnect();
    throw new Error("[backfill] --regen-only scope resolution errors; see log above");
  }

  let scrutinIds: string[];
  let scopeLabel: string;
  if (args.onlyExternalIds) {
    const rows = await db.scrutin.findMany({
      where: { externalId: { in: args.onlyExternalIds } },
      select: { id: true, externalId: true },
    });
    const found = new Set(rows.map((r) => r.externalId));
    const unknown = args.onlyExternalIds.filter((id) => !found.has(id));
    if (unknown.length > 0) {
      await db.$disconnect();
      throw new Error(`[backfill] --regen-only: unknown externalId(s): ${unknown.join(", ")}`);
    }
    scrutinIds = rows.map((r) => r.id);
    scopeLabel = args.onlyExternalIds.join(",");
  } else {
    scrutinIds = fromReportScrutinIds as string[];
    scopeLabel = `report:${args.fromReport}`;
  }

  if (scrutinIds.length === 0) {
    await db.$disconnect();
    throw new Error("[backfill] --regen-only: resolved scope is empty, aborting");
  }

  console.log(`[backfill] --regen-only scope=${scopeLabel}  scrutins=${scrutinIds.length}`);

  const regenBatch = resolveRegenBatchSize(process.argv.slice(2), args.limit);

  if (!args.apply) {
    // Same has-links condition as drainDossierRepointRegen's selector
    // (remediate.ts), so this preview count matches what --apply would
    // actually drain.
    const eligible = await db.scrutinPolicyTitle.count({
      where: {
        status: "STALE",
        regenerationStatus: "queued",
        scrutin: { amendmentLinks: { some: {} } },
        scrutinId: { in: scrutinIds },
      },
    });
    console.log(
      `[backfill] --regen-only dry-run: ${eligible} title(s) in scope are STALE and queued (drain-eligible). Re-run with --apply --confirm-production to regenerate.`
    );
    await db.$disconnect();
    return;
  }

  // Global by design: reclaimAbandonedRegen only resets stuck "running" rows
  // back to "queued" (no regeneration happens here), so running it unscoped
  // does not violate the scoped guarantee of the drain step below.
  await reclaimAbandonedRegen();
  let drained = { claimed: 0, regenerated: 0, failed: 0 };
  for (;;) {
    const r = await drainDossierRepointRegen({ limit: regenBatch, scrutinIds });
    drained = {
      claimed: drained.claimed + r.claimed,
      regenerated: drained.regenerated + r.regenerated,
      failed: drained.failed + r.failed,
    };
    if (r.claimed === 0) break;
  }
  console.log(`[backfill] --regen-only regen: ${JSON.stringify(drained)}`);
  await db.$disconnect();
}

/**
 * Pure scope selector for the staged #477 rollout: lets an operator repair a
 * narrow subset (4 scrutins, then a sitting-cluster, then all) through the
 * identical tested repair code path, without ever letting a truncation bug
 * silently drop transitions.
 *
 * `onlyExternalIds` is the SELECTOR (which scrutins to touch). `limit` is a
 * deterministic safety CAP only: it never selects or truncates, it only
 * aborts (via `errors`) if the resolved in-scope applied-transition count
 * exceeds it. Truncating `scoped` to `limit` would silently apply a
 * different (and non-deterministic, since it depends on array order) subset
 * than what the operator reviewed in the dry-run report, so this function
 * never does that.
 *
 * `decisions` (result.decisions, ALL evaluated scrutins) is the universe used
 * to detect an unknown externalId: `appliedTransitions` alone only contains
 * NEW_LINK/REPOINT/CLEAR, so a KEEP/NOOP scrutin that was in fact evaluated
 * would otherwise be misreported as unknown.
 */
export function selectBackfillScope(
  decisions: ScrutinDossierTransition[],
  appliedTransitions: ScrutinDossierTransition[],
  opts: { onlyExternalIds?: string[]; limit?: number }
): { scoped: ScrutinDossierTransition[]; excluded: ScrutinDossierTransition[]; errors: string[] } {
  const errors: string[] = [];
  let scoped: ScrutinDossierTransition[];
  let excluded: ScrutinDossierTransition[];

  if (opts.onlyExternalIds) {
    const wanted = new Set(opts.onlyExternalIds);
    const evaluated = new Set(decisions.map((d) => d.externalId));
    const unknown = opts.onlyExternalIds.filter((id) => !evaluated.has(id));
    if (unknown.length > 0) {
      errors.push(`unknown externalId(s), not among evaluated scrutins: ${unknown.join(", ")}`);
    }
    scoped = appliedTransitions.filter((t) => wanted.has(t.externalId));
    excluded = appliedTransitions.filter((t) => !wanted.has(t.externalId));
    if (scoped.length === 0) {
      errors.push("--only-external-ids resolved to zero applied transitions in scope");
    }
  } else {
    scoped = appliedTransitions;
    excluded = [];
  }

  if (opts.limit != null && scoped.length > opts.limit) {
    errors.push(
      `in-scope applied transitions (${scoped.length}) exceed --limit=${opts.limit} safety cap`
    );
  }

  return { scoped, excluded, errors };
}

async function main() {
  const args = parseBackfillArgs(process.argv.slice(2));
  const { db } = await import("@/lib/db");

  // Sanitised DB identity (no credentials).
  const url = new URL(process.env.DATABASE_URL ?? "postgres://unknown/unknown");
  console.log(
    `[backfill] DB target: ${url.host}${url.pathname}  apply=${args.apply} clears=${args.applyClears}`
  );

  if (args.regenOnly) {
    // Regenerates an already-repaired scope without touching the ZIP download
    // or reconciliation: see the --regen-only doc comment above the imports.
    await runRegenOnly(args);
    return;
  }

  const { reconcileScrutinDossier } = await import("@/services/sync/reconcile-scrutin-dossier");
  const { repairScrutinDossier, drainDossierRepointRegen, requeueLinklessTitlesWithLinks } =
    await import("@/services/sync/reconcile-scrutin-dossier/remediate");

  const repairRunId = "backfill-477";
  // The reconciler is plan-only (writes nothing). Phase A (repairScrutinDossier)
  // performs the dossierLegislatifId write atomically with the title STALE. So a
  // dry-run (no --apply) is fully read-only.
  const result = await reconcileScrutinDossier({
    applyClears: args.applyClears,
    repairRunId,
  });

  // Scope resolution for the staged #477 rollout: --only-external-ids is the
  // SELECTOR, --limit is a deterministic safety CAP that only aborts, never
  // truncates. selectBackfillScope is pure; see its doc comment above.
  const { scoped, excluded, errors } = selectBackfillScope(
    result.decisions,
    result.appliedTransitions,
    { onlyExternalIds: args.onlyExternalIds, limit: args.limit }
  );
  const scopeLabel = args.onlyExternalIds ? args.onlyExternalIds.join(",") : "ALL";
  if (errors.length > 0) {
    console.error("[backfill] scope resolution failed, aborting before any write:");
    for (const e of errors) console.error(`  - ${e}`);
    await db.$disconnect();
    throw new Error("[backfill] scope resolution errors; see log above");
  }

  const repoints = scoped.filter((t) => t.action === "REPOINT").length;
  const newLinks = scoped.filter((t) => t.action === "NEW_LINK").length;
  const clears = scoped.filter((t) => t.action === "CLEAR").length;
  console.log(
    `[backfill] total historical decisions=${result.decisions.length}  selected scope=${scopeLabel}`
  );
  console.log(
    `[backfill] applied within scope: repoints=${repoints} new-links=${newLinks} clears=${clears} (total=${
      scoped.length
    })  excluded=${excluded.length}  ambiguous(kept)=${
      result.decisions.filter((d) => d.action === "KEEP").length
    }`
  );

  const guardFail =
    (args.expectedRepoints !== undefined && args.expectedRepoints !== repoints) ||
    (args.expectedNewLinks !== undefined && args.expectedNewLinks !== newLinks) ||
    (args.expectedClears !== undefined && args.expectedClears !== clears);
  if (guardFail) throw new Error("[backfill] expectation guard mismatch; aborting");

  // Persist the resumable report BEFORE any regen so resume can rely on it.
  // Scoped to `scoped`, not the full applied set, so the report matches what
  // the repair loop below actually touches.
  const report = scoped.map((t) => ({
    transition: t,
    repairStatus: "PENDING",
    attempts: 0,
  }));
  mkdirSync(dirname(args.reportPath), { recursive: true });
  writeFileSync(
    args.reportPath,
    JSON.stringify(
      {
        repairRunId,
        scope: {
          totalHistoricalDecisions: result.decisions.length,
          selectedScope: scopeLabel,
          appliedWithinScope: scoped.length,
          excluded: excluded.length,
        },
        report,
      },
      null,
      2
    )
  );

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
  // Iterates `scoped`, not the full applied set, so a Stage-1 run only repairs
  // the selected subset.
  const repairCounts: Record<string, number> = {};
  for (const t of scoped) {
    try {
      const r = await repairScrutinDossier(t, repairRunId);
      repairCounts[r.repairStatus] = (repairCounts[r.repairStatus] ?? 0) + 1;
    } catch (e) {
      repairCounts.THREW = (repairCounts.THREW ?? 0) + 1;
      console.error(`[backfill] repair threw for ${t.externalId}: ${String(e)}`);
    }
  }
  console.log(`[backfill] repair statuses: ${JSON.stringify(repairCounts)}`);

  // Scope the requeue/regen too, so a Stage-1 run never touches out-of-scope
  // rows. Unscoped (--only-external-ids absent) passes no scrutinIds, so
  // behavior stays global/unchanged, matching the daily sync caller.
  const scopedScrutinIds = args.onlyExternalIds ? scoped.map((t) => t.scrutinId) : undefined;
  await requeueLinklessTitlesWithLinks(500, scopedScrutinIds);

  if (args.regenerate) {
    let drained = { claimed: 0, regenerated: 0, failed: 0 };
    // Loop the bounded drain until the queue empties (resumable across restarts via DB state).
    for (;;) {
      const r = await drainDossierRepointRegen({
        limit: args.regenBatch,
        scrutinIds: scopedScrutinIds,
      });
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
