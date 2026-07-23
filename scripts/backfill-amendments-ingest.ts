/**
 * User-accord-gated catch-up: full re-ingest of the AN amendments feed.
 *
 * This is the manual resync tool, so it defaults to `mode: "full"` (parse every
 * entry, re-baseline the per-dossier signatures). Pass `--full` to be explicit;
 * omit it and it still runs full. The daily cron uses the incremental path.
 *
 * Default = dryRun (download + parse + memory/duration report, NO DB writes).
 * `--apply` performs the real ingest (writes Amendment rows to whatever DB
 * DATABASE_URL points at — in this project that is PROD). Idempotent: the
 * writer dedups by contentHash, so only genuinely new/changed rows are written.
 * DO NOT run in CI. Run only with explicit accord, via `npx tsx --env-file=.env`.
 */
import { syncAmendmentsAN } from "@/services/sync/amendments-an";
import { db } from "@/lib/db";

const APPLY = process.argv.includes("--apply");
// Manual resync defaults to a full re-ingest. `--full` forces it (and is the
// default); `--incremental` opts into the cron's diff path for manual checks.
const MODE: "full" | "incremental" = process.argv.includes("--incremental")
  ? "incremental"
  : "full";

(async () => {
  const before = await db.amendment.count();
  console.log(
    `[ingest] mode=${APPLY ? "APPLY (writes prod)" : "dry-run (no writes)"} ingest=${MODE}`
  );
  console.log(`[ingest] Amendment rows before: ${before}`);

  const stats = await syncAmendmentsAN({
    legislature: 17,
    mode: MODE,
    force: true,
    dryRun: !APPLY,
  });

  console.log(
    "[ingest] stats " +
      JSON.stringify({
        dossiersInspected: stats.dossiersInspected,
        dossiersChanged: stats.dossiersChanged,
        seen: stats.amendmentsSeen,
        created: stats.amendmentsCreated,
        updated: stats.amendmentsUpdated,
        unchanged: stats.amendmentsUnchanged,
        skipped: stats.amendmentsSkipped,
        downloadedMB: Math.round((stats.downloadedBytes ?? 0) / 1048576),
        durationS: Math.round(stats.durationMs / 1000),
        writeMs: stats.writeMs,
        resolveMs: stats.resolveMs,
        peakRssMb: stats.peakRssMb,
      })
  );

  const after = await db.amendment.count();
  console.log(`[ingest] Amendment rows after: ${after} (delta +${after - before})`);
  if (!APPLY) console.log("[ingest] dry-run: no rows written. Re-run with --apply to ingest.");
  await db.$disconnect();
})().catch(async (e) => {
  console.error("[ingest] FAILED:", e);
  try {
    await db.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
