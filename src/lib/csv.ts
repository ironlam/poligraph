/**
 * CSV utility functions for data export
 */

/**
 * Escape a value for CSV format
 */
function escapeCSV(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  const str = String(value);

  // If the value contains quotes, commas, or newlines, wrap in quotes and escape quotes
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Convert an array of objects to CSV string
 */
export function toCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: { key: keyof T; header: string }[]
): string {
  if (data.length === 0) {
    return columns.map((c) => c.header).join(",");
  }

  // Header row
  const header = columns.map((c) => escapeCSV(c.header)).join(",");

  // Data rows
  const rows = data.map((item) =>
    columns
      .map((c) => escapeCSV(item[c.key] as string | number | boolean | null | undefined))
      .join(",")
  );

  return [header, ...rows].join("\n");
}

/**
 * Format a date for CSV export (ISO format)
 */
export function formatDateForCSV(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().split("T")[0]!;
}

/**
 * Format a datetime for CSV export
 */
export function formatDateTimeForCSV(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString();
}

/**
 * Strip Markdown syntax from a description so it can be exported as plain
 * text in a CSV cell. Preserves the human-readable content, drops every
 * syntactic marker, collapses runs of whitespace, and never truncates.
 *
 * Accepts null/undefined for convenience at call sites that read nullable
 * columns directly from Prisma.
 *
 * Handled syntax:
 *   - inline links:      [text](url)          -> text
 *   - bold:              **text** / __text__  -> text
 *   - italic:            *text* / _text_      -> text
 *   - inline code:       `text`               -> text
 *   - fenced code:       ```text```           -> text
 *   - ATX headers:       # Heading            -> Heading
 *   - blockquote prefix: > quote              -> quote
 *   - horizontal rule:   --- or ***           -> (removed)
 *
 * Runs of whitespace (including newlines and CRLF) collapse to single spaces.
 */
export function stripMarkdownForCSV(input: string | null | undefined): string {
  if (!input) return "";

  let text = input;

  // Fenced code blocks: ```lang\ncode``` -> code
  text = text.replace(/```[^\n]*\n?([\s\S]*?)```/g, "$1");

  // Inline code: `code` -> code
  text = text.replace(/`([^`]+)`/g, "$1");

  // Links: [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // Images: ![alt](url) -> alt (already handled above since [alt](url) matches)
  // Bare reference-style link definitions: [id]: url "title"
  text = text.replace(/^\s*\[[^\]]+\]:\s*\S+(?:\s+"[^"]*")?\s*$/gm, "");

  // Bold markers: **text** or __text__ -> text (do before italic to avoid
  // the italic regex chewing one asterisk and leaving the other behind)
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");

  // Italic markers: *text* or _text_ -> text
  text = text.replace(/(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, "$1");
  text = text.replace(/(?<!_)_(?!_)([^_\n]+?)(?<!_)_(?!_)/g, "$1");

  // ATX headers: # Heading, ## Heading, etc.
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, "");

  // Blockquote markers at the start of a line
  text = text.replace(/^\s{0,3}>\s?/gm, "");

  // Horizontal rules
  text = text.replace(/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "");

  // Collapse every run of whitespace (including \n, \r, \t) into a single space
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Create a CSV response with proper headers
 */
export function createCSVResponse(csv: string, filename: string): Response {
  // Add BOM for Excel compatibility with UTF-8
  const bom = "\ufeff";
  const csvWithBom = bom + csv;

  return new Response(csvWithBom, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-cache",
    },
  });
}
