import { BRAND_NAVY, BRAND_RED } from "@/config/brand";
import { fitLines, type CardStat, type FitStep } from "@/lib/share-card";

/**
 * Shared pieces of the share cards. Every card is drawn in the browser from data its page already
 * holds, always light whatever the theme: the image leaves the site.
 */

/** 4:5, the portrait format the social networks keep whole in a feed. */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;
export const CARD_MARGIN = 72;
export const CARD_INNER = CARD_WIDTH - CARD_MARGIN * 2;

export const INK = "#111111";
export const MUTED = "#555555";
export const RULE = "#d9d9d9";
export const TILE = "#f4f4f5";
const ON_NAVY_MUTED = "#d6deea";

export interface CardFonts {
  display: string;
  body: string;
}

export type CardDraw = (ctx: CanvasRenderingContext2D, fonts: CardFonts) => void | Promise<void>;

export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function fillPage(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
}

/** Fits `text` in `width` over the given steps and draws it. Returns the last baseline. */
export function drawFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  options: {
    x: number;
    top: number;
    width: number;
    font: (size: number) => string;
    steps: readonly FitStep[];
    lineHeight?: number;
  }
): number {
  const { size, lines } = fitLines(
    (s, t) => {
      ctx.font = options.font(s);
      return ctx.measureText(t).width;
    },
    text,
    options.width,
    options.steps
  );
  ctx.font = options.font(size);
  const lineHeight = size * (options.lineHeight ?? 1.16);
  const first = options.top + size;
  lines.forEach((line, i) => ctx.fillText(line, options.x, first + i * lineHeight));
  return first + (lines.length - 1) * lineHeight;
}

/** The site's header: gradient rule, wordmark, and what the card is about on the right. */
export function drawBrandHeader(ctx: CanvasRenderingContext2D, fonts: CardFonts, context: string) {
  const band = ctx.createLinearGradient(0, 0, CARD_WIDTH, 0);
  band.addColorStop(0, BRAND_RED);
  band.addColorStop(1, BRAND_NAVY);
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, CARD_WIDTH, 14);

  ctx.fillStyle = BRAND_NAVY;
  ctx.font = `800 52px ${fonts.display}`;
  ctx.fillText("Poligraph", CARD_MARGIN, 130);
  ctx.fillStyle = MUTED;
  ctx.font = `400 30px ${fonts.body}`;
  ctx.textAlign = "right";
  ctx.fillText(context, CARD_WIDTH - CARD_MARGIN, 126);
  ctx.textAlign = "left";
}

export const PRESIDENTIAL_BAND_HEIGHT = 330;

/**
 * The 2027 header: a navy band carrying the election, closed by the red rule. It marks the cards
 * of the presidential hub apart from the rest of the site. Returns where the body starts.
 */
export function drawPresidentialBand(
  ctx: CanvasRenderingContext2D,
  fonts: CardFonts,
  band: { context: string; side: { label: string; value: string } | null }
): number {
  const right = CARD_WIDTH - CARD_MARGIN;
  ctx.fillStyle = BRAND_NAVY;
  ctx.fillRect(0, 0, CARD_WIDTH, PRESIDENTIAL_BAND_HEIGHT - 10);
  ctx.fillStyle = BRAND_RED;
  ctx.fillRect(0, PRESIDENTIAL_BAND_HEIGHT - 10, CARD_WIDTH, 10);

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 44px ${fonts.display}`;
  ctx.fillText("Poligraph", CARD_MARGIN, 88);
  ctx.fillStyle = ON_NAVY_MUTED;
  ctx.font = `400 28px ${fonts.body}`;
  ctx.textAlign = "right";
  ctx.fillText(band.context, right, 86);
  ctx.textAlign = "left";

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 40px ${fonts.display}`;
  ctx.fillText("Élection présidentielle", CARD_MARGIN, 168);
  ctx.font = `800 136px ${fonts.display}`;
  ctx.fillText("2027", CARD_MARGIN - 4, 286);

  if (band.side) {
    ctx.textAlign = "right";
    ctx.fillStyle = ON_NAVY_MUTED;
    ctx.font = `400 28px ${fonts.body}`;
    ctx.fillText(band.side.label, right, 232);
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 40px ${fonts.display}`;
    ctx.fillText(band.side.value, right, 282);
    ctx.textAlign = "left";
  }
  return PRESIDENTIAL_BAND_HEIGHT;
}

/** Where to go next, and where what the card shows comes from. */
export function drawCardFooter(
  ctx: CanvasRenderingContext2D,
  fonts: CardFonts,
  footer: { callToAction: string; note: string }
) {
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CARD_MARGIN, CARD_HEIGHT - 190);
  ctx.lineTo(CARD_WIDTH - CARD_MARGIN, CARD_HEIGHT - 190);
  ctx.stroke();
  ctx.fillStyle = BRAND_NAVY;
  ctx.font = `800 40px ${fonts.display}`;
  ctx.fillText(footer.callToAction, CARD_MARGIN, CARD_HEIGHT - 120);
  ctx.fillStyle = MUTED;
  drawFittedText(ctx, footer.note, {
    x: CARD_MARGIN,
    top: CARD_HEIGHT - 98,
    width: CARD_INNER,
    font: (size) => `400 ${size}px ${fonts.body}`,
    steps: [
      { size: 28, maxLines: 1 },
      { size: 24, maxLines: 2 },
    ],
    lineHeight: 1.3,
  });
}

const TILE_HEIGHT = 150;
const TILE_GAP = 16;

/** Counters as tiles: the figure, and under it the words that say what it counts. */
export function drawStatTiles(
  ctx: CanvasRenderingContext2D,
  fonts: CardFonts,
  stats: readonly CardStat[],
  options: { top: number; columns: number }
): number {
  if (stats.length === 0) return options.top;
  const width = (CARD_INNER - TILE_GAP * (options.columns - 1)) / options.columns;
  stats.forEach((stat, i) => {
    const x = CARD_MARGIN + (i % options.columns) * (width + TILE_GAP);
    const y = options.top + Math.floor(i / options.columns) * (TILE_HEIGHT + TILE_GAP);
    roundedRect(ctx, x, y, width, TILE_HEIGHT, 24);
    ctx.fillStyle = TILE;
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = `800 56px ${fonts.display}`;
    ctx.fillText(stat.value.toLocaleString("fr-FR"), x + 24, y + 72);
    ctx.fillStyle = INK;
    drawFittedText(ctx, stat.label, {
      x: x + 24,
      top: y + 88,
      width: width - 48,
      font: (size) => `400 ${size}px ${fonts.body}`,
      steps: [
        { size: 28, maxLines: 1 },
        { size: 23, maxLines: 2 },
      ],
      lineHeight: 1.1,
    });
  });
  const rows = Math.ceil(stats.length / options.columns);
  return options.top + rows * TILE_HEIGHT + (rows - 1) * TILE_GAP;
}

function imageSize(image: HTMLImageElement): { width: number; height: number } {
  return { width: image.naturalWidth, height: image.naturalHeight };
}

/** A round portrait, or the initials when there is no image to draw. */
export function drawPortrait(
  ctx: CanvasRenderingContext2D,
  fonts: CardFonts,
  portrait: {
    image: CanvasImageSource | null;
    initials: string;
    x: number;
    y: number;
    size: number;
  }
) {
  const { x, y, size } = portrait;
  const radius = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + radius, y + radius, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = "#eef1f6";
  ctx.fillRect(x, y, size, size);
  if (portrait.image) {
    // Centre crop to a square, as `object-cover` does on the page: a portrait is rarely square.
    const { width, height } = imageSize(portrait.image);
    const side = Math.min(width, height);
    ctx.drawImage(
      portrait.image,
      (width - side) / 2,
      (height - side) / 2,
      side,
      side,
      x,
      y,
      size,
      size
    );
  } else {
    ctx.fillStyle = BRAND_NAVY;
    ctx.font = `700 ${Math.round(size * 0.36)}px ${fonts.display}`;
    ctx.textAlign = "center";
    ctx.fillText(portrait.initials, x + radius, y + radius + size * 0.13);
    ctx.textAlign = "left";
  }
  ctx.restore();
}

/**
 * Loads a portrait through the site's own image optimizer. Same origin, so the canvas stays
 * exportable: an image drawn straight from a remote host would taint it and block the download.
 * Resolves to null on any failure, and the card falls back to initials.
 */
export function loadPortrait(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = `/_next/image?url=${encodeURIComponent(url)}&w=256&q=75`;
  });
}
