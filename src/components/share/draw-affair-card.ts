import type { CertaintyLevel } from "@/config/certainty";
import type { AffairCardInput } from "@/lib/affairs/share-card";
import { fitLines } from "@/lib/share-card";
import {
  CARD_HEIGHT,
  CARD_INNER,
  CARD_MARGIN,
  INK,
  MUTED,
  drawBrandHeader,
  drawCardFooter,
  drawFittedText,
  fillPage,
  roundedRect,
  type CardFonts,
} from "./card-canvas";

/** Tint of the status pill. The level is always written in it: the colour only seconds the words. */
const PILL: Record<CertaintyLevel, { border: string; fill: string; ink: string }> = {
  ETABLI: { border: "#fca5a5", fill: "#fef2f2", ink: "#991b1b" },
  PRONONCE: { border: "#fcd34d", fill: "#fffbeb", ink: "#78350f" },
  EN_COURS: { border: "#cbd5e1", fill: "#f8fafc", ink: "#334155" },
  CLOS_SANS_CHARGE: { border: "#cbd5e1", fill: "#f8fafc", ink: "#334155" },
  CLOS_FAVORABLE: { border: "#86efac", fill: "#f0fdf4", ink: "#166534" },
};

const BOX_PADDING = 30;
const FOOTER_RULE = CARD_HEIGHT - 190;

/**
 * Draws the share card of an affair, from what `buildAffairShareCard` allowed.
 *
 * No portrait, on purpose: a face beside a judicial status stigmatises more than a name does, and
 * the image cannot be corrected once it has left the site. The status is dated for the same
 * reason, and the footer says where to ask for a correction.
 */
export function drawAffairCard(
  ctx: CanvasRenderingContext2D,
  input: AffairCardInput,
  fonts: CardFonts,
  asOfLabel: string
) {
  fillPage(ctx);
  drawBrandHeader(ctx, fonts, `Affaire judiciaire · statut au ${asOfLabel}`);

  // Status, in words.
  const pill = PILL[input.certainty];
  ctx.font = `700 34px ${fonts.body}`;
  const pillWidth = Math.min(CARD_INNER, ctx.measureText(input.certaintyLabel).width + 60);
  roundedRect(ctx, CARD_MARGIN, 186, pillWidth, 68, 34);
  ctx.fillStyle = pill.fill;
  ctx.fill();
  ctx.strokeStyle = pill.border;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = pill.ink;
  ctx.fillText(input.certaintyLabel, CARD_MARGIN + 30, 232);

  let y = 276;
  if (input.stepLabel) {
    ctx.fillStyle = MUTED;
    y =
      drawFittedText(ctx, `Étape : ${input.stepLabel}`, {
        x: CARD_MARGIN,
        top: y,
        width: CARD_INNER,
        font: (size) => `400 ${size}px ${fonts.body}`,
        steps: [{ size: 28, maxLines: 2 }],
        lineHeight: 1.25,
      }) + 22;
  }

  ctx.fillStyle = INK;
  y =
    drawFittedText(ctx, input.title, {
      x: CARD_MARGIN,
      top: y,
      width: CARD_INNER,
      font: (size) => `800 ${size}px ${fonts.display}`,
      steps: [
        { size: 60, maxLines: 2 },
        { size: 50, maxLines: 3 },
        { size: 42, maxLines: 4 },
      ],
      lineHeight: 1.12,
    }) + 44;

  // Who, and how they stand in the procedure today.
  ctx.fillStyle = MUTED;
  ctx.font = `400 28px ${fonts.body}`;
  ctx.fillText(input.roleLabel, CARD_MARGIN, y + 28);
  ctx.fillStyle = INK;
  y = drawFittedText(ctx, input.fullName, {
    x: CARD_MARGIN,
    top: y + 44,
    width: CARD_INNER,
    font: (size) => `700 ${size}px ${fonts.display}`,
    steps: [
      { size: 46, maxLines: 1 },
      { size: 38, maxLines: 2 },
    ],
    lineHeight: 1.1,
  });
  if (input.partyAtTime) {
    ctx.fillStyle = MUTED;
    y = drawFittedText(ctx, `${input.partyAtTime}, au moment des faits`, {
      x: CARD_MARGIN,
      top: y + 12,
      width: CARD_INNER,
      font: (size) => `400 ${size}px ${fonts.body}`,
      steps: [{ size: 28, maxLines: 1 }],
    });
  }

  // The site's own notice for this level, then the sentence when a court pronounced one.
  const textWidth = CARD_INNER - BOX_PADDING * 2;
  const bodyFont = `400 27px ${fonts.body}`;
  const wrap = (text: string, maxLines: number) =>
    fitLines(
      (_, t) => {
        ctx.font = bodyFont;
        return ctx.measureText(t).width;
      },
      text,
      textWidth,
      [{ size: 27, maxLines }]
    ).lines;
  const noticeLines = wrap(input.notice, 5);
  const sentenceLines = input.sentence ? wrap(`Peine prononcée : ${input.sentence}`, 3) : [];
  const lineHeight = 36;
  const gap = sentenceLines.length > 0 ? 14 : 0;
  const boxTop = y + 36;
  const boxHeight =
    BOX_PADDING * 2 + (noticeLines.length + sentenceLines.length) * lineHeight + gap - 8;
  roundedRect(ctx, CARD_MARGIN, boxTop, CARD_INNER, boxHeight, 24);
  ctx.fillStyle = pill.fill;
  ctx.fill();
  ctx.strokeStyle = pill.border;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = pill.ink;
  ctx.font = bodyFont;
  let line = boxTop + BOX_PADDING + 24;
  for (const text of noticeLines) {
    ctx.fillText(text, CARD_MARGIN + BOX_PADDING, line);
    line += lineHeight;
  }
  line += gap;
  ctx.font = `700 27px ${fonts.body}`;
  for (const text of sentenceLines) {
    ctx.fillText(text, CARD_MARGIN + BOX_PADDING, line);
    line += lineHeight;
  }

  // Qualification and sources, dropped when a long title leaves them no room above the footer.
  const factsTop = boxTop + boxHeight + 46;
  if (factsTop + 44 < FOOTER_RULE - 16) {
    ctx.fillStyle = INK;
    ctx.font = `400 28px ${fonts.body}`;
    ctx.fillText(`Faits qualifiés : ${input.categoryLabel}`, CARD_MARGIN, factsTop);
    const sources =
      input.sourceCount > 1 ? `${input.sourceCount} sources, détaillées` : "1 source, détaillée";
    ctx.fillStyle = MUTED;
    ctx.fillText(`${sources} sur la fiche`, CARD_MARGIN, factsTop + 40);
  }

  drawCardFooter(ctx, fonts, {
    callToAction: "Sources et chronologie sur poligraph.fr",
    note: `Statut relevé le ${asOfLabel}, il peut avoir évolué depuis. Correction ou droit de réponse : poligraph.fr/signaler`,
  });
}
