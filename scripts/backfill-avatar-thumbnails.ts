#!/usr/bin/env tsx
/**
 * Write the avatar thumbnail of every politician photo already stored on Vercel Blob.
 *
 * New uploads write their thumbnail themselves (`@/lib/photos/blob`). Photos uploaded before that
 * have none: their avatars answer one 404 and fall back to `/_next/image` until this script runs.
 *
 * Idempotent: a photo whose thumbnail already answers 200 is skipped, so the script can be run
 * again after an interruption. A photo that cannot be read is counted and left alone.
 *
 * Usage:
 *   npx dotenv -e .env.prod -- npx tsx scripts/backfill-avatar-thumbnails.ts --dry-run
 *   npx dotenv -e .env.prod -- npx tsx scripts/backfill-avatar-thumbnails.ts
 */
import { db } from "@/lib/db";
import { writeThumbnail } from "@/lib/photos/blob";
import { thumbnailUrlFor } from "@/lib/photos/thumbnail";

/** Parallel Blob reads and writes: enough to finish in minutes, few enough to stay polite. */
const CONCURRENCY = 8;

type Outcome = "written" | "exists" | "unreadable" | "failed";

async function backfillOne(photoUrl: string, dryRun: boolean): Promise<Outcome> {
  const thumbnailUrl = thumbnailUrlFor(photoUrl);
  if (!thumbnailUrl) return "failed";

  const existing = await fetch(thumbnailUrl, { method: "HEAD" });
  if (existing.ok) return "exists";
  if (dryRun) return "written";

  const photo = await fetch(photoUrl);
  if (!photo.ok) return "unreadable";
  const buffer = Buffer.from(await photo.arrayBuffer());
  return (await writeThumbnail(photoUrl, buffer)) ? "written" : "failed";
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!dryRun && !process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required to write thumbnails.");
  }

  const rows = await db.politician.findMany({
    where: { blobPhotoUrl: { contains: ".public.blob.vercel-storage.com/" } },
    select: { blobPhotoUrl: true },
  });
  const photoUrls = [...new Set(rows.map((row) => row.blobPhotoUrl!))];
  console.log(`${photoUrls.length} photos on Blob${dryRun ? " (dry run)" : ""}`);

  const counts: Record<Outcome, number> = { written: 0, exists: 0, unreadable: 0, failed: 0 };
  let next = 0;
  async function worker() {
    while (next < photoUrls.length) {
      const photoUrl = photoUrls[next++]!;
      const outcome = await backfillOne(photoUrl, dryRun).catch((): Outcome => "failed");
      counts[outcome]++;
      if (outcome === "unreadable" || outcome === "failed") console.warn(`${outcome}: ${photoUrl}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const verb = dryRun ? "to write" : "written";
  console.log(
    `${counts.written} ${verb}, ${counts.exists} already present, ` +
      `${counts.unreadable} unreadable, ${counts.failed} failed`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
