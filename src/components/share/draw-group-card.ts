import type { CardStat } from "@/lib/share-card";
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

export interface GroupCardInput {
  name: string;
  /** Code, chamber and, at the Assemblée, the legislature the group belongs to. */
  subline: string;
  /** Decorative only: the group is always named in words beside it. */
  color: string | null;
  /** Sitting members today, null when there are none: a group of a past legislature has none. */
  members: CardStat | null;
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
  ctx.fillStyle = input.color ?? "#64748b";
  ctx.fill();

  // One grid of two columns: three tiles side by side would cut the labels, and a percentage
  // without its words is exactly what this card must not carry.
  const tiles = [...(input.members ? [input.members] : []), ...input.indicators];
  drawStatTiles(ctx, fonts, tiles, {
    top: sublineBottom + 56,
    columns: Math.min(2, tiles.length),
  });

  drawCardFooter(ctx, fonts, {
    callToAction: "Membres et votes du groupe sur poligraph.fr",
    note: input.scope,
  });
}
