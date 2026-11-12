import type { VoteCardInput } from "@/lib/share-card";
import {
  CARD_INNER,
  CARD_MARGIN,
  INK,
  RULE,
  drawBrandHeader,
  drawCardFooter,
  drawFittedText,
  drawVoteBreakdown,
  fillPage,
  roundedRect,
  type CardFonts,
} from "./card-canvas";

/**
 * Draws the card of one scrutin.
 *
 * What leaves the site obeys the same rules as the page: the result is written out, the three
 * counts carry their labels (the bar never speaks alone), and the source and date are on the image.
 */
export function drawVoteCard(
  ctx: CanvasRenderingContext2D,
  input: VoteCardInput,
  fonts: CardFonts,
  footer: { callToAction: string; source: string }
) {
  fillPage(ctx);
  drawBrandHeader(ctx, fonts, `${input.chamberLabel} · ${input.dateLabel}`);

  // Result, as a word.
  const result = input.adopted ? "Adopté" : "Rejeté";
  ctx.font = `700 36px ${fonts.body}`;
  const pillWidth = ctx.measureText(result).width + 56;
  roundedRect(ctx, CARD_MARGIN, 190, pillWidth, 68, 34);
  ctx.fillStyle = "#f3f4f6";
  ctx.fill();
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillText(result, CARD_MARGIN + 28, 237);

  ctx.fillStyle = INK;
  const titleBottom = drawFittedText(ctx, input.title, {
    x: CARD_MARGIN,
    top: 300,
    width: CARD_INNER,
    font: (size) => `800 ${size}px ${fonts.display}`,
    steps: [
      { size: 84, maxLines: 3 },
      { size: 68, maxLines: 5 },
      { size: 56, maxLines: 6 },
    ],
    lineHeight: 1.14,
  });

  // Breakdown bar and counts follow the title, without rising above the middle of the card.
  const barY = Math.min(860, Math.max(700, titleBottom + 130));
  drawVoteBreakdown(ctx, fonts, input, { top: barY, numberSize: 72 });

  drawCardFooter(ctx, fonts, { callToAction: footer.callToAction, note: footer.source });
}
