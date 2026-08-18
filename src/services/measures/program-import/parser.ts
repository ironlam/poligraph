import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { load } from "cheerio";
import type {
  DocumentBlock,
  DocumentNumber,
  DocumentSegment,
  DocumentUnit,
  DocumentUnitKind,
  PdfPageDiagnostic,
  ParsedDocument,
  SegmentProvenance,
} from "./types";

const execFileAsync = promisify(execFile);

function compact(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Remove only C0/DEL characters that cannot carry editorial PDF content. The parser keeps
 * `rawText` beside this canonical form so an audit can still inspect the extracted bytes.
 */
export function canonicalizePdfTechnicalText(text: string): string {
  return compact(text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ""));
}

function normalizeNumber(value: string): string {
  return value.replace(/[ \u00a0\u202f]/g, "").replace(",", ".");
}

function extractDocumentNumbers(text: string): DocumentNumber[] {
  const numbers: DocumentNumber[] = [];
  for (const match of text.matchAll(/\d+(?:[ \u00a0\u202f]\d{3})*(?:[,.]\d+)?/g)) {
    const start = match.index ?? 0;
    const prefix = text.slice(Math.max(0, start - 32), start);
    const structuralLabel =
      /(?:proposition|chapitre|partie|section|mesure|axe|priorit[ée]|fiche)\s*$/iu.test(prefix);
    const structuralListIndex =
      /^\s*\d+\s*(?:[/.):]|-)\s+/u.test(text) && /^\s*$/.test(text.slice(0, start));
    const structuralLeadingHeading =
      /^\s*\d+\s+(?=(?:proposition|chapitre|partie|section|axe)\b|\p{Lu}{2})/iu.test(text) &&
      /^\s*$/.test(text.slice(0, start));
    const isolatedPageNumber = /^\s*\d+\s*$/u.test(text);
    numbers.push({
      raw: match[0],
      normalized: normalizeNumber(match[0]),
      role:
        structuralLabel || structuralListIndex || structuralLeadingHeading || isolatedPageNumber
          ? "STRUCTURAL"
          : "CONTENT",
    });
  }
  return numbers;
}

function looksLikeLabel(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 3 || text.length > 220) return false;
  const uppercase = letters.filter((letter) => letter === letter.toLocaleUpperCase("fr")).length;
  return uppercase / letters.length >= 0.82;
}

function inferUnitKind(text: string, block: DocumentBlock, quoted: boolean): DocumentUnitKind {
  if (quoted) return "QUOTATION";
  if (block.kind === "HEADING") return "HEADING";
  if (/^\s*(?:[●•▪◦]|\d+\s*[/.):])\s*/u.test(text)) return "LIST_ITEM";
  if (/^\s*(?:proposition|chapitre|partie|section|axe)\s+\d+/iu.test(text)) return "HEADING";
  if (looksLikeLabel(text))
    return /^\s*(?:proposition|chapitre|partie|section|axe)\b/iu.test(text) ? "HEADING" : "LABEL";
  return "SENTENCE";
}

type UnitSpan = { text: string; quoted: boolean };

function splitBlockIntoUnitSpans(
  text: string,
  initialQuoteStack: Array<"»" | "”">
): { spans: UnitSpan[]; quoteStack: Array<"»" | "”"> } {
  const spans: UnitSpan[] = [];
  let start = 0;
  const quoteStack = [...initialQuoteStack];

  const push = (end: number, quoted: boolean) => {
    const value = text.slice(start, end).trim();
    if (value) spans.push({ text: value, quoted });
    start = end;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === "«" || character === "“") {
      if (quoteStack.length === 0) {
        if (index > start) push(index, false);
        start = index;
      }
      quoteStack.push(character === "«" ? "»" : "”");
      continue;
    }
    if (quoteStack.length > 0 && character === quoteStack.at(-1)) {
      quoteStack.pop();
      if (quoteStack.length === 0) push(index + 1, true);
      continue;
    }

    const nextNonWhitespace = text.slice(index + 1).search(/\S/u);
    const nextIndex = nextNonWhitespace === -1 ? text.length : index + 1 + nextNonWhitespace;
    const nextCharacter = text[nextIndex];
    const sentenceBoundary =
      /[.!?]/u.test(character) &&
      !(
        character === "." &&
        /\d/u.test(text[index - 1] ?? "") &&
        /\d/u.test(nextCharacter ?? "")
      ) &&
      (nextIndex === text.length || /[\p{Lu}«“●•▪◦]/u.test(nextCharacter ?? ""));
    const structuralLineBoundary =
      character === "\n" &&
      /^(?:\s*[●•▪◦]|\s*\d+\s*[/.):]|\s*(?:PROPOSITION|CHAPITRE|PARTIE|SECTION|AXE)\b)/u.test(
        text.slice(index + 1)
      );
    if ((sentenceBoundary || structuralLineBoundary) && index + 1 - start >= 8) {
      push(index + 1, quoteStack.length > 0);
    }
  }
  if (start < text.length) push(text.length, quoteStack.length > 0);
  return { spans, quoteStack };
}

/** Deterministically segment parser blocks before any semantic model is called. */
export function createDocumentUnits(blocks: DocumentBlock[]): DocumentUnit[] {
  const units: DocumentUnit[] = [];
  let quoteStack: Array<"»" | "”"> = [];
  let previousPage: number | null | undefined;
  for (const block of blocks) {
    // A quote delimiter lost by a PDF text layer must not contaminate later pages. Cross-page
    // quotations remain classifiable from their text and context, but the parser never assumes
    // that an unmatched mark owns the following page.
    if (previousPage !== undefined && block.page !== previousPage) quoteStack = [];
    previousPage = block.page;
    const segmented = splitBlockIntoUnitSpans(block.text, quoteStack);
    quoteStack = segmented.quoteStack;
    for (const [unitIndex, span] of segmented.spans.entries()) {
      units.push({
        id: `${block.id}-u${String(unitIndex + 1).padStart(3, "0")}`,
        blockId: block.id,
        page: block.page,
        order: units.length,
        blockOrder: block.order,
        text: span.text,
        kind: inferUnitKind(span.text, block, span.quoted),
        numbers: extractDocumentNumbers(span.text),
        provenance: block.provenance,
      });
    }
  }
  return units;
}

function findRightColumnStart(lines: string[]): number | null {
  const candidates: number[] = [];
  for (const line of lines) {
    for (const match of line.matchAll(/ {8,}/g)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (line.slice(0, start).trim().length < 8 || line.slice(end).trim().length < 8) continue;
      candidates.push(end);
    }
  }
  if (candidates.length < 4) return null;

  const stable = candidates.filter(
    (candidate) => candidates.filter((other) => Math.abs(other - candidate) <= 4).length >= 4
  );
  if (stable.length < 4) return null;
  stable.sort((left, right) => left - right);
  const median = stable[Math.floor(stable.length / 2)]!;
  const pageWidth = Math.max(...lines.map((line) => line.length), 0);
  if (median < pageWidth * 0.35 || median > pageWidth * 0.78) return null;
  return median;
}

/**
 * Restore the demonstrable reading order of a two-column `pdftotext -layout` page.
 * The split is based only on a repeated horizontal gutter. It never joins fragments based on
 * their meaning and leaves pages without a stable gutter untouched.
 */
function restorePdfReadingOrderWithProvenance(pageText: string): {
  text: string;
  provenance: SegmentProvenance;
  ambiguousColumnLines: number;
} {
  const lines = pageText.split("\n");
  const rightColumnStart = findRightColumnStart(lines);
  if (rightColumnStart === null) {
    return {
      text: pageText,
      provenance: {
        status: "TEXT_LAYER_TRUSTED",
        reason: null,
        extractionAllowed: true,
      },
      ambiguousColumnLines: 0,
    };
  }

  const left: string[] = [];
  const right: string[] = [];
  let ambiguousColumnLines = 0;
  for (const line of lines) {
    const gutters = [...line.matchAll(/ {6,}/g)];
    const gutter = gutters.find((match) => {
      const end = (match.index ?? 0) + match[0].length;
      return Math.abs(end - rightColumnStart) <= 12;
    });
    if (gutter) {
      const start = gutter.index ?? 0;
      const end = start + gutter[0].length;
      left.push(line.slice(0, start).trimEnd());
      right.push(line.slice(end).trimEnd());
      continue;
    }

    const firstCharacter = line.search(/\S/);
    const crossesBoundaryWithoutGutter =
      firstCharacter >= 0 &&
      line.slice(0, Math.max(0, rightColumnStart - 6)).trim().length >= 8 &&
      line.slice(Math.max(0, rightColumnStart - 6), rightColumnStart + 6).trim().length > 0 &&
      line.slice(rightColumnStart + 6).trim().length >= 8;
    if (crossesBoundaryWithoutGutter) ambiguousColumnLines += 1;
    if (firstCharacter >= rightColumnStart - 5) {
      left.push("");
      right.push(line.slice(firstCharacter).trimEnd());
    } else {
      left.push(line.trimEnd());
      right.push("");
    }
  }
  // One boundary collision can be a long line in an otherwise demonstrable column. Repeated
  // collisions mean the fixed gutter no longer proves which flow owns the text.
  if (ambiguousColumnLines >= 2) {
    return {
      text: pageText,
      provenance: {
        status: "TEXT_LAYER_SUSPECT",
        reason: "AMBIGUOUS_COLUMN_BOUNDARY",
        extractionAllowed: false,
      },
      ambiguousColumnLines,
    };
  }
  return {
    text: `${left.join("\n").trim()}\n\n${right.join("\n").trim()}`,
    provenance: {
      status: "TEXT_LAYER_REORDERED",
      reason: "STABLE_TWO_COLUMN_GUTTER",
      extractionAllowed: true,
    },
    ambiguousColumnLines,
  };
}

export function restorePdfReadingOrder(pageText: string): string {
  return restorePdfReadingOrderWithProvenance(pageText).text;
}

type BoundingLine = { xMin: number; xMax: number; yMin: number; yMax: number };

function linesOverlap(left: BoundingLine, right: BoundingLine): boolean {
  const verticalIntersection = Math.max(
    0,
    Math.min(left.yMax, right.yMax) - Math.max(left.yMin, right.yMin)
  );
  const minimumHeight = Math.max(1, Math.min(left.yMax - left.yMin, right.yMax - right.yMin));
  const horizontalIntersection = Math.max(
    0,
    Math.min(left.xMax, right.xMax) - Math.max(left.xMin, right.xMin)
  );
  return verticalIntersection / minimumHeight >= 0.55 && horizontalIntersection >= 8;
}

/**
 * Detect mutually overlapping text lines from independent PDF flows. This is a geometric
 * provenance check: it does not inspect sentence meaning and cannot decide which layer is visible.
 * Strong overlap therefore fails closed instead of selecting one layer heuristically.
 */
export function analyzePdfTextLayerGeometry(bboxLayout: string): PdfPageDiagnostic[] {
  const $ = load(bboxLayout, { xmlMode: true });
  return $("page")
    .map((pageIndex, pageElement) => {
      const lines = $(pageElement)
        .find("line")
        .map((_, lineElement) => ({
          xMin: Number($(lineElement).attr("xMin")),
          xMax: Number($(lineElement).attr("xMax")),
          yMin: Number($(lineElement).attr("yMin")),
          yMax: Number($(lineElement).attr("yMax")),
        }))
        .get()
        .filter((line) => Object.values(line).every(Number.isFinite));
      let overlappingLinePairs = 0;
      for (let leftIndex = 0; leftIndex < lines.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < lines.length; rightIndex += 1) {
          if (linesOverlap(lines[leftIndex]!, lines[rightIndex]!)) overlappingLinePairs += 1;
        }
      }
      const overlapDensity = overlappingLinePairs / Math.max(lines.length, 1);
      const corrupted = overlappingLinePairs >= 8 && overlapDensity >= 0.15;
      const suspect = !corrupted && overlappingLinePairs >= 3 && overlapDensity >= 0.05;
      return {
        page: pageIndex + 1,
        lineCount: lines.length,
        overlappingLinePairs,
        status: corrupted
          ? ("TEXT_LAYER_CORRUPTED" as const)
          : suspect
            ? ("TEXT_LAYER_SUSPECT" as const)
            : ("TEXT_LAYER_TRUSTED" as const),
        reason: corrupted
          ? ("OVERLAPPING_TEXT_LAYERS" as const)
          : suspect
            ? ("UNSTABLE_TEXT_GEOMETRY" as const)
            : null,
        extractionAllowed: !corrupted && !suspect,
      };
    })
    .get();
}

export function parseHtml(html: string): ParsedDocument {
  const $ = load(html);
  $("script,style,noscript,nav,footer,form").remove();
  const blocks: DocumentBlock[] = [];
  const segments: DocumentSegment[] = [];
  let heading: string | null = null;
  $(
    "main h1,main h2,main h3,main p,main li,article h1,article h2,article h3,article p,article li,body h1,body h2,body h3,body p,body li"
  ).each((_, element) => {
    const text = compact($(element).text());
    if (!text) return;
    if (/^h[1-3]$/.test(element.tagName)) {
      heading = text;
      blocks.push({
        id: `html-b${String(blocks.length + 1).padStart(3, "0")}`,
        order: blocks.length,
        heading,
        page: null,
        kind: "HEADING",
        text,
        provenance: { status: "HTML_TRUSTED", reason: null, extractionAllowed: true },
      });
      return;
    }
    if (text.length < 20) return;
    blocks.push({
      id: `html-b${String(blocks.length + 1).padStart(3, "0")}`,
      order: blocks.length,
      heading,
      page: null,
      kind: "CONTENT",
      text,
      provenance: { status: "HTML_TRUSTED", reason: null, extractionAllowed: true },
    });
    segments.push({
      id: `html-${segments.length + 1}`,
      heading,
      page: null,
      text,
      provenance: { status: "HTML_TRUSTED", reason: null, extractionAllowed: true },
    });
  });
  if (segments.length === 0) throw new Error("Contenu HTML vide");
  return {
    mediaType: "html",
    blocks,
    units: createDocumentUnits(blocks),
    segments,
    scannedPdf: false,
    pageDiagnostics: [],
  };
}

export function parsePdfText(
  text: string,
  geometryDiagnostics: PdfPageDiagnostic[] = []
): ParsedDocument {
  const pages = text.split("\f");
  const segments = pages.flatMap((pageText, pageIndex) => {
    const reordered = restorePdfReadingOrderWithProvenance(pageText);
    const geometry = geometryDiagnostics.find((diagnostic) => diagnostic.page === pageIndex + 1);
    const provenance =
      geometry && !geometry.extractionAllowed
        ? {
            status: geometry.status,
            reason: geometry.reason,
            extractionAllowed: false,
          }
        : reordered.provenance;
    const blocks = compact(reordered.text)
      .split(/\n\s*\n/)
      .filter((block) => block.length >= 20);
    return blocks
      .map((rawText) => ({ rawText, text: canonicalizePdfTechnicalText(rawText) }))
      .filter((block) => block.text.length >= 20)
      .map((block, blockIndex) => ({
        id: `pdf-${pageIndex + 1}-${blockIndex + 1}`,
        heading: null,
        page: pageIndex + 1,
        rawText: block.rawText === block.text ? undefined : block.rawText,
        text: block.text,
        provenance,
      }));
  });
  // A short, text-native leaflet can legitimately contain fewer than 200 characters.
  // Flag only PDFs from which pdftotext recovered no meaningful sentence.
  const scannedPdf = segments.reduce((sum, segment) => sum + segment.text.length, 0) < 20;
  const blocks: DocumentBlock[] = segments.map((segment, order) => ({
    id: segment.id,
    order,
    heading: segment.heading,
    page: segment.page,
    kind: "CONTENT",
    rawText: segment.rawText,
    text: segment.text,
    provenance: segment.provenance!,
  }));
  const pageDiagnostics = pages.map((pageText, pageIndex) => {
    const geometry = geometryDiagnostics.find((diagnostic) => diagnostic.page === pageIndex + 1);
    if (geometry && !geometry.extractionAllowed) return geometry;
    const reordered = restorePdfReadingOrderWithProvenance(pageText);
    return {
      page: pageIndex + 1,
      lineCount: geometry?.lineCount ?? 0,
      overlappingLinePairs: geometry?.overlappingLinePairs ?? 0,
      ambiguousColumnLines: reordered.ambiguousColumnLines,
      ...reordered.provenance,
    };
  });
  return {
    mediaType: "pdf",
    blocks,
    units: createDocumentUnits(blocks),
    segments,
    scannedPdf,
    pageDiagnostics,
  };
}

export async function parsePdf(bytes: Buffer): Promise<ParsedDocument> {
  const directory = await mkdtemp(path.join(tmpdir(), "poligraph-program-"));
  const pdfPath = path.join(directory, "document.pdf");
  const textPath = path.join(directory, "document.txt");
  const bboxPath = path.join(directory, "document-bbox.html");
  await writeFile(pdfPath, bytes);
  try {
    await execFileAsync("pdftotext", ["-layout", pdfPath, textPath], { timeout: 30_000 });
    await execFileAsync("pdftotext", ["-bbox-layout", pdfPath, bboxPath], { timeout: 30_000 });
  } catch (error) {
    throw new Error(`PDF invalide ou illisible: ${error instanceof Error ? error.message : error}`);
  }
  const text = await readFile(textPath, "utf8");
  const bboxLayout = await readFile(bboxPath, "utf8");
  return parsePdfText(text, analyzePdfTextLayerGeometry(bboxLayout));
}

export async function parseDocument(bytes: Buffer, contentType: string): Promise<ParsedDocument> {
  if (contentType.includes("pdf") || bytes.subarray(0, 4).toString() === "%PDF") {
    return parsePdf(bytes);
  }
  return parseHtml(bytes.toString("utf8"));
}
