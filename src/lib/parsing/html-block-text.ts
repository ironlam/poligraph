/**
 * HTML to plain text, preserving block boundaries.
 *
 * Separate from `html-utils.ts` because it parses with cheerio instead of
 * stripping tags by regex. A single regex pass over untrusted HTML is
 * incomplete sanitization: removing `<script>` from `<scr<script>ipt>` splices
 * the remainder back into a live tag, which is what CodeQL flags. A parser has
 * no such reassembly, and it keeps cheerio out of the bundle of every module
 * that only needs the cheap helpers in `html-utils`.
 */

import * as cheerio from "cheerio";

/** Elements whose end is a line break in the extracted text. */
const BLOCK_SELECTOR = [
  "p",
  "div",
  "li",
  "tr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "table",
  "blockquote",
  "section",
  "article",
].join(", ");

/** Elements carrying no readable content. */
const NON_TEXT_SELECTOR = "script, style, head, noscript, template";

/**
 * Extract text from HTML while keeping block boundaries as line breaks.
 *
 * `extractText` collapses a whole document onto a single line, which is fine for
 * a name or a title and destructive for a long document: the exposé des motifs
 * of a bill loses every paragraph break and becomes an unreadable wall of text.
 * This keeps one line per block element and collapses runs of blank lines, so
 * the result keeps its paragraphs without the source's indentation noise.
 *
 * @example
 * extractBlockText("<p>Mesdames,</p><p>Messieurs,</p>") // "Mesdames,\nMessieurs,"
 */
export function extractBlockText(html: string): string {
  if (!html) return "";

  const $ = cheerio.load(html);
  $(NON_TEXT_SELECTOR).remove();
  $("br").replaceWith("\n");
  $(BLOCK_SELECTOR).append("\n");

  return normalizeLines($("body").text());
}

function normalizeLines(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
