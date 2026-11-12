import {
  hemicycleDots,
  seatSharePct,
  type CardStat,
  type HemicyclePlacement,
} from "@/lib/share-card";
import {
  CARD_INNER,
  CARD_MARGIN,
  INK,
  MUTED,
  drawBrandHeader,
  drawCardFooter,
  drawFittedText,
  drawStatTiles,
  fillPage,
  roundedRect,
  type CardFonts,
} from "./card-canvas";

const FALLBACK_COLOR = "#64748b";
const EMPTY_SEAT = "#d4d7dd";
const HEMICYCLE_RADIUS = 250;
const DOT_RADIUS = 7.5;

/**
 * The hemicycle and, beside it, the same share in words and figures: the picture never speaks
 * alone, and a group whose colour is pale stays readable through the count.
 */
function drawHemicycle(
  ctx: CanvasRenderingContext2D,
  fonts: CardFonts,
  hemicycle: { placement: HemicyclePlacement; seatNoun: string },
  color: string,
  top: number
): number {
  const { placement, seatNoun } = hemicycle;
  const centreX = CARD_MARGIN + HEMICYCLE_RADIUS + DOT_RADIUS;
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
  return baseline + DOT_RADIUS;
}

export interface GroupCardInput {
  name: string;
  /** Code, chamber and, at the Assemblée, the legislature the group belongs to. */
  subline: string;
  /** Decorative only: the group is always named in words beside it. */
  color: string | null;
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
  fonts: CardFonts
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

  let y = sublineBottom + 56;
  if (input.hemicycle) {
    y = drawHemicycle(ctx, fonts, input.hemicycle, input.color ?? FALLBACK_COLOR, y) + 44;
  }

  // One grid of two columns: three tiles side by side would cut the labels, and a percentage
  // without its words is exactly what this card must not carry. The seat count is already written
  // beside the hemicycle when there is one.
  const tiles = [
    ...(input.members && !input.hemicycle ? [input.members] : []),
    ...input.indicators,
  ];
  drawStatTiles(ctx, fonts, tiles, { top: y, columns: Math.min(2, tiles.length) });

  drawCardFooter(ctx, fonts, {
    callToAction: "Membres et votes du groupe sur poligraph.fr",
    note: input.scope,
  });
}
