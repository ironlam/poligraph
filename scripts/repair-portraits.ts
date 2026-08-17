/**
 * Portrait maintenance pass for politician photos.
 *
 * Three independent phases, all read-only unless --apply is passed:
 *
 *   --repair    Rewrite stored Commons thumbnail URLs to a width Wikimedia
 *               still serves. Fixes portraits that went blank when the allowed
 *               width list was restricted.
 *   --discover  Attach a portrait to politicians who have none, from the
 *               Wikidata P18 claim on their own item.
 *   --crop      Re-frame Commons portraits on the subject's face and cache the
 *               result on Vercel Blob.
 *
 * Scope:
 *   --only-bio  Restrict to politicians who already have a biography.
 *   --limit=N   Cap the number of rows examined in each phase.
 *
 * Usage:
 *   npx tsx scripts/repair-portraits.ts --repair
 *   npx tsx scripts/repair-portraits.ts --repair --apply
 *   npx tsx scripts/repair-portraits.ts --discover --only-bio --apply
 *   npx tsx scripts/repair-portraits.ts --crop --only-bio --apply
 */
import "dotenv/config";
import { writeFile } from "fs/promises";
import { db } from "../src/lib/db";
import { HTTPClient } from "../src/lib/api/http-client";
import {
  COMMONS_CROP_WIDTH,
  COMMONS_STORED_WIDTH,
  commonsThumbnailUrl,
  isCommonsThumbnailUrl,
  parseCommonsThumbnailWidth,
  rewriteCommonsThumbnailWidth,
  COMMONS_THUMBNAIL_WIDTHS,
} from "../src/lib/photos/commons";
import { cropToPortrait, readDimensions } from "../src/lib/photos/crop";
import { screenFilename, screenGeometry } from "../src/lib/photos/portrait-guard";
import { fetchP18Filenames, filenameFromThumbnailUrl } from "../src/lib/photos/wikidata-image";
import { uploadCroppedPortrait, deleteCroppedPortrait } from "../src/lib/photos/blob";

const client = new HTTPClient({ rateLimitMs: 150 });
const imageClient = new HTTPClient({
  timeout: 20_000,
  retries: 2,
  retryDelay: 2_000,
  rateLimitMs: 700,
  sourceName: "Wikimedia images",
});

/** Default cap for the crop phase, which downloads and uploads per row. */
const DEFAULT_CROP_LIMIT = 300;

interface Options {
  repair: boolean;
  discover: boolean;
  crop: boolean;
  onlyBio: boolean;
  limit: number | null;
  apply: boolean;
  reportPath: string;
}

function parseOptions(argv: string[]): Options {
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const reportArg = argv.find((a) => a.startsWith("--report="));
  return {
    repair: argv.includes("--repair"),
    discover: argv.includes("--discover"),
    crop: argv.includes("--crop"),
    onlyBio: argv.includes("--only-bio"),
    limit: limitArg ? Number(limitArg.split("=")[1] ?? "") : null,
    apply: argv.includes("--apply"),
    reportPath: reportArg?.split("=")[1] || "data/portraits-report.json",
  };
}

const NO_PHOTO = { OR: [{ photoUrl: null }, { photoUrl: "" }] };

interface RepairEntry {
  id: string;
  name: string;
  from: string;
  to: string;
}

interface DiscoverEntry {
  id: string;
  name: string;
  qid: string;
  filename: string;
  url?: string;
  status: "attached" | "refused" | "needs-review" | "unreachable";
  reason?: string;
  blobUrl?: string;
}

interface CropEntry {
  id: string;
  name: string;
  filename: string;
  status: "cropped" | "refused" | "unreachable";
  reason?: string;
  strategy?: string;
  region?: { left: number; top: number; size: number };
  blobUrl?: string;
}

/**
 * Minimum gap between image downloads.
 *
 * upload.wikimedia.org answers 429 well before a few requests per second, and a
 * throttled response is indistinguishable from a missing file unless you slow
 * down and retry — which once made a perfectly good batch look half-broken.
 */
async function fetchImage(url: string): Promise<Buffer> {
  return (await imageClient.getBuffer(url)).data;
}

async function urlIsServed(url: string): Promise<boolean> {
  try {
    const { ok } = await client.head(url);
    return ok;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ repair */

async function runRepair(options: Options): Promise<RepairEntry[]> {
  const rows = await db.politician.findMany({
    where: {
      photoUrl: { contains: "/thumb/" },
      ...(options.onlyBio ? { biography: { not: null } } : {}),
    },
    select: { id: true, fullName: true, photoUrl: true },
    take: options.limit ?? undefined,
  });

  const allowed = new Set<number>(COMMONS_THUMBNAIL_WIDTHS);
  const entries: RepairEntry[] = [];

  for (const row of rows) {
    const current = row.photoUrl!;
    if (!isCommonsThumbnailUrl(current)) continue;
    const width = parseCommonsThumbnailWidth(current);
    if (width === null || allowed.has(width)) continue;

    const fixed = rewriteCommonsThumbnailWidth(current, COMMONS_STORED_WIDTH);
    if (fixed === current) continue;
    entries.push({ id: row.id, name: row.fullName, from: current, to: fixed });
  }

  console.log(`\n[repair] ${rows.length} Commons URLs examined, ${entries.length} on a dead width`);

  // Prove the rewrite before trusting it on the whole set.
  const sample = entries.slice(0, 5);
  for (const entry of sample) {
    const [before, after] = await Promise.all([urlIsServed(entry.from), urlIsServed(entry.to)]);
    console.log(
      `[repair]   ${entry.name.padEnd(26)} stored=${before ? "200" : "dead"} rewritten=${after ? "200" : "DEAD"}`
    );
  }

  if (!options.apply) {
    console.log(`[repair] dry run — pass --apply to write ${entries.length} rows`);
    return entries;
  }

  let written = 0;
  for (const entry of entries) {
    await db.politician.update({
      where: { id: entry.id },
      // The cached Blob copy was made from the old URL and is still a valid
      // image, so it is left alone; only the source pointer moves.
      data: { photoUrl: entry.to },
    });
    written++;
    if (written % 100 === 0) console.log(`[repair]   ${written}/${entries.length} written`);
  }
  console.log(`[repair] wrote ${written} rows`);
  return entries;
}

/* ---------------------------------------------------------------- discover */

async function runDiscover(options: Options): Promise<DiscoverEntry[]> {
  const rows = await db.politician.findMany({
    where: {
      ...NO_PHOTO,
      externalIds: { some: { source: "WIKIDATA" } },
      ...(options.onlyBio ? { biography: { not: null } } : {}),
    },
    select: {
      id: true,
      fullName: true,
      blobPhotoUrl: true,
      externalIds: { where: { source: "WIKIDATA" }, select: { externalId: true } },
    },
    orderBy: { prominenceScore: "desc" },
    take: options.limit ?? undefined,
  });

  console.log(`\n[discover] ${rows.length} photo-less politicians carrying a Wikidata id`);

  const byQid = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const qid = row.externalIds[0]?.externalId;
    if (qid) byQid.set(qid, row);
  }

  const filenames = await fetchP18Filenames([...byQid.keys()]);
  console.log(`[discover] ${filenames.size} of them have a P18 image claim`);

  const entries: DiscoverEntry[] = [];

  for (const [qid, filename] of filenames) {
    const row = byQid.get(qid)!;
    const base: DiscoverEntry = {
      id: row.id,
      name: row.fullName,
      qid,
      filename,
      status: "refused",
    };

    const verdict = screenFilename(filename, row.fullName);
    if (!verdict.ok) {
      entries.push({ ...base, reason: `${verdict.reason}: ${verdict.detail}` });
      continue;
    }

    const url = commonsThumbnailUrl(filename, COMMONS_STORED_WIDTH);
    let buffer: Buffer;
    try {
      buffer = await fetchImage(commonsThumbnailUrl(filename, COMMONS_CROP_WIDTH));
    } catch (e) {
      entries.push({ ...base, url, status: "unreachable", reason: String(e).slice(0, 80) });
      continue;
    }

    const dims = await readDimensions(buffer);
    const geometry = screenGeometry(dims);
    if (!geometry.ok) {
      entries.push({ ...base, url, reason: `${geometry.reason}: ${geometry.detail}` });
      continue;
    }

    let cropped;
    try {
      cropped = await cropToPortrait(buffer);
    } catch (e) {
      entries.push({
        ...base,
        url,
        status: "unreachable",
        reason: `crop failed: ${String(e).slice(0, 60)}`,
      });
      continue;
    }

    // Attaching a photo is adding a claim about someone's appearance, so it
    // needs a positive face detection — not just an image that failed to be
    // refused. The fallback framing cannot zoom, so on a greyscale wide shot it
    // would publish a portrait in which the face is a handful of pixels.
    // Those go to a review queue instead of being attached or silently dropped.
    if (cropped.strategy !== "face") {
      entries.push({
        ...base,
        url,
        status: "needs-review",
        reason: "no face detected; framing could not be verified automatically",
      });
      continue;
    }

    const entry: DiscoverEntry = { ...base, url, status: "attached" };

    if (options.apply) {
      const blobUrl = await uploadCroppedPortrait(row.id, cropped.buffer);
      await db.politician.update({
        where: { id: row.id },
        data: {
          photoUrl: url,
          photoSource: "wikidata",
          blobPhotoUrl: blobUrl,
          photoCheckedAt: new Date(),
        },
      });
      // Only after the row points at the new blob: an orphan is cheap, a dangling
      // reference is a broken portrait.
      await deleteCroppedPortrait(row.blobPhotoUrl);
      entry.blobUrl = blobUrl;
    }

    entries.push(entry);
  }

  const attached = entries.filter((e) => e.status === "attached");
  const review = entries.filter((e) => e.status === "needs-review");
  console.log(
    `[discover] ${attached.length} attached, ${review.length} need review, ` +
      `${entries.filter((e) => e.status === "refused").length} refused, ` +
      `${entries.filter((e) => e.status === "unreachable").length} unreachable`
  );
  for (const entry of entries.filter((e) => e.status === "refused")) {
    console.log(`[discover]   refused      ${entry.name.padEnd(26)} ${entry.reason}`);
  }
  for (const entry of review) {
    console.log(`[discover]   needs review ${entry.name.padEnd(26)} ${entry.filename}`);
  }
  if (!options.apply) console.log(`[discover] dry run — pass --apply to attach ${attached.length}`);

  return entries;
}

/* -------------------------------------------------------------------- crop */

async function runCrop(options: Options): Promise<CropEntry[]> {
  const limit = options.limit ?? DEFAULT_CROP_LIMIT;

  const where = {
    photoSource: "wikidata",
    photoUrl: { contains: "/thumb/" },
    ...(options.onlyBio ? { biography: { not: null } } : {}),
  };

  const total = await db.politician.count({ where });
  const rows = await db.politician.findMany({
    where,
    select: { id: true, fullName: true, photoUrl: true, blobPhotoUrl: true },
    orderBy: { prominenceScore: "desc" },
    take: limit,
  });

  if (total > rows.length) {
    console.log(
      `\n[crop] ${total} candidates, taking the ${rows.length} most prominent — ` +
        `${total - rows.length} left for a later run (raise --limit)`
    );
  } else {
    console.log(`\n[crop] ${rows.length} candidates`);
  }

  const entries: CropEntry[] = [];

  for (const row of rows) {
    const filename = filenameFromThumbnailUrl(row.photoUrl!);
    if (!filename) continue;

    const base: CropEntry = { id: row.id, name: row.fullName, filename, status: "refused" };

    const verdict = screenFilename(filename, row.fullName);
    if (!verdict.ok) {
      entries.push({ ...base, reason: `${verdict.reason}: ${verdict.detail}` });
      continue;
    }

    let buffer: Buffer;
    try {
      buffer = await fetchImage(commonsThumbnailUrl(filename, COMMONS_CROP_WIDTH));
    } catch (e) {
      entries.push({ ...base, status: "unreachable", reason: String(e).slice(0, 80) });
      continue;
    }

    const dims = await readDimensions(buffer);
    const geometry = screenGeometry(dims);
    if (!geometry.ok) {
      entries.push({ ...base, reason: `${geometry.reason}: ${geometry.detail}` });
      continue;
    }

    let cropped;
    try {
      cropped = await cropToPortrait(buffer);
    } catch (e) {
      entries.push({
        ...base,
        status: "unreachable",
        reason: `crop failed: ${String(e).slice(0, 60)}`,
      });
      continue;
    }

    const entry: CropEntry = {
      ...base,
      status: "cropped",
      strategy: cropped.strategy,
      region: cropped.region,
    };

    if (options.apply) {
      const blobUrl = await uploadCroppedPortrait(row.id, cropped.buffer);
      await db.politician.update({
        where: { id: row.id },
        data: { blobPhotoUrl: blobUrl },
      });
      // Same order as in the discover phase, and the reason the re-crop is
      // visible at all: the old blob is only dropped once nothing points at it.
      await deleteCroppedPortrait(row.blobPhotoUrl);
      entry.blobUrl = blobUrl;
    }

    entries.push(entry);
    if (entries.length % 25 === 0)
      console.log(`[crop]   ${entries.length}/${rows.length} processed`);
  }

  const cropped = entries.filter((e) => e.status === "cropped");
  const byStrategy = cropped.reduce<Record<string, number>>((acc, e) => {
    acc[e.strategy ?? "?"] = (acc[e.strategy ?? "?"] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `[crop] ${cropped.length} cropped ${JSON.stringify(byStrategy)}, ` +
      `${entries.filter((e) => e.status === "refused").length} refused, ` +
      `${entries.filter((e) => e.status === "unreachable").length} unreachable`
  );
  if (!options.apply) console.log(`[crop] dry run — pass --apply to upload ${cropped.length}`);

  return entries;
}

/* -------------------------------------------------------------------- main */

async function main() {
  const options = parseOptions(process.argv.slice(2));

  if (!options.repair && !options.discover && !options.crop) {
    console.log("Nothing to do. Pass at least one of --repair, --discover, --crop.");
    return;
  }

  console.log(
    `repair-portraits — ${options.apply ? "APPLY (writes to the database)" : "dry run"}` +
      `${options.onlyBio ? ", scope: politicians with a biography" : ""}`
  );

  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    options: { ...options },
  };

  if (options.repair) report.repair = await runRepair(options);
  if (options.discover) report.discover = await runDiscover(options);
  if (options.crop) report.crop = await runCrop(options);

  await writeFile(options.reportPath, JSON.stringify(report, null, 2));
  console.log(`\nreport written to ${options.reportPath}`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
