import { fitLines } from "@/lib/share-card";
import {
  CARD_INNER,
  CARD_MARGIN,
  INK,
  MUTED,
  RULE,
  TILE,
  drawBrandHeader,
  drawCardFooter,
  drawFittedText,
  fillPage,
  roundedRect,
  type CardFonts,
} from "./card-canvas";

export interface FactCheckCardInput {
  /** The checked statement, as the fact-checker recorded it. */
  claimText: string;
  claimant: string | null;
  /** The verdict in words, from the normalised rating. Never a colour alone. */
  verdictLabel: string;
  /** The outlet that reached the verdict. */
  source: string;
  publishedLabel: string;
}

const BOX_PADDING = 36;

/**
 * Draws the card of one fact-check.
 *
 * The verdict is not Poligraph's: the card names the outlet that reached it on the same line as
 * the verdict itself, so the image cannot be read as our own judgment on the person quoted.
 */
export function drawFactCheckCard(
  ctx: CanvasRenderingContext2D,
  input: FactCheckCardInput,
  fonts: CardFonts
) {
  fillPage(ctx);
  drawBrandHeader(ctx, fonts, `Fact-check · ${input.publishedLabel}`);

  ctx.fillStyle = MUTED;
  ctx.font = `400 32px ${fonts.body}`;
  ctx.fillText("Déclaration vérifiée", CARD_MARGIN, 232);
  let top = 252;
  if (input.claimant) {
    ctx.fillStyle = INK;
    top =
      drawFittedText(ctx, input.claimant, {
        x: CARD_MARGIN,
        top,
        width: CARD_INNER,
        font: (size) => `800 ${size}px ${fonts.display}`,
        steps: [
          { size: 52, maxLines: 1 },
          { size: 42, maxLines: 2 },
        ],
        lineHeight: 1.1,
      }) + 36;
  }

  // The box grows with the statement, so its height is known before anything is painted.
  const textWidth = CARD_INNER - BOX_PADDING * 2;
  const font = (size: number) => `700 ${size}px ${fonts.display}`;
  const { size, lines } = fitLines(
    (s, t) => {
      ctx.font = font(s);
      return ctx.measureText(t).width;
    },
    `« ${input.claimText.trim()} »`,
    textWidth,
    [
      { size: 50, maxLines: 4 },
      { size: 42, maxLines: 6 },
      { size: 34, maxLines: 8 },
    ]
  );
  const lineHeight = size * 1.22;
  const boxHeight = BOX_PADDING * 2 + size + (lines.length - 1) * lineHeight;
  roundedRect(ctx, CARD_MARGIN, top, CARD_INNER, boxHeight, 28);
  ctx.fillStyle = TILE;
  ctx.fill();
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = font(size);
  const first = top + BOX_PADDING + size * 0.86;
  lines.forEach((line, i) => ctx.fillText(line, CARD_MARGIN + BOX_PADDING, first + i * lineHeight));

  // Verdict and who reached it, read as one statement.
  const verdictTop = top + boxHeight + 44;
  ctx.fillStyle = MUTED;
  ctx.font = `400 30px ${fonts.body}`;
  ctx.fillText(`Verdict de ${input.source}`, CARD_MARGIN, verdictTop + 30);
  ctx.font = `800 44px ${fonts.display}`;
  const pillWidth = Math.min(CARD_INNER, ctx.measureText(input.verdictLabel).width + 64);
  roundedRect(ctx, CARD_MARGIN, verdictTop + 52, pillWidth, 84, 42);
  ctx.fillStyle = "#f3f4f6";
  ctx.fill();
  ctx.strokeStyle = RULE;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillText(input.verdictLabel, CARD_MARGIN + 32, verdictTop + 110);

  drawCardFooter(ctx, fonts, {
    callToAction: "L'article source sur poligraph.fr",
    note: `Le verdict provient de ${input.source}. Poligraph ne produit pas ses propres vérifications.`,
  });
}
