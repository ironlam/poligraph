/**
 * Avatar thumbnails stored on Vercel Blob next to each politician photo.
 *
 * Why they exist: avatars are drawn at 40 to 96 CSS pixels, and every one went through
 * `/_next/image`, about 180,000 requests a day billed as CDN requests. The Blob copy itself cannot
 * be served as is: a cropped portrait is a 512 px JPEG, ten times the weight an avatar needs, and a
 * scrutin page lists up to 576 voters. A small WebP written once next to the photo is served
 * straight from the Blob CDN, at the right weight, without the optimizer.
 *
 * The thumbnail URL is derived from the photo URL rather than stored: every photo URL on Blob is
 * unique (random suffix), so the derived name is unique too and no column or query changes. A photo
 * without its thumbnail yet (uploaded before this existed, or a failed write) answers 404, and the
 * avatar falls back to the optimized original.
 *
 * This module is imported by client components: no Node-only dependency here.
 */

/** Side of the square thumbnail, in pixels: twice the largest avatar served from it. */
export const THUMBNAIL_SIZE = 192;

/** Largest avatar, in CSS pixels, drawn from the thumbnail. Larger ones keep next/image. */
export const THUMBNAIL_MAX_DISPLAY_PX = THUMBNAIL_SIZE / 2;

const THUMBNAIL_SUFFIX = `.thumb-${THUMBNAIL_SIZE}.webp`;
const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

function parseBlobUrl(url: string | null | undefined): URL | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(BLOB_HOST_SUFFIX)) return null;
  if (parsed.pathname.endsWith(THUMBNAIL_SUFFIX)) return null;
  return parsed;
}

/** Blob pathname of the thumbnail for a photo stored on Blob, or null for any other URL. */
export function thumbnailPathnameFor(photoUrl: string | null | undefined): string | null {
  const parsed = parseBlobUrl(photoUrl);
  if (!parsed) return null;
  return `${decodeURIComponent(parsed.pathname.slice(1))}${THUMBNAIL_SUFFIX}`;
}

/** Public URL of the thumbnail for a photo stored on Blob, or null for any other URL. */
export function thumbnailUrlFor(photoUrl: string | null | undefined): string | null {
  const parsed = parseBlobUrl(photoUrl);
  if (!parsed) return null;
  return `${parsed.origin}${parsed.pathname}${THUMBNAIL_SUFFIX}`;
}
