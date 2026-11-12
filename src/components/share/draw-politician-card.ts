import { initialsOf, type CardStat } from "@/lib/share-card";
import {
  CARD_INNER,
  CARD_MARGIN,
  INK,
  MUTED,
  drawBrandHeader,
  drawCardFooter,
  drawFittedText,
  drawJusticeNote,
  drawPortrait,
  drawStatTiles,
  drawVoteBreakdown,
  fillPage,
  type CardFonts,
  type VoteCounts,
} from "./card-canvas";

export interface PoliticianCardInput {
  fullName: string;
  /** Current mandate as the fiche titles it, or null for someone holding none today. */
  mandateLabel: string | null;
  partyLabel: string | null;
  /** Recorded votes, null for someone who never sat in a chamber Poligraph follows. */
  votes: VoteCounts | null;
  /** Already filtered: only what Poligraph holds for this person. */
  stats: readonly CardStat[];
  asOfLabel: string;
}

/**
 * Draws the card of one politician: who they are, how they voted, what Poligraph documents.
 *
 * Same rule as every card about a person: no judicial count, and one sentence on justice that is
 * identical for everyone (see `drawJusticeNote`).
 */
export function drawPoliticianCard(
  ctx: CanvasRenderingContext2D,
  input: PoliticianCardInput,
  fonts: CardFonts,
  portrait: HTMLImageElement | null
) {
  fillPage(ctx);
  drawBrandHeader(ctx, fonts, `Fiche · au ${input.asOfLabel}`);

  const portraitSize = 150;
  const top = 196;
  drawPortrait(ctx, fonts, {
    image: portrait,
    initials: initialsOf(input.fullName),
    x: CARD_MARGIN,
    y: top,
    size: portraitSize,
  });

  const textX = CARD_MARGIN + portraitSize + 32;
  const textWidth = CARD_INNER - portraitSize - 32;
  const sublines = [input.mandateLabel, input.partyLabel].filter(
    (line): line is string => line !== null
  );
  ctx.fillStyle = INK;
  let bottom = drawFittedText(ctx, input.fullName, {
    x: textX,
    top: top + (sublines.length === 2 ? -8 : sublines.length === 1 ? 14 : 40),
    width: textWidth,
    font: (size) => `800 ${size}px ${fonts.display}`,
    steps: [
      { size: 64, maxLines: 1 },
      { size: 50, maxLines: 1 },
      { size: 42, maxLines: 2 },
    ],
    lineHeight: 1.08,
  });
  ctx.fillStyle = MUTED;
  for (const line of sublines) {
    bottom = drawFittedText(ctx, line, {
      x: textX,
      top: bottom + 14,
      width: textWidth,
      font: (size) => `400 ${size}px ${fonts.body}`,
      steps: [
        { size: 30, maxLines: 1 },
        { size: 26, maxLines: 1 },
      ],
    });
  }

  let y = Math.max(top + portraitSize, bottom) + 70;
  if (input.votes) {
    ctx.fillStyle = INK;
    ctx.font = `700 30px ${fonts.body}`;
    ctx.fillText("Ses votes enregistrés au Parlement", CARD_MARGIN, y);
    y = drawVoteBreakdown(ctx, fonts, input.votes, { top: y + 26, numberSize: 56 }) + 64;
  }
  if (input.stats.length > 0) {
    ctx.fillStyle = INK;
    ctx.font = `700 30px ${fonts.body}`;
    ctx.fillText("Ce que Poligraph documente", CARD_MARGIN, y);
    y =
      drawStatTiles(ctx, fonts, input.stats, {
        top: y + 24,
        columns: Math.min(3, input.stats.length),
      }) + 28;
  }
  drawJusticeNote(ctx, fonts, y);

  drawCardFooter(ctx, fonts, {
    callToAction: "La fiche complète sur poligraph.fr",
    note: "Même fiche pour chaque responsable politique. Les données présentées peuvent être incomplètes.",
  });
}
