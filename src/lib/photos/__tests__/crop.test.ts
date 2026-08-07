import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { cropToPortrait, PORTRAIT_SIZE, readDimensions } from "../crop";

/**
 * Synthetic sources: a skin-toned "head" blob on a flat cool background. Both
 * the skin-region scan and sharp's attention strategy are drawn to it, which
 * lets us assert framing without depending on a network fixture.
 */
async function syntheticPortrait(
  width: number,
  height: number,
  head: { left: number; top: number; size: number }
): Promise<Buffer> {
  const blob = await sharp({
    create: {
      width: head.size,
      height: head.size,
      channels: 3,
      background: { r: 205, g: 145, b: 115 },
    },
  })
    .png()
    .toBuffer();

  return sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 40, b: 90 } },
  })
    .composite([{ input: blob, left: head.left, top: head.top }])
    .jpeg()
    .toBuffer();
}

/**
 * A source with no skin tones at all, to exercise the fallback. The lone bright
 * patch is what sharp's attention strategy locks onto, so moving it moves the
 * attention point.
 */
async function greyscaleScene(
  width: number,
  height: number,
  patchAt: { left: number; top: number } = { left: 40, top: 40 }
): Promise<Buffer> {
  const patch = await sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 150, g: 150, b: 150 } },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width, height, channels: 3, background: { r: 60, g: 60, b: 60 } },
  })
    .composite([{ input: patch, left: patchAt.left, top: patchAt.top }])
    .jpeg()
    .toBuffer();
}

describe("cropToPortrait", () => {
  it("returns a square JPEG at the portrait size", async () => {
    const source = await syntheticPortrait(900, 1400, { left: 300, top: 150, size: 300 });
    const { buffer } = await cropToPortrait(source);

    const meta = await sharp(buffer).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(PORTRAIT_SIZE);
    expect(meta.height).toBe(PORTRAIT_SIZE);
  });

  it("reports the source dimensions it worked from", async () => {
    const source = await syntheticPortrait(900, 1400, { left: 300, top: 150, size: 300 });
    const { source: dims } = await cropToPortrait(source);
    expect(dims).toEqual({ width: 900, height: 1400 });
  });

  it("zooms towards the head on a distant square shot", async () => {
    // The case a plain cover crop cannot fix: square source, small subject. The
    // extracted square must be a fraction of the frame, not the whole frame.
    const distant = await syntheticPortrait(960, 960, { left: 420, top: 220, size: 120 });
    const { region, strategy } = await cropToPortrait(distant);

    expect(strategy).toBe("face");
    expect(region.size).toBeLessThan(600);
  });

  it("sizes the crop from the head, so a bigger head yields a bigger square", async () => {
    const small = await syntheticPortrait(960, 1200, { left: 430, top: 200, size: 140 });
    const large = await syntheticPortrait(960, 1200, { left: 330, top: 200, size: 340 });

    const smallCrop = await cropToPortrait(small);
    const largeCrop = await cropToPortrait(large);

    expect(largeCrop.region.size).toBeGreaterThan(smallCrop.region.size);
  });

  it("keeps the whole head inside the crop, with margin", async () => {
    const head = { left: 380, top: 260, size: 200 };
    const source = await syntheticPortrait(960, 1400, head);
    const { region } = await cropToPortrait(source);

    expect(region.left).toBeLessThanOrEqual(head.left);
    expect(region.top).toBeLessThanOrEqual(head.top);
    expect(region.left + region.size).toBeGreaterThanOrEqual(head.left + head.size);
    expect(region.top + region.size).toBeGreaterThanOrEqual(head.top + head.size);
  });

  it("follows the head down a tall photo instead of centring", async () => {
    // Both heads sit above MAX_HEAD_CENTRE_SHARE, so both are framed by the face
    // strategy. Asserting that is the point: only the face strategy is allowed to
    // move the square down the frame, and a head placed lower than this is not a
    // head at all — it is the hand the guard exists to reject.
    const headHigh = await syntheticPortrait(600, 1800, { left: 200, top: 120, size: 200 });
    const headLow = await syntheticPortrait(600, 1800, { left: 200, top: 800, size: 200 });

    const high = await cropToPortrait(headHigh);
    const low = await cropToPortrait(headLow);

    expect(high.strategy).toBe("face");
    expect(low.strategy).toBe("face");
    expect(low.region.top).toBeGreaterThan(high.region.top + 500);
  });

  it("always returns a region inside the source bounds", async () => {
    // Head jammed into a corner: the clamped region must still be extractable.
    const corner = await syntheticPortrait(800, 1000, { left: 0, top: 0, size: 180 });
    const { region, source } = await cropToPortrait(corner);

    expect(region.left).toBeGreaterThanOrEqual(0);
    expect(region.top).toBeGreaterThanOrEqual(0);
    expect(region.left + region.size).toBeLessThanOrEqual(source.width);
    expect(region.top + region.size).toBeLessThanOrEqual(source.height);
  });

  it("refuses to size the crop from a skin region low in the frame", async () => {
    // A gesturing hand over a warm-toned background, no head. In a portrait the
    // head is up top, so a region centred this low is not one; framing from it
    // published a portrait of a hand on François Alfonsi's file.
    const handLow = await syntheticPortrait(960, 1200, { left: 500, top: 860, size: 180 });
    const { strategy, region } = await cropToPortrait(handLow);

    expect(strategy).toBe("attention");
    expect(region.size).toBe(960);
  });

  it("still frames from a head in the upper half", async () => {
    const headHigh = await syntheticPortrait(960, 1200, { left: 400, top: 180, size: 180 });
    expect((await cropToPortrait(headHigh)).strategy).toBe("face");
  });

  it("falls back to the largest square when no face is found", async () => {
    const scene = await greyscaleScene(900, 1300);
    const { strategy, region } = await cropToPortrait(scene);

    expect(strategy).toBe("attention");
    // The fallback never zooms: the square is as large as the image allows.
    expect(region.size).toBe(900);
  });

  it("anchors the fallback to the top even when attention is drawn low", async () => {
    // The failure this locks out. No face found, and the only thing in frame for
    // sharp to lock onto sits near the bottom. Letting it choose the vertical
    // offset published squares that started below the subject's chin, so a
    // portrait that was correct at the source came out decapitated.
    const scene = await greyscaleScene(900, 1600, { left: 350, top: 1350 });
    const { strategy, region } = await cropToPortrait(scene);

    expect(strategy).toBe("attention");
    expect(region.top).toBe(0);
  });

  it("applies EXIF orientation before cropping", async () => {
    // orient 6 = rotate 90 CW on display, so a 1400x900 file renders 900x1400.
    const landscape = await syntheticPortrait(1400, 900, { left: 600, top: 200, size: 300 });
    const rotated = await sharp(landscape).withMetadata({ orientation: 6 }).jpeg().toBuffer();

    const { source } = await cropToPortrait(rotated);
    expect(source).toEqual({ width: 900, height: 1400 });
  });

  it("rejects an unreadable buffer", async () => {
    await expect(cropToPortrait(Buffer.from("not an image"))).rejects.toThrow();
  });
});

describe("readDimensions", () => {
  it("reports post-orientation dimensions", async () => {
    const landscape = await syntheticPortrait(1400, 900, { left: 600, top: 200, size: 300 });
    const rotated = await sharp(landscape).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    await expect(readDimensions(rotated)).resolves.toEqual({ width: 900, height: 1400 });
  });
});
