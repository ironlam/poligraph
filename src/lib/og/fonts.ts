/**
 * Brand fonts for Open Graph cards, read from disk once per server instance.
 *
 * Satori parses TTF, OTF and WOFF only: the WOFF2 files the site serves (src/fonts) cannot be
 * handed to it, and it does not read a variable font either. src/fonts/og therefore holds static
 * TTF instances derived from those same files (see src/fonts/README.md). Each route that reads
 * them must list `./src/fonts/og/*` under `outputFileTracingIncludes` in next.config.ts, or the
 * files are missing from the deployed function.
 *
 * A read failure resolves to an empty list rather than throwing: next/og then falls back to its
 * bundled font, and a social crawler gets a slightly plainer card instead of a cached 500.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

type OgFontWeight = 400 | 700 | 800;

export interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: OgFontWeight;
  style: "normal";
}

export const OG_FONT_DISPLAY = "Outfit";
export const OG_FONT_TEXT = "Atkinson Hyperlegible";

const OG_FONT_FILES: ReadonlyArray<{ name: string; file: string; weight: OgFontWeight }> = [
  { name: OG_FONT_DISPLAY, file: "Outfit-latin-700.ttf", weight: 700 },
  { name: OG_FONT_DISPLAY, file: "Outfit-latin-800.ttf", weight: 800 },
  { name: OG_FONT_TEXT, file: "AtkinsonHyperlegible-latin-400.ttf", weight: 400 },
  { name: OG_FONT_TEXT, file: "AtkinsonHyperlegible-latin-700.ttf", weight: 700 },
];

let cached: Promise<OgFont[]> | null = null;

async function readOgFonts(): Promise<OgFont[]> {
  try {
    return await Promise.all(
      OG_FONT_FILES.map(async ({ name, file, weight }) => {
        const buffer = await readFile(join(process.cwd(), "src/fonts/og", file));
        const data = buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength
        ) as ArrayBuffer;
        return { name, data, weight, style: "normal" as const };
      })
    );
  } catch (error) {
    // eslint-disable-next-line no-console -- deliberate ops signal: cards silently lose the brand
    console.error("[og] brand fonts unavailable, falling back to the default font", error);
    cached = null;
    return [];
  }
}

export function loadOgFonts(): Promise<OgFont[]> {
  cached ??= readOgFonts();
  return cached;
}
