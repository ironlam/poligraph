import {
  hemicycleDots,
  initialsOf,
  seatSharePct,
  type CardStat,
  type HemicyclePlacement,
} from "@/lib/share-card";
import {
  CARD_INNER,
  CARD_MARGIN,
  INK,
  MUTED,
  RULE,
  drawBrandHeader,
  drawCardFooter,
  drawFittedText,
  drawPortrait,
  drawStatTiles,
  fillPage,
  roundedRect,
  type CardFonts,
} from "./card-canvas";

const FALLBACK_COLOR = "#64748b";
const EMPTY_SEAT = "#d4d7dd";
const HEMICYCLE_RADIUS = 250;
const DOT_RADIUS = 7.5;
/** The words beside the dots run lower than the dots do. */
const HEMICYCLE_BLOCK_HEIGHT = 292;

/**
 * Vertical rhythm of the card. With a president the stack holds one more block: the gaps tighten
 * and the hemicycle and tiles shrink, so that the longest group name with its three indicators
 * still clears the footer.
 */
const LAYOUT = {
  regular: { afterSubline: 56, hemicycleScale: 1, afterHemicycle: 17, denseTiles: false },
  withPresident: { afterSubline: 32, hemicycleScale: 0.82, afterHemicycle: 20, denseTiles: true },
} as const;
const AFTER_PRESIDENT = 26;

/**
 * The hemicycle and, beside it, the same share in words and figures: the picture never speaks
 * alone, and a group whose colour is pale stays readable through the count.
 */
function drawHemicycle(
  ctx: CanvasRenderingContext2D,
  fonts: CardFonts,
  hemicycle: { placement: HemicyclePlacement; seatNoun: string },
  color: string,
  position: { top: number; scale: number }
): number {
  const { placement, seatNoun } = hemicycle;
  // Drawn in its own coordinates, then scaled as one block: dots and words shrink together.
  ctx.save();
  ctx.translate(CARD_MARGIN, position.top);
  ctx.scale(position.scale, position.scale);
  const top = 0;
  const centreX = HEMICYCLE_RADIUS + DOT_RADIUS;
  const baseline = top + HEMICYCLE_RADIUS + DOT_RADIUS;
  for (const dot of hemicycleDots(placement)) {
    ctx.beginPath();
    ctx.arc(
      centreX + dot.x * HEMICYCLE_RADIUS,
      baseline - dot.y * HEMICYCLE_RADIUS,
      DOT_RADIUS,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = dot.on ? color : EMPTY_SEAT;
    ctx.fill();
  }

  const textX = centreX + HEMICYCLE_RADIUS + 48;
  ctx.fillStyle = INK;
  ctx.font = `800 96px ${fonts.display}`;
  ctx.fillText(placement.seats.toLocaleString("fr-FR"), textX, top + 110);
  ctx.font = `700 32px ${fonts.body}`;
  ctx.fillText(seatNoun, textX, top + 160);
  ctx.fillText(`sur ${placement.total.toLocaleString("fr-FR")}`, textX, top + 200);
  ctx.fillStyle = MUTED;
  ctx.font = `400 28px ${fonts.body}`;
  // "Pourvus": the total is the seats filled today, not the legal size of the chamber.
  ctx.fillText(`soit ${seatSharePct(placement)} % des`, textX, top + 246);
  ctx.fillText("sièges pourvus", textX, top + 282);
  ctx.restore();
  return position.top + HEMICYCLE_BLOCK_HEIGHT * position.scale;
}

const PRESIDENT_BOX_HEIGHT = 124;
const PRESIDENT_PORTRAIT = 96;

/** Who presides the group: portrait, function with the year it started, name. */
function drawPresident(
  ctx: CanvasRenderingContext2D,
  fonts: CardFonts,
  president: { fullName: string; role: string },
  portrait: HTMLImageElement | null,
  top: number
): number {
  const padding = (PRESIDENT_BOX_HEIGHT - PRESIDENT_PORTRAIT) / 2;
  roundedRect(ctx, CARD_MARGIN, top, CARD_INNER, PRESIDENT_BOX_HEIGHT, 28);
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 2;
  ctx.stroke();
  drawPortrait(ctx, fonts, {
    image: portrait,
    initials: initialsOf(president.fullName),
    x: CARD_MARGIN + 24,
    y: top + padding,
    size: PRESIDENT_PORTRAIT,
  });
  const textX = CARD_MARGIN + 24 + PRESIDENT_PORTRAIT + 28;
  const textWidth = CARD_INNER - (textX - CARD_MARGIN) - 24;
  ctx.fillStyle = MUTED;
  drawFittedText(ctx, president.role, {
    x: textX,
    top: top + 20,
    width: textWidth,
    font: (size) => `400 ${size}px ${fonts.body}`,
    steps: [
      { size: 28, maxLines: 1 },
      { size: 24, maxLines: 1 },
    ],
  });
  ctx.fillStyle = INK;
  drawFittedText(ctx, president.fullName, {
    x: textX,
    top: top + 58,
    width: textWidth,
    font: (size) => `700 ${size}px ${fonts.display}`,
    steps: [
      { size: 44, maxLines: 1 },
      { size: 36, maxLines: 1 },
    ],
  });
  return top + PRESIDENT_BOX_HEIGHT;
}

export interface GroupCardInput {
  name: string;
  /** Code, chamber and, at the Assemblée, the legislature the group belongs to. */
  subline: string;
  /** Decorative only: the group is always named in words beside it. */
  color: string | null;
  /** The function, agreed and dated ("Présidente du groupe depuis 2024"). Null when unknown. */
  president: { fullName: string; role: string } | null;
  /** Sitting members today, null when there are none: a group of a past legislature has none. */
  members: CardStat | null;
  /** Where the group sits, null when it has no declared place: the count is then a plain tile. */
  hemicycle: { placement: HemicyclePlacement; seatNoun: string } | null;
  /** Voting indicators, each labelled with what it compares. Empty when none is published. */
  indicators: readonly CardStat[];
  /** What the indicators are computed on, and where the figures come from. */
  scope: string;
  asOfLabel: string;
}

/**
 * Draws the card of one parliamentary group.
 *
 * A group exists within a legislature: the same code can name different groups from one term to
 * the next, so the card always says which one. Its percentages travel with the words that say
 * what they compare, because "concordance 40 %" alone reads as a judgment it is not.
 */
export function drawGroupCard(
  ctx: CanvasRenderingContext2D,
  input: GroupCardInput,
  fonts: CardFonts,
  presidentPortrait: HTMLImageElement | null
) {
  fillPage(ctx);
  drawBrandHeader(ctx, fonts, `Groupe parlementaire · au ${input.asOfLabel}`);

  const barWidth = 22;
  const textX = CARD_MARGIN + barWidth + 30;
  const textWidth = CARD_INNER - barWidth - 30;
  const top = 210;
  ctx.fillStyle = INK;
  const nameBottom = drawFittedText(ctx, input.name, {
    x: textX,
    top,
    width: textWidth,
    font: (size) => `800 ${size}px ${fonts.display}`,
    steps: [
      { size: 68, maxLines: 2 },
      { size: 54, maxLines: 3 },
      { size: 44, maxLines: 4 },
    ],
    lineHeight: 1.08,
  });
  ctx.fillStyle = MUTED;
  const sublineBottom = drawFittedText(ctx, input.subline, {
    x: textX,
    top: nameBottom + 18,
    width: textWidth,
    font: (size) => `400 ${size}px ${fonts.body}`,
    steps: [
      { size: 32, maxLines: 1 },
      { size: 27, maxLines: 2 },
    ],
    lineHeight: 1.25,
  });
  roundedRect(ctx, CARD_MARGIN, top + 6, barWidth, sublineBottom - top, barWidth / 2);
  ctx.fillStyle = input.color ?? FALLBACK_COLOR;
  ctx.fill();

  const layout = input.president ? LAYOUT.withPresident : LAYOUT.regular;
  let y = sublineBottom + layout.afterSubline;
  if (input.president) {
    y = drawPresident(ctx, fonts, input.president, presidentPortrait, y) + AFTER_PRESIDENT;
  }
  if (input.hemicycle) {
    y =
      drawHemicycle(ctx, fonts, input.hemicycle, input.color ?? FALLBACK_COLOR, {
        top: y,
        scale: layout.hemicycleScale,
      }) + layout.afterHemicycle;
  }

  // One grid of two columns: three tiles side by side would cut the labels, and a percentage
  // without its words is exactly what this card must not carry. The seat count is already written
  // beside the hemicycle when there is one.
  const tiles = [
    ...(input.members && !input.hemicycle ? [input.members] : []),
    ...input.indicators,
  ];
  drawStatTiles(ctx, fonts, tiles, {
    top: y,
    columns: Math.min(2, tiles.length),
    dense: layout.denseTiles,
  });

  drawCardFooter(ctx, fonts, {
    callToAction: "Membres et votes du groupe sur poligraph.fr",
    note: input.scope,
  });
}
