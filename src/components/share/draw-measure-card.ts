import { fitLines } from "@/lib/share-card";
import {
  CARD_INNER,
  CARD_MARGIN,
  INK,
  MUTED,
  RULE,
  TILE,
  drawCardFooter,
  drawFittedText,
  drawPresidentialBand,
  fillPage,
  roundedRect,
  type CardFonts,
} from "./card-canvas";

export interface MeasureCardInput {
  candidateName: string;
  partyLabel: string | null;
  themeLabel: string;
  /** The measure as published on its page. Not a quote: no quotation marks are added. */
  text: string;
  /** E.g. "Source primaire : Programme de candidature, 3 mars 2026". */
  sourceLine: string;
  sourceCount: number;
  /** Whether the person worded it or it comes from the party programme. */
  attributionLabel: string;
  asOfLabel: string;
}

export const MEASURE_CARD_STANCE =
  "Poligraph publie les mesures avec leurs sources, sans les commenter ni les noter.";

const BOX_PADDING = 36;
const TEXT_STEPS = [
  { size: 52, maxLines: 4 },
  { size: 44, maxLines: 6 },
  { size: 36, maxLines: 8 },
];

/**
 * Draws the card of one measure of a presidential programme.
 *
 * The text is the one the page publishes, with its primary source and the number of sources behind
 * it: a measure shared without where it comes from would be an unsourced claim about a person.
 */
export function drawMeasureCard(
  ctx: CanvasRenderingContext2D,
  input: MeasureCardInput,
  fonts: CardFonts
) {
  fillPage(ctx);
  const bodyTop = drawPresidentialBand(ctx, fonts, {
    context: `Programme · au ${input.asOfLabel}`,
    side: { label: "Thème", value: input.themeLabel },
  });

  ctx.fillStyle = MUTED;
  ctx.font = `400 32px ${fonts.body}`;
  ctx.fillText("Ce que propose", CARD_MARGIN, bodyTop + 70);
  ctx.fillStyle = INK;
  let headBottom = drawFittedText(ctx, input.candidateName, {
    x: CARD_MARGIN,
    top: bodyTop + 84,
    width: CARD_INNER,
    font: (size) => `800 ${size}px ${fonts.display}`,
    steps: [
      { size: 60, maxLines: 1 },
      { size: 48, maxLines: 1 },
      { size: 40, maxLines: 2 },
    ],
    lineHeight: 1.1,
  });
  if (input.partyLabel) {
    ctx.fillStyle = MUTED;
    headBottom = drawFittedText(ctx, input.partyLabel, {
      x: CARD_MARGIN,
      top: headBottom + 14,
      width: CARD_INNER,
      font: (size) => `400 ${size}px ${fonts.body}`,
      steps: [{ size: 30, maxLines: 1 }],
    });
  }

  // The box grows with the text, so its height is known before anything is painted.
  const textWidth = CARD_INNER - BOX_PADDING * 2;
  const textFont = (size: number) => `700 ${size}px ${fonts.display}`;
  const { size, lines } = fitLines(
    (s, t) => {
      ctx.font = textFont(s);
      return ctx.measureText(t).width;
    },
    input.text,
    textWidth,
    TEXT_STEPS
  );
  const lineHeight = size * 1.22;
  const sourceFont = (s: number) => `400 ${s}px ${fonts.body}`;
  const sourceLines = fitLines(
    (s, t) => {
      ctx.font = sourceFont(s);
      return ctx.measureText(t).width;
    },
    input.sourceLine,
    textWidth,
    [{ size: 28, maxLines: 2 }]
  ).lines;
  // The count gets its own line: a measure rarely rests on the one source the card can name.
  if (input.sourceCount > 1) sourceLines.push(`${input.sourceCount} sources au total`);
  const sourceLineHeight = 28 * 1.3;

  const boxTop = headBottom + 44;
  const textHeight = size + (lines.length - 1) * lineHeight;
  const sourceHeight = 28 + (sourceLines.length - 1) * sourceLineHeight;
  const boxHeight = BOX_PADDING * 2 + textHeight + 28 + sourceHeight;
  roundedRect(ctx, CARD_MARGIN, boxTop, CARD_INNER, boxHeight, 28);
  ctx.fillStyle = TILE;
  ctx.fill();
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 2;
  ctx.stroke();

  const textX = CARD_MARGIN + BOX_PADDING;
  ctx.fillStyle = INK;
  ctx.font = textFont(size);
  const firstLine = boxTop + BOX_PADDING + size * 0.86;
  lines.forEach((line, i) => ctx.fillText(line, textX, firstLine + i * lineHeight));
  ctx.fillStyle = MUTED;
  ctx.font = sourceFont(28);
  const firstSource = boxTop + BOX_PADDING + textHeight + 28 + 24;
  sourceLines.forEach((line, i) => ctx.fillText(line, textX, firstSource + i * sourceLineHeight));

  const stanceTop = boxTop + boxHeight + 28;
  // Dropped when the longest measures leave no room above the footer rule.
  if (stanceTop + 80 < 1350 - 190) {
    ctx.fillStyle = MUTED;
    drawFittedText(ctx, MEASURE_CARD_STANCE, {
      x: CARD_MARGIN,
      top: stanceTop,
      width: CARD_INNER,
      font: (s) => `400 ${s}px ${fonts.body}`,
      steps: [{ size: 27, maxLines: 2 }],
      lineHeight: 1.3,
    });
  }

  drawCardFooter(ctx, fonts, {
    callToAction: "Comparez les programmes sur poligraph.fr",
    note: `${input.attributionLabel}. Toutes les sources sur la page de la mesure.`,
  });
}
