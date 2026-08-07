import { put, del } from "@vercel/blob";

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
  return url;
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
  try {
    await del(url);
    return true;
  } catch {
    return false;
  }
}
