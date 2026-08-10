import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { load } from "cheerio";
import type { DocumentSegment, ParsedDocument } from "./types";

const execFileAsync = promisify(execFile);

function compact(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseHtml(html: string): ParsedDocument {
  const $ = load(html);
  $("script,style,noscript,nav,footer,form").remove();
  const segments: DocumentSegment[] = [];
  let heading: string | null = null;
  $(
    "main h1,main h2,main h3,main p,main li,article h1,article h2,article h3,article p,article li,body h1,body h2,body h3,body p,body li"
  ).each((_, element) => {
    const text = compact($(element).text());
    if (!text) return;
    if (/^h[1-3]$/.test(element.tagName)) {
      heading = text;
      return;
    }
    if (text.length < 20) return;
    segments.push({ id: `html-${segments.length + 1}`, heading, page: null, text });
  });
  if (segments.length === 0) throw new Error("Contenu HTML vide");
  return { mediaType: "html", segments, scannedPdf: false };
}

export function parsePdfText(text: string): ParsedDocument {
  const pages = text.split("\f");
  const segments = pages.flatMap((pageText, pageIndex) => {
    const blocks = compact(pageText)
      .split(/\n\s*\n/)
      .filter((block) => block.length >= 20);
    return blocks.map((block, blockIndex) => ({
      id: `pdf-${pageIndex + 1}-${blockIndex + 1}`,
      heading: null,
      page: pageIndex + 1,
      text: block,
    }));
  });
  // A short, text-native leaflet can legitimately contain fewer than 200 characters.
  // Flag only PDFs from which pdftotext recovered no meaningful sentence.
  const scannedPdf = segments.reduce((sum, segment) => sum + segment.text.length, 0) < 20;
  return { mediaType: "pdf", segments, scannedPdf };
}

export async function parsePdf(bytes: Buffer): Promise<ParsedDocument> {
  const directory = await mkdtemp(path.join(tmpdir(), "poligraph-program-"));
  const pdfPath = path.join(directory, "document.pdf");
  const textPath = path.join(directory, "document.txt");
  await writeFile(pdfPath, bytes);
  try {
    await execFileAsync("pdftotext", ["-layout", pdfPath, textPath], { timeout: 30_000 });
  } catch (error) {
    throw new Error(`PDF invalide ou illisible: ${error instanceof Error ? error.message : error}`);
  }
  const text = await readFile(textPath, "utf8");
  return parsePdfText(text);
}

export async function parseDocument(bytes: Buffer, contentType: string): Promise<ParsedDocument> {
  if (contentType.includes("pdf") || bytes.subarray(0, 4).toString() === "%PDF") {
    return parsePdf(bytes);
  }
  return parseHtml(bytes.toString("utf8"));
}
