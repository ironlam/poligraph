import { createHash } from "crypto";

/**
 * Wikimedia restricts the thumbnail widths that upload.wikimedia.org will
 * serve. Any other width is answered with:
 *
 *   HTTP 400 — Use thumbnail sizes listed on https://w.wiki/GHai
 *
 * See https://www.mediawiki.org/wiki/Common_thumbnail_sizes. Requests going
 * through PHP (the imageinfo API) get rounded up to the next bucket, but direct
 * hotlinks — which is what we build and what next/image fetches — are rejected
 * outright.
 */
export const COMMONS_THUMBNAIL_WIDTHS = [
  20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840,
] as const;

const UPLOAD_HOST = "upload.wikimedia.org";
const THUMB_SEGMENT = "/thumb/";

/**
 * Width stored in `Politician.photoUrl`. Big enough for the largest avatar we
 * render (128 px at 2x) while staying an allowed bucket.
 */
export const COMMONS_STORED_WIDTH = 500;

/**
 * Width fetched when an image is about to be cropped. Cropping throws away
 * pixels, so the source needs headroom over the 512 px output.
 */
export const COMMONS_CROP_WIDTH = 960;

/** Largest bucket, used when a caller asks for more than Commons will serve. */
const MAX_WIDTH = Math.max(...COMMONS_THUMBNAIL_WIDTHS);

/**
 * Smallest allowed width greater than or equal to `width`.
 *
 * Rounding up rather than down keeps the thumbnail at least as detailed as the
 * caller asked for, which matters when the result feeds a crop.
 */
export function roundUpToAllowedWidth(width: number): number {
  return COMMONS_THUMBNAIL_WIDTHS.find((allowed) => allowed >= width) ?? MAX_WIDTH;
}

/**
 * Thumbnail extension Commons appends for formats it cannot serve natively.
 * Raster formats keep their own extension.
 */
function thumbnailSuffix(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".svg")) return ".png";
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return ".jpg";
  return "";
}

/** Strip a leading `File:` / `Image:` namespace and turn spaces into underscores. */
function normalizeFilename(filename: string): string {
  return filename.replace(/^(File|Image|Fichier):/i, "").replace(/ /g, "_");
}

/**
 * Build a direct Commons thumbnail URL from a P18 filename.
 *
 * Commons shards originals by the MD5 of the underscored filename:
 *   /wikipedia/commons/thumb/{h[0]}/{h[0..1]}/{name}/{width}px-{name}
 *
 * The width is always coerced to an allowed bucket, so this function cannot
 * produce a URL that Wikimedia will reject.
 */
export function commonsThumbnailUrl(filename: string, width: number): string {
  const normalized = normalizeFilename(filename);
  const hash = createHash("md5").update(normalized).digest("hex");
  const encoded = encodeURIComponent(normalized);
  const allowed = roundUpToAllowedWidth(width);
  const suffix = thumbnailSuffix(normalized);

  return (
    `https://${UPLOAD_HOST}/wikipedia/commons/thumb/` +
    `${hash[0]}/${hash.slice(0, 2)}/${encoded}/${allowed}px-${encoded}${suffix}`
  );
}

/** True when `url` is a Commons thumbnail (not an original-file URL). */
export function isCommonsThumbnailUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes(UPLOAD_HOST) && url.includes(THUMB_SEGMENT);
}

/**
 * Width encoded in a Commons thumbnail URL, or null when there is none.
 *
 * The width lives at the start of the last path segment, which is the only
 * place it can be read without tripping over filenames that themselves start
 * with digits (e.g. `20241008-P1120704_Jeanbrun_Vincent_Wikipedia.jpg`).
 */
export function parseCommonsThumbnailWidth(url: string): number | null {
  if (!isCommonsThumbnailUrl(url)) return null;
  const lastSegment = url.split("/").pop() ?? "";
  const match = /^(\d+)px-/.exec(lastSegment);
  return match?.[1] ? Number(match[1]) : null;
}

/**
 * Rewrite a stored Commons thumbnail URL to an allowed width.
 *
 * Used to repair rows written before Wikimedia restricted the width list, and
 * without going back to Wikidata: the filename is already in the URL.
 * Non-Commons URLs are returned unchanged so callers can pass anything.
 */
export function rewriteCommonsThumbnailWidth(url: string, width: number): string {
  if (!isCommonsThumbnailUrl(url)) return url;

  const segments = url.split("/");
  const lastSegment = segments[segments.length - 1];
  if (!lastSegment || !/^\d+px-/.test(lastSegment)) return url;

  const allowed = roundUpToAllowedWidth(width);
  segments[segments.length - 1] = lastSegment.replace(/^\d+px-/, `${allowed}px-`);
  return segments.join("/");
}
