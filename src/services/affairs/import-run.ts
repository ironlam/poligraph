import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";

// Affaires v2, lot 1: groups the proposals an importer pass produced, so a faulty
// extractor version can be spotted and its proposals rejected together.
//
// Deliberately separate from SyncJob: SyncJob only exists when an admin triggers
// a script by hand (the Inngest cron passes `jobId` as optional), so it cannot
// anchor the provenance of a scheduled run.

export const IMPORTER_DISCOVER_AFFAIRS = "discover-affairs";
export const IMPORTER_JUDILIBRE = "judilibre";

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
