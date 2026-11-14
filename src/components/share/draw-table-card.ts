import { tableRowHeight, type TableCardInput } from "@/lib/share-card";
import {
  CARD_HEIGHT,
  CARD_INNER,
  CARD_MARGIN,
  CARD_WIDTH,
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

const TABLE_BOTTOM = CARD_HEIGHT - 214;
const LABEL_WIDTH = 230;
const VALUE_WIDTH = 150;

/** Where the table starts for this input: the title and subtitle wrap, so it is measured. */
function drawHeading(ctx: CanvasRenderingContext2D, input: TableCardInput, fonts: CardFonts) {
  ctx.fillStyle = INK;
  let y = drawFittedText(ctx, input.title, {
    x: CARD_MARGIN,
    top: 186,
    width: CARD_INNER,
    font: (size) => `800 ${size}px ${fonts.display}`,
    steps: [
      { size: 58, maxLines: 1 },
      { size: 48, maxLines: 2 },
    ],
    lineHeight: 1.1,
  });
  ctx.fillStyle = MUTED;
  y = drawFittedText(ctx, input.subtitle, {
    x: CARD_MARGIN,
    top: y + 18,
    width: CARD_INNER,
    font: (size) => `400 ${size}px ${fonts.body}`,
    steps: [{ size: 27, maxLines: 3 }],
    lineHeight: 1.3,
  });
  if (input.legend) {
    let x = CARD_MARGIN;
    const baseline = y + 52;
    ctx.font = `400 25px ${fonts.body}`;
    for (const entry of input.legend) {
      ctx.fillStyle = entry.color;
      ctx.beginPath();
      ctx.arc(x + 10, baseline - 9, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.fillText(entry.label, x + 30, baseline);
      x += 30 + ctx.measureText(entry.label).width + 36;
    }
    y = baseline;
  }
  return y + 30;
}

/**
 * Whether the table of this input can be drawn whole. The sheet asks before offering an image:
 * when it cannot, the page is shared by its link and no truncated card is made.
 */
export function tableCardFits(rowCount: number): boolean {
  // The heading is at its tallest with a two-line title, a three-line subtitle and a legend.
  return tableRowHeight(rowCount, TABLE_BOTTOM - 470) !== null;
}

/**
 * Draws a card whose body is a table comparing parties.
 *
 * Three rules make a comparison shareable: the whole table above the threshold and never a
 * podium, the order of the page and not a ranking by score, and on the image itself the
 * denominator of every figure and the limit of the method. The caller brings the rows already in
 * that order; this drawing never sorts, cuts or highlights one.
 */
export function drawTableCard(
  ctx: CanvasRenderingContext2D,
  input: TableCardInput,
  fonts: CardFonts
) {
  fillPage(ctx);
  drawBrandHeader(ctx, fonts, input.context);
  const top = drawHeading(ctx, input, fonts);

  const rowHeight = tableRowHeight(input.rows.length, TABLE_BOTTOM - top);
  if (rowHeight !== null) {
    const size = Math.min(27, Math.round(rowHeight * 0.52));
    const hasBars = input.rows.some((row) => row.segments);
    const hasValues = input.rows.some((row) => row.value);
    const right = CARD_WIDTH - CARD_MARGIN;
    const detailRight = hasValues ? right - VALUE_WIDTH : right;
    const barX = CARD_MARGIN + LABEL_WIDTH;
    const barWidth = 300;
    const barHeight = Math.min(22, Math.round(rowHeight * 0.4));

    input.rows.forEach((row, i) => {
      const rowTop = top + i * rowHeight;
      const baseline = rowTop + rowHeight / 2 + size * 0.36;
      ctx.strokeStyle = RULE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(CARD_MARGIN, rowTop);
      ctx.lineTo(right, rowTop);
      ctx.stroke();

      ctx.fillStyle = INK;
      ctx.textAlign = "left";
      drawFittedText(ctx, row.label, {
        x: CARD_MARGIN,
        top: baseline - size,
        width: (hasBars ? LABEL_WIDTH : LABEL_WIDTH + 120) - 16,
        font: (s) => `700 ${s}px ${fonts.body}`,
        steps: [{ size, maxLines: 1 }],
      });

      if (row.segments) {
        const total = row.segments.reduce((sum, segment) => sum + segment.value, 0);
        const barTop = rowTop + (rowHeight - barHeight) / 2;
        ctx.save();
        roundedRect(ctx, barX, barTop, barWidth, barHeight, barHeight / 2);
        ctx.clip();
        ctx.fillStyle = "#ececec";
        ctx.fillRect(barX, barTop, barWidth, barHeight);
        let x = barX;
        for (const segment of row.segments) {
          const width = total > 0 ? (barWidth * segment.value) / total : 0;
          ctx.fillStyle = segment.color;
          ctx.fillRect(x, barTop, width, barHeight);
          x += width;
        }
        ctx.restore();
      }

      ctx.textAlign = "right";
      ctx.fillStyle = INK;
      ctx.font = `400 ${size}px ${fonts.body}`;
      ctx.fillText(row.detail, detailRight, baseline);
      if (row.value) {
        ctx.font = `700 ${size}px ${fonts.body}`;
        ctx.fillText(row.value, right, baseline);
      }
      ctx.textAlign = "left";
    });
  }

  drawCardFooter(ctx, fonts, { callToAction: input.callToAction, note: input.note });
}
