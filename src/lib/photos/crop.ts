import sharp from "sharp";
import { detectFaceBox, type FaceBox } from "./face-box";

/** Side of the square portrait we produce, in pixels. */
export const PORTRAIT_SIZE = 512;

/** JPEG quality for the cropped portrait. */
const PORTRAIT_QUALITY = 82;

/**
 * Crop side as a multiple of the face span.
 *
 * Shoulders are about three face widths across, so a shade over three and a
 * half frames head-and-shoulders with margin: the whole face at minimum, the
 * bust at maximum.
 */
const BUST_FACTOR = 3.4;

/**
 * Where the centre of the head sits in the finished crop, top to bottom. Above
 * the middle, so the shoulders have room and the subject is not floating.
 */
const FACE_VERTICAL_POSITION = 0.38;

/** A face span under this share of the frame's short side is treated as noise. */
const MIN_FACE_SPAN_SHARE = 0.03;

/** Never crop so tight that filling PORTRAIT_SIZE would blur the result. */
const MAX_UPSCALE = 1.7;

/**
 * Size of the head, inferred from the detected skin region.
 *
 * The region routinely runs from the forehead down through the neck into an
 * open collar, so its *height* overstates the head badly — measured on real
 * portraits it came out at 1.5 to 2 times the face. Its narrow side tracks
 * cheek-to-cheek width, which is what actually scales with the head.
 */
function faceSpan(faceBox: FaceBox): number {
  return Math.min(faceBox.width, faceBox.height);
}

export type CropStrategy = "face" | "attention";

export interface CroppedPortrait {
  buffer: Buffer;
  /** Dimensions of the source image after EXIF auto-orientation. */
  source: { width: number; height: number };
  /** The square that was extracted, in source coordinates. */
  region: { left: number; top: number; size: number };
  /** How the square was chosen. */
  strategy: CropStrategy;
  /** The face box the framing was built from, when one was found. */
  faceBox: FaceBox | null;
}

/**
 * Crop an image to a square portrait framed on the subject's face.
 *
 * Two strategies, in order of preference.
 *
 * `face`: a skin-region scan gives a face box, so the crop can be sized
 * relative to the head — `BUST_FACTOR` face heights, with the face placed
 * slightly above centre. This is what satisfies both ends of the brief: the
 * whole face plus margin at minimum, the bust at maximum, whatever the framing
 * of the source. It is the only strategy that can zoom, which matters for the
 * distant square shots where a plain cover crop changes nothing.
 *
 * `attention`: no convincing face box (greyscale archive photos, odd lighting).
 * Falls back to the largest square sharp's attention strategy will place. That
 * cannot zoom past head-and-shoulders, so it is safe but sometimes loose.
 *
 * `rotate()` runs first, with no argument, so EXIF orientation is applied before
 * any geometry is computed. Skipping it crops sideways images wrongly.
 */
export async function cropToPortrait(input: Buffer): Promise<CroppedPortrait> {
  const { width, height } = await readDimensions(input);
  if (!width || !height) {
    throw new Error("cropToPortrait: source image has no readable dimensions");
  }
  const source = { width, height };

  const attention = await findAttentionPoint(input, source);
  const faceBox = await detectFaceBox(input, source, attention);
  const region = chooseRegion(source, faceBox, attention);

  const buffer = await sharp(input)
    .rotate()
    .extract({
      left: region.left,
      top: region.top,
      width: region.size,
      height: region.size,
    })
    .resize({ width: PORTRAIT_SIZE, height: PORTRAIT_SIZE, fit: "cover" })
    .jpeg({ quality: PORTRAIT_QUALITY, mozjpeg: true })
    .toBuffer();

  return {
    buffer,
    source,
    region,
    strategy: usesFaceBox(source, faceBox) ? "face" : "attention",
    faceBox,
  };
}

/** True when the detected box is solid enough to size the crop from. */
function usesFaceBox(
  source: { width: number; height: number },
  faceBox: FaceBox | null
): faceBox is FaceBox {
  if (!faceBox) return false;
  const span = faceSpan(faceBox);
  if (span < Math.min(source.width, source.height) * MIN_FACE_SPAN_SHARE) return false;
  // A crop that has to be blown up too far would look worse than a loose one.
  return span * BUST_FACTOR >= PORTRAIT_SIZE / MAX_UPSCALE;
}

/**
 * Square to extract, in source coordinates.
 *
 * Both branches clamp into the image, so the returned square is always a valid
 * `extract()` region.
 */
function chooseRegion(
  source: { width: number; height: number },
  faceBox: FaceBox | null,
  attention: { x: number; y: number } | null
): { left: number; top: number; size: number } {
  const maxSize = Math.min(source.width, source.height);

  if (usesFaceBox(source, faceBox)) {
    const span = faceSpan(faceBox);
    const size = Math.min(maxSize, Math.round(span * BUST_FACTOR));
    // The region's top edge is the top of the forehead, so the head's centre is
    // half a span below it — not the centre of the box, which sits in the neck.
    const headCentreX = faceBox.x + faceBox.width / 2;
    const headCentreY = faceBox.y + span / 2;
    return {
      left: clamp(Math.round(headCentreX - size / 2), 0, source.width - size),
      top: clamp(Math.round(headCentreY - size * FACE_VERTICAL_POSITION), 0, source.height - size),
      size,
    };
  }

  // Largest square, centred on the attention point when we have one.
  const centreX = attention?.x ?? source.width / 2;
  const centreY = attention?.y ?? source.height / 2;
  return {
    left: clamp(Math.round(centreX - maxSize / 2), 0, source.width - maxSize),
    top: clamp(Math.round(centreY - maxSize / 2), 0, source.height - maxSize),
    size: maxSize,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * sharp's attention point, converted to source coordinates.
 *
 * `attentionX` / `attentionY` are reported in the space of the image *after* the
 * cover rescale, so dividing by that scale factor brings them back.
 */
async function findAttentionPoint(
  input: Buffer,
  source: { width: number; height: number }
): Promise<{ x: number; y: number } | null> {
  try {
    const { info } = await sharp(input)
      .rotate()
      .resize({
        width: PORTRAIT_SIZE,
        height: PORTRAIT_SIZE,
        fit: "cover",
        position: sharp.strategy.attention,
      })
      .toBuffer({ resolveWithObject: true });

    if (info.attentionX === undefined || info.attentionY === undefined) return null;

    const scale = PORTRAIT_SIZE / Math.min(source.width, source.height);
    return { x: info.attentionX / scale, y: info.attentionY / scale };
  } catch {
    return null;
  }
}

/**
 * Read an image's displayed dimensions without decoding it fully, so the
 * portrait guard can screen geometry before we spend time cropping.
 *
 * `metadata()` reports the dimensions as *stored*, and `rotate()` does not
 * change that — it only affects the pipeline output. EXIF orientations 5 to 8
 * involve a quarter turn, so the axes have to be swapped by hand. Without this,
 * a sideways-stored portrait reads as landscape and the guard rejects it as
 * "too wide".
 */
export async function readDimensions(
  input: Buffer
): Promise<{ width: number | undefined; height: number | undefined }> {
  const { width, height, orientation } = await sharp(input).metadata();
  const quarterTurned = orientation !== undefined && orientation >= 5 && orientation <= 8;
  return quarterTurned ? { width: height, height: width } : { width, height };
}
