import { put, del } from "@vercel/blob";
import sharp from "sharp";
import { THUMBNAIL_SIZE, thumbnailPathnameFor, thumbnailUrlFor } from "./thumbnail";

/** WebP quality of the avatar thumbnail: invisible loss at 40 to 96 CSS pixels. */
const THUMBNAIL_QUALITY = 75;

/**
 * Store a cropped portrait on Vercel Blob, at a URL that has never been served
 * before.
 *
 * The `-portrait` marker keeps these apart from the raw copies that
 * `/api/images/[id]` writes under `politicians/{id}`, so a cropped portrait is
 * identifiable from its URL alone and no extra column is needed to record that
 * the image is derived.
 *
 * `addRandomSuffix` is what makes a re-crop visible. Blob serves these files
 * with `cache-control: public, max-age=2592000`, so overwriting a fixed key left
 * the old bytes in the CDN and in browsers for up to thirty days: the URL was
 * unchanged, and nothing told anyone to fetch it again. A corrected framing would
 * have shipped and simply not appeared. A fresh pathname each time sidesteps the
 * question entirely — there is no cache entry to invalidate.
 *
 * The caller owns the swap order: upload, write the new URL to the database, then
 * drop the old blob. Failing on the last step leaves an orphan, which costs a few
 * kilobytes; failing on any other order would leave a politician pointing at bytes
 * that no longer exist.
 */
export async function uploadCroppedPortrait(politicianId: string, buffer: Buffer): Promise<string> {
  const { url } = await put(`politicians/${politicianId}-portrait`, buffer, {
    access: "public",
    contentType: "image/jpeg",
    addRandomSuffix: true,
  });
  await writeThumbnail(url, buffer);
  return url;
}

/**
 * Store a raw copy of a source photo on Vercel Blob, at a fresh URL.
 *
 * Same reason as `uploadCroppedPortrait` for the random suffix: a new photo
 * written over a fixed pathname would keep serving the old bytes from the CDN
 * for up to thirty days. The previous copy is left behind, which costs a few
 * kilobytes.
 */
export async function uploadSourcePhotoCopy(
  politicianId: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const { url } = await put(`politicians/${politicianId}`, buffer, {
    access: "public",
    contentType,
    addRandomSuffix: true,
  });
  await writeThumbnail(url, buffer);
  return url;
}

/**
 * Write the avatar thumbnail of a photo already stored on Blob (see `./thumbnail`).
 *
 * Best effort: the photo is what matters, and an avatar whose thumbnail is missing falls back to
 * the optimized original. A failure is therefore reported as `false`, never thrown, so it cannot
 * abort an upload, a sync run or the backfill.
 *
 * The pathname is fixed (derived from the photo URL), so overwriting is allowed: the backfill may
 * run again over a thumbnail that already exists, and the bytes would be the same.
 */
export async function writeThumbnail(photoUrl: string, source: Buffer): Promise<boolean> {
  const pathname = thumbnailPathnameFor(photoUrl);
  if (!pathname) return false;
  try {
    const thumbnail = await sharp(source)
      .rotate()
      .resize({ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, fit: "cover" })
      .webp({ quality: THUMBNAIL_QUALITY })
      .toBuffer();
    await put(pathname, thumbnail, {
      access: "public",
      contentType: "image/webp",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a portrait we previously uploaded, once nothing points at it any more.
 *
 * Guarded on the `-portrait` marker: `blobPhotoUrl` may also hold a raw cached
 * copy written by the image proxy, which other code still serves, and an external
 * URL entirely. Deleting either would break a live image. Failure is swallowed on
 * purpose — an orphaned blob is not worth aborting a run over.
 */
export async function deleteCroppedPortrait(url: string | null | undefined): Promise<boolean> {
  if (!url || !url.includes("-portrait")) return false;
  const thumbnailUrl = thumbnailUrlFor(url);
  try {
    await del(thumbnailUrl ? [url, thumbnailUrl] : url);
    return true;
  } catch {
    return false;
  }
}
