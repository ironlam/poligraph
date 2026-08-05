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

/** A source with no skin tones at all, to exercise the fallback. */
async function greyscaleScene(width: number, height: number): Promise<Buffer> {
  const patch = await sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 150, g: 150, b: 150 } },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width, height, channels: 3, background: { r: 60, g: 60, b: 60 } },
  })
    .composite([{ input: patch, left: 40, top: 40 }])
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
    const headHigh = await syntheticPortrait(600, 1800, { left: 200, top: 120, size: 200 });
    const headLow = await syntheticPortrait(600, 1800, { left: 200, top: 1400, size: 200 });

    const high = await cropToPortrait(headHigh);
    const low = await cropToPortrait(headLow);

    expect(low.region.top).toBeGreaterThan(high.region.top + 800);
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

  it("falls back to the largest square when no face is found", async () => {
    const scene = await greyscaleScene(900, 1300);
    const { strategy, region } = await cropToPortrait(scene);

    expect(strategy).toBe("attention");
    // The fallback never zooms: the square is as large as the image allows.
    expect(region.size).toBe(900);
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
