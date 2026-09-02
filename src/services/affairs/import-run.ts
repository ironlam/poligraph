import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";

// Affaires v2, lot 1: groups the proposals an importer pass produced, so a faulty
// extractor version can be spotted and its proposals rejected together.
//
// Deliberately separate from SyncJob: SyncJob only exists when an admin triggers
// a script by hand (the Inngest cron passes `jobId` as optional), so it cannot
// anchor the provenance of a scheduled run.
//
// ImportRun.status describes EXECUTION, never business outcome:
//   COMPLETED = the pass reached its end, whatever it produced. A run that filed
//               only PENDING or CONFLICT proposals is COMPLETED.
//   FAILED    = the pass was interrupted.
// Business results go to `stats`.

export const IMPORTER_DISCOVER_AFFAIRS = "discover-affairs";
export const IMPORTER_PRESS_ANALYSIS = "press-analysis";
export const IMPORTER_JUDILIBRE = "judilibre";
/** Reserved for admin-initiated proposals, so they never end up run-less. */
export const IMPORTER_MANUAL_ADMIN = "manual-admin";

export async function startImportRun(importer: string): Promise<string> {
  const run = await db.importRun.create({
    data: { importer, status: "RUNNING" },
    select: { id: true },
  });
  return run.id;
}

export async function finishImportRun(
  importRunId: string,
  stats: Prisma.InputJsonValue
): Promise<void> {
  await db.importRun.update({
    where: { id: importRunId },
    data: { status: "COMPLETED", finishedAt: new Date(), stats },
  });
}

export async function failImportRun(importRunId: string, error: unknown): Promise<void> {
  await db.importRun.update({
    where: { id: importRunId },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      error: error instanceof Error ? error.message : String(error),
    },
  });
}

export interface ImportRunContext {
  importRunId: string;
  /** Stats to record on the run. Last call wins; safe to call repeatedly. */
  setStats: (stats: Prisma.InputJsonValue) => void;
}

/**
 * Runs `fn` inside an ImportRun and guarantees a terminal state.
 *
 * The `finally` block is the guarantee: if the happy-path COMPLETED write itself
 * fails, the run is still forced out of RUNNING. Its own failure is swallowed on
 * purpose, because there is nothing left to do and it must not mask the original
 * error.
 *
 * Known limit: if the database is unreachable, no write can land and the row
 * stays RUNNING. Detecting those needs a sweeper over old RUNNING rows, which
 * this lot does not ship.
 */
export async function withImportRun<T>(
  importer: string,
  fn: (ctx: ImportRunContext) => Promise<T>
): Promise<T> {
  const importRunId = await startImportRun(importer);
  let stats: Prisma.InputJsonValue = {};
  let settled = false;

  try {
    const result = await fn({
      importRunId,
      setStats: (next) => {
        stats = next;
      },
    });
    await finishImportRun(importRunId, stats);
    settled = true;
    return result;
  } catch (error) {
    try {
      await failImportRun(importRunId, error);
      settled = true;
    } catch {
      // Reported by the finally block below; the original error must surface.
    }
    throw error;
  } finally {
    if (!settled) {
      try {
        await db.importRun.update({
          where: { id: importRunId },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            error: "Run laissé en RUNNING : la transition d'état finale a échoué",
          },
        });
      } catch {
        // Database unreachable. Nothing more can be done here.
      }
    }
  }
}
