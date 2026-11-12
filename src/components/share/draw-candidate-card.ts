import { initialsOf, type CardStat } from "@/lib/share-card";
import {
  CARD_INNER,
  CARD_MARGIN,
  INK,
  MUTED,
  drawCardFooter,
  drawFittedText,
  drawPortrait,
  drawPresidentialBand,
  drawStatTiles,
  fillPage,
  roundedRect,
  type CardFonts,
} from "./card-canvas";

export interface CandidateCardInput {
  fullName: string;
  /** Party label, or null: the card then says nothing rather than guessing "sans étiquette". */
  partyLabel: string | null;
  /** The day the card is made. Its counters are true on that day and say so. */
  asOfLabel: string;
  round1Label: string | null;
  /** Already filtered: only what Poligraph holds for this person. */
  stats: readonly CardStat[];
}

export const CANDIDATE_CARD_JUSTICE_NOTE =
  "Les procédures que Poligraph a pu documenter se consultent sur la fiche, avec leur statut et leurs sources.";

/**
 * Draws the card of one presidential candidacy.
 *
 * No candidacy status and no judicial count. A status changes, and an image cannot be corrected
 * once it is out. A count of procedures printed beside a face weighs on the reader with nothing to
 * tell a conviction from a mention: the card points to the fiche, where each one carries its status.
 * The same sentence is drawn for every candidate, whatever the fiche holds.
 */
export function drawCandidateCard(
  ctx: CanvasRenderingContext2D,
  input: CandidateCardInput,
  fonts: CardFonts,
  portrait: HTMLImageElement | null
) {
  fillPage(ctx);
  const bodyTop = drawPresidentialBand(ctx, fonts, {
    context: `Fiche candidat · au ${input.asOfLabel}`,
    side: input.round1Label ? { label: "Premier tour", value: input.round1Label } : null,
  });

  const portraitSize = 150;
  const top = bodyTop + 44;
  drawPortrait(ctx, fonts, {
    image: portrait,
    initials: initialsOf(input.fullName),
    x: CARD_MARGIN,
    y: top,
    size: portraitSize,
  });

  const textX = CARD_MARGIN + portraitSize + 32;
  const textWidth = CARD_INNER - portraitSize - 32;
  ctx.fillStyle = INK;
  const nameBottom = drawFittedText(ctx, input.fullName, {
    x: textX,
    top: top + (input.partyLabel ? 2 : 30),
    width: textWidth,
    font: (size) => `800 ${size}px ${fonts.display}`,
    steps: [
      { size: 66, maxLines: 1 },
      { size: 52, maxLines: 2 },
    ],
    lineHeight: 1.08,
  });
  if (input.partyLabel) {
    ctx.fillStyle = MUTED;
    drawFittedText(ctx, input.partyLabel, {
      x: textX,
      top: nameBottom + 16,
      width: textWidth,
      font: (size) => `400 ${size}px ${fonts.body}`,
      steps: [{ size: 32, maxLines: 1 }],
    });
  }

  let y = top + portraitSize + 64;
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

  const boxHeight = 150;
  roundedRect(ctx, CARD_MARGIN, y, CARD_INNER, boxHeight, 24);
  ctx.fillStyle = "#f8fafc";
  ctx.fill();
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#334155";
  ctx.font = `700 30px ${fonts.body}`;
  ctx.fillText("Justice", CARD_MARGIN + 28, y + 50);
  drawFittedText(ctx, CANDIDATE_CARD_JUSTICE_NOTE, {
    x: CARD_MARGIN + 28,
    top: y + 62,
    width: CARD_INNER - 56,
    font: (size) => `400 ${size}px ${fonts.body}`,
    steps: [{ size: 27, maxLines: 2 }],
    lineHeight: 1.3,
  });

  drawCardFooter(ctx, fonts, {
    callToAction: "La fiche complète sur poligraph.fr",
    note: "Même fiche pour chaque candidature. Les données présentées peuvent être incomplètes.",
  });
}
