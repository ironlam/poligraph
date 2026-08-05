import sharp from "sharp";

/**
 * Locate the subject's face well enough to frame a portrait around it.
 *
 * This is deliberately not a machine-learning face detector. Adding one would
 * mean native TensorFlow bindings or a WASM runtime in a project that deploys to
 * Vercel, for a job that runs offline on a few hundred images. What we need is
 * narrower than recognition: a plausible face *box*, so the crop can be sized
 * relative to the head instead of to the image.
 *
 * The method is the classic pre-ML one: threshold for skin chromaticity, find
 * connected regions, and pick the region that best matches a face — roughly as
 * tall as it is wide, high in the frame, near sharp's attention point. When
 * nothing matches (greyscale archive photos, unusual lighting), the caller falls
 * back to a crop that cannot over-zoom.
 */

/** Width the image is reduced to before scanning. Keeps the scan trivial. */
const SCAN_WIDTH = 160;

export interface FaceBox {
  /** Source-image coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Skin chromaticity test, after Kovac et al. Two rules: one for ordinary
 * lighting, one for flash-washed highlights, which portraits of politicians at
 * podiums are full of.
 */
function isSkin(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  const daylight =
    r > 95 && g > 40 && b > 20 && max - min > 15 && Math.abs(r - g) > 15 && r > g && r > b;

  const flash = r > 220 && g > 210 && b > 170 && Math.abs(r - g) <= 15 && b < r && b < g;

  return daylight || flash;
}

interface Region {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  area: number;
}

/** Label connected skin regions with an iterative flood fill (4-connected). */
function findRegions(mask: Uint8Array, width: number, height: number): Region[] {
  const seen = new Uint8Array(mask.length);
  const regions: Region[] = [];
  const stack: number[] = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;

    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    let area = 0;

    stack.push(start);
    seen[start] = 1;

    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % width;
      const y = (index - x) / width;

      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const neighbours = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1,
      ];
      for (const next of neighbours) {
        if (next >= 0 && mask[next] && !seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }

    regions.push({ minX, maxX, minY, maxY, area });
  }

  return regions;
}

/** Smallest share of the frame a region must cover to be a face rather than noise. */
const MIN_AREA_SHARE = 0.004;

/** A face is roughly as tall as it is wide; anything flatter or thinner is not one. */
const MIN_ASPECT = 0.55;
const MAX_ASPECT = 1.9;

/**
 * Score a candidate region. Higher is more face-like.
 *
 * Three terms, all in 0..1: how much of the frame it covers (bigger regions are
 * more likely to be the subject than a bystander), how high it sits (faces are
 * above the middle in portraits), and how close it is to sharp's attention
 * point, which is independently drawn to the subject.
 */
function scoreRegion(
  region: Region,
  width: number,
  height: number,
  attention: { x: number; y: number } | null
): number {
  const boxWidth = region.maxX - region.minX + 1;
  const boxHeight = region.maxY - region.minY + 1;
  const centreX = region.minX + boxWidth / 2;
  const centreY = region.minY + boxHeight / 2;

  const coverage = Math.min(1, region.area / (width * height) / 0.08);
  const heightBonus = 1 - centreY / height;

  let proximity = 0.5;
  if (attention) {
    const dx = (centreX - attention.x) / width;
    const dy = (centreY - attention.y) / height;
    proximity = 1 - Math.min(1, Math.hypot(dx, dy));
  }

  // Regions that fill their bounding box are more likely a face than a
  // scattered set of skin-coloured background pixels.
  const density = region.area / (boxWidth * boxHeight);

  return coverage * 1.0 + heightBonus * 0.8 + proximity * 1.2 + density * 0.6;
}

/**
 * Find the subject's face box, in source-image coordinates, or null when no
 * region is convincing enough.
 *
 * `attention` is sharp's attention point in source coordinates; passing it
 * sharpens the choice when several people are in frame, but the function works
 * without it.
 */
export async function detectFaceBox(
  input: Buffer,
  source: { width: number; height: number },
  attention: { x: number; y: number } | null = null
): Promise<FaceBox | null> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: SCAN_WIDTH, fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (!width || !height || channels < 3) return null;

  const mask = new Uint8Array(width * height);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const offset = pixel * channels;
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    if (isSkin(r, g, b)) mask[pixel] = 1;
  }

  // Attention point expressed in scan coordinates.
  const scanAttention = attention
    ? {
        x: (attention.x / source.width) * width,
        y: (attention.y / source.height) * height,
      }
    : null;

  const candidates = findRegions(mask, width, height).filter((region) => {
    const boxWidth = region.maxX - region.minX + 1;
    const boxHeight = region.maxY - region.minY + 1;
    const aspect = boxWidth / boxHeight;
    return (
      region.area / (width * height) >= MIN_AREA_SHARE &&
      aspect >= MIN_ASPECT &&
      aspect <= MAX_ASPECT
    );
  });

  if (candidates.length === 0) return null;

  const best = candidates.reduce((a, b) =>
    scoreRegion(b, width, height, scanAttention) > scoreRegion(a, width, height, scanAttention)
      ? b
      : a
  );

  const scale = source.width / width;
  return {
    x: Math.round(best.minX * scale),
    y: Math.round(best.minY * scale),
    width: Math.round((best.maxX - best.minX + 1) * scale),
    height: Math.round((best.maxY - best.minY + 1) * scale),
  };
}
