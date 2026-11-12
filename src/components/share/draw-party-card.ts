import { initialsOf, type CardStat } from "@/lib/share-card";
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

export interface PartyCardInput {
  name: string;
  /** E.g. "PEX · Fondé en 2016". */
  subline: string;
  /** Decorative only: the party is always named in words beside it. */
  color: string | null;
  leader: { fullName: string; role: string } | null;
  /** Already filtered: only what Poligraph holds for this party. */
  stats: readonly CardStat[];
  asOfLabel: string;
}

/**
 * Draws the card of one party: who leads it and how many of its members sit where.
 *
 * No judicial figure. A count of affairs per party is a ranking in disguise: it follows the size
 * of the party and how closely the press covers it, and an image cannot carry those caveats.
 */
export function drawPartyCard(
  ctx: CanvasRenderingContext2D,
  input: PartyCardInput,
  fonts: CardFonts,
  leaderPortrait: HTMLImageElement | null
) {
  fillPage(ctx);
  drawBrandHeader(ctx, fonts, `Fiche parti · au ${input.asOfLabel}`);

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
      { size: 76, maxLines: 1 },
      { size: 60, maxLines: 2 },
      { size: 48, maxLines: 3 },
    ],
    lineHeight: 1.08,
  });
  ctx.fillStyle = MUTED;
  const sublineBottom = drawFittedText(ctx, input.subline, {
    x: textX,
    top: nameBottom + 18,
    width: textWidth,
    font: (size) => `400 ${size}px ${fonts.body}`,
    steps: [{ size: 32, maxLines: 1 }],
  });
  roundedRect(ctx, CARD_MARGIN, top + 6, barWidth, sublineBottom - top, barWidth / 2);
  ctx.fillStyle = input.color ?? "#64748b";
  ctx.fill();

  let y = sublineBottom + 60;
  if (input.leader) {
    const boxHeight = 176;
    roundedRect(ctx, CARD_MARGIN, y, CARD_INNER, boxHeight, 28);
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 2;
    ctx.stroke();
    drawPortrait(ctx, fonts, {
      image: leaderPortrait,
      initials: initialsOf(input.leader.fullName),
      x: CARD_MARGIN + 28,
      y: y + 28,
      size: 120,
    });
    const leaderX = CARD_MARGIN + 28 + 120 + 28;
    const leaderWidth = CARD_INNER - (leaderX - CARD_MARGIN) - 28;
    ctx.fillStyle = MUTED;
    drawFittedText(ctx, input.leader.role, {
      x: leaderX,
      top: y + 36,
      width: leaderWidth,
      font: (size) => `400 ${size}px ${fonts.body}`,
      steps: [{ size: 28, maxLines: 1 }],
    });
    ctx.fillStyle = INK;
    drawFittedText(ctx, input.leader.fullName, {
      x: leaderX,
      top: y + 84,
      width: leaderWidth,
      font: (size) => `700 ${size}px ${fonts.display}`,
      steps: [
        { size: 48, maxLines: 1 },
        { size: 38, maxLines: 1 },
      ],
    });
    y += boxHeight + 32;
  }

  drawStatTiles(ctx, fonts, input.stats, { top: y, columns: Math.min(2, input.stats.length) });

  drawCardFooter(ctx, fonts, {
    callToAction: "Élus, votes et programme sur poligraph.fr",
    note: "Sources : Assemblée nationale, Sénat, Parlement européen. Les données peuvent être incomplètes.",
  });
}
