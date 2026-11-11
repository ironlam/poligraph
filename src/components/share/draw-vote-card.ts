import { BRAND_NAVY, BRAND_RED } from "@/config/brand";
import { COLORS } from "@/config/colors";
import { voteShares, wrapLines, type VoteCardInput } from "@/lib/share-card";

/** 4:5, the portrait format the social networks keep whole in a feed. */
export const VOTE_CARD_WIDTH = 1080;
export const VOTE_CARD_HEIGHT = 1350;

const MARGIN = 80;
const INK = "#111111";
const MUTED = "#555555";
const RULE = "#d9d9d9";

export interface CardFonts {
  display: string;
  body: string;
}

function roundedRect(
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

/**
 * Draws the card of one scrutin. Always light, whatever the theme: the image leaves the site.
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
  const W = VOTE_CARD_WIDTH;
  const H = VOTE_CARD_HEIGHT;
  const inner = W - MARGIN * 2;
  const number = (n: number) => n.toLocaleString("fr-FR");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const band = ctx.createLinearGradient(0, 0, W, 0);
  band.addColorStop(0, BRAND_RED);
  band.addColorStop(1, BRAND_NAVY);
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, W, 14);

  ctx.textBaseline = "alphabetic";

  // Wordmark and context line.
  ctx.fillStyle = BRAND_NAVY;
  ctx.font = `800 52px ${fonts.display}`;
  ctx.textAlign = "left";
  ctx.fillText("Poligraph", MARGIN, 130);
  ctx.fillStyle = MUTED;
  ctx.font = `400 30px ${fonts.body}`;
  ctx.textAlign = "right";
  ctx.fillText(`${input.chamberLabel} · ${input.dateLabel}`, W - MARGIN, 126);
  ctx.textAlign = "left";

  // Result, as a word.
  const result = input.adopted ? "Adopté" : "Rejeté";
  ctx.font = `700 36px ${fonts.body}`;
  const pillWidth = ctx.measureText(result).width + 56;
  roundedRect(ctx, MARGIN, 190, pillWidth, 68, 34);
  ctx.fillStyle = "#f3f4f6";
  ctx.fill();
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillText(result, MARGIN + 28, 237);

  // Title: the largest of three sizes that holds on its lines, so a short title fills the card
  // and a long one still fits.
  const fit = (size: number, maxLines: number) => {
    ctx.font = `800 ${size}px ${fonts.display}`;
    return wrapLines((t) => ctx.measureText(t).width, input.title, inner, maxLines + 1);
  };
  let size = 84;
  let lines = fit(size, 3);
  if (lines.length > 3) {
    size = 68;
    lines = fit(size, 5);
  }
  if (lines.length > 5) {
    size = 56;
    ctx.font = `800 ${size}px ${fonts.display}`;
    lines = wrapLines((t) => ctx.measureText(t).width, input.title, inner, 6);
  }
  const lineHeight = size * 1.14;
  const titleTop = 300 + size;
  ctx.fillStyle = INK;
  lines.forEach((line, i) => ctx.fillText(line, MARGIN, titleTop + i * lineHeight));
  const titleBottom = titleTop + (lines.length - 1) * lineHeight;

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
  roundedRect(ctx, MARGIN, barY, inner, barH, barH / 2);
  ctx.clip();
  ctx.fillStyle = "#ececec";
  ctx.fillRect(MARGIN, barY, inner, barH);
  let x = MARGIN;
  for (const segment of segments) {
    const w = inner * segment.share;
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
  const column = inner / 3;
  counts.forEach(({ value, label }, i) => {
    const cx = MARGIN + column * i;
    ctx.fillStyle = INK;
    ctx.font = `800 72px ${fonts.display}`;
    ctx.fillText(number(value), cx, barY + barH + 100);
    ctx.fillStyle = MUTED;
    ctx.font = `400 34px ${fonts.body}`;
    ctx.fillText(label, cx, barY + barH + 150);
  });

  // Footer: where to go next, and where the figures come from.
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, H - 190);
  ctx.lineTo(W - MARGIN, H - 190);
  ctx.stroke();
  ctx.fillStyle = BRAND_NAVY;
  ctx.font = `800 40px ${fonts.display}`;
  ctx.fillText(footer.callToAction, MARGIN, H - 120);
  ctx.fillStyle = MUTED;
  ctx.font = `400 28px ${fonts.body}`;
  ctx.fillText(footer.source, MARGIN, H - 70);
}
