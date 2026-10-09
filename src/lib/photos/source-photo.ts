/**
 * Decide whether bytes downloaded from a photo source are an actual portrait.
 *
 * A 200 does not mean a photo. Public French institutional sites answer an
 * interstitial or a blocking page with a 200 and an HTML body, and NosSénateurs
 * answers a missing portrait with a black 82x120 PNG of 129 bytes. Both used to
 * pass a HEAD check, so the profile showed a web page or a black box.
 *
 * The bytes are identified by their signature rather than by the Content-Type
 * header, which a source may omit or get wrong.
 */

/**
 * Below this, an image is a placeholder. The smallest real portrait measured in
 * the Blob store on 2026-10-07 was 4676 bytes (1293 copies), the NosSénateurs
 * placeholder is 129.
 */
export const MIN_PHOTO_BYTES = 1024;

const SIGNATURES: Array<{ contentType: string; matches: (b: Buffer) => boolean }> = [
  { contentType: "image/jpeg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    contentType: "image/png",
    matches: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { contentType: "image/gif", matches: (b) => b.subarray(0, 4).toString("latin1") === "GIF8" },
  {
    contentType: "image/webp",
    matches: (b) =>
      b.subarray(0, 4).toString("latin1") === "RIFF" &&
      b.subarray(8, 12).toString("latin1") === "WEBP",
  },
];

export type PhotoBytes =
  | { kind: "photo"; contentType: string }
  /** An image, but too small to be a portrait: a placeholder. */
  | { kind: "placeholder" }
  /** Not an image at all: an HTML interstitial, an error page, an empty body. */
  | { kind: "not-an-image" };

/**
 * Tell a placeholder apart from a page that is not an image. Only the first is evidence that the
 * source has no portrait; a 200 HTML page may be a temporary anti-bot interstitial and must never
 * cause a working photo to be removed.
 */
export function classifyPhotoBytes(buffer: Buffer): PhotoBytes {
  const signature = SIGNATURES.find((s) => s.matches(buffer));
  if (!signature) return { kind: "not-an-image" };
  if (buffer.length < MIN_PHOTO_BYTES) return { kind: "placeholder" };
  return { kind: "photo", contentType: signature.contentType };
}

export function identifyPhoto(buffer: Buffer): { contentType: string } | null {
  if (buffer.length < MIN_PHOTO_BYTES) return null;
  const signature = SIGNATURES.find((s) => s.matches(buffer));
  return signature ? { contentType: signature.contentType } : null;
}
