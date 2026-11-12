import { COLORS } from "@/config/colors";
import { voteShares, type VoteCardInput } from "@/lib/share-card";
import {
  CARD_INNER,
  CARD_MARGIN,
  INK,
  MUTED,
  RULE,
  drawBrandHeader,
  drawCardFooter,
  drawFittedText,
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
  const number = (n: number) => n.toLocaleString("fr-FR");

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
  const shares = voteShares(input);
  const barY = Math.min(860, Math.max(700, titleBottom + 130));
  const barH = 44;
  const segments = [
    { share: shares.pour, color: COLORS.vote.pour.light },
    { share: shares.contre, color: COLORS.vote.contre.light },
    { share: shares.abstention, color: COLORS.vote.abstention.light },
  ];
  ctx.save();
  roundedRect(ctx, CARD_MARGIN, barY, CARD_INNER, barH, barH / 2);
  ctx.clip();
  ctx.fillStyle = "#ececec";
  ctx.fillRect(CARD_MARGIN, barY, CARD_INNER, barH);
  let x = CARD_MARGIN;
  for (const segment of segments) {
    const w = CARD_INNER * segment.share;
    ctx.fillStyle = segment.color;
    ctx.fillRect(x, barY, w, barH);
    x += w;
  }
  ctx.restore();

  const counts = [
    { value: input.votesFor, label: "pour" },
    { value: input.votesAgainst, label: "contre" },
    { value: input.votesAbstain, label: input.votesAbstain > 1 ? "abstentions" : "abstention" },
  ];
  const column = CARD_INNER / 3;
  counts.forEach(({ value, label }, i) => {
    const cx = CARD_MARGIN + column * i;
    ctx.fillStyle = INK;
    ctx.font = `800 72px ${fonts.display}`;
    ctx.fillText(number(value), cx, barY + barH + 100);
    ctx.fillStyle = MUTED;
    ctx.font = `400 34px ${fonts.body}`;
    ctx.fillText(label, cx, barY + barH + 150);
  });

  drawCardFooter(ctx, fonts, { callToAction: footer.callToAction, note: footer.source });
}
