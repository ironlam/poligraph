import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { resolveOpenGraph } from "next/dist/lib/metadata/resolvers/resolve-opengraph";
import {
  OPEN_GRAPH_BASE,
  SEGMENT_IMAGE_FILE,
  SITE_OG_IMAGE,
  openGraph,
} from "@/lib/seo/open-graph";

const APP_DIR = join(process.cwd(), "src/app");
const BASE_URL = new URL("https://poligraph.fr");

/** What Next emits for a block, resolved the way it resolves it for a page at `pathname`. */
async function resolve(block: Parameters<typeof resolveOpenGraph>[0], pathname: string) {
  const resolved = await resolveOpenGraph(
    block,
    BASE_URL,
    Promise.resolve(pathname),
    { trailingSlash: false, isStaticMetadataRouteFile: false },
    null
  );
  return resolved as unknown as {
    type?: string;
    siteName?: string;
    locale?: string;
    url?: URL | string | null;
    images?: Array<{ url: URL | string }>;
  };
}

function metadataFiles(dir = APP_DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") out.push(...metadataFiles(full));
    } else if (/^(page|layout|page-data)\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Comments must not be scanned: several of them name `openGraph` in prose. */
function code(file: string): string {
  return readFileSync(file, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

describe("openGraph()", () => {
  it("keeps the shared fields when a page only sets a title", () => {
    expect(openGraph({ title: "Affaires" })).toMatchObject({
      type: "website",
      siteName: "Poligraph",
      locale: "fr_FR",
      title: "Affaires",
    });
  });

  it("lets the page override a shared field", () => {
    expect(openGraph({ type: "article", url: "/affaires/x" })).toMatchObject({
      type: "article",
      url: "/affaires/x",
      siteName: "Poligraph",
    });
  });

  it("falls back on the site image, since a page block drops the parent segment's file", () => {
    expect(openGraph({ title: "Carte" }).images).toEqual([SITE_OG_IMAGE]);
  });

  it("keeps the images a page passes", () => {
    const images = [{ url: "/territoires/opengraph-image" }];
    expect(openGraph({ images }).images).toBe(images);
  });

  it("leaves the images key out for a page with its own image file", () => {
    // Next attaches the file only when the key is absent: `images: undefined` would suppress it.
    expect(Object.hasOwn(openGraph({ images: SEGMENT_IMAGE_FILE }), "images")).toBe(false);
  });
});

describe("resolution by Next", () => {
  it("gives a page that inherits the layout block its own absolute og:url", async () => {
    const og = await resolve(OPEN_GRAPH_BASE, "/parlement/dossiers/fin-de-vie");
    expect(String(og.url)).toBe("https://poligraph.fr/parlement/dossiers/fin-de-vie");
    expect(og).toMatchObject({ type: "website", siteName: "Poligraph", locale: "fr_FR" });
  });

  it("resolves the home page to the bare origin", async () => {
    expect(String((await resolve(OPEN_GRAPH_BASE, "/")).url)).toBe("https://poligraph.fr");
  });

  it("gives a page block an absolute og:url and og:image", async () => {
    const og = await resolve(openGraph({ title: "Données" }), "/territoires/donnees");
    expect(String(og.url)).toBe("https://poligraph.fr/territoires/donnees");
    expect(String(og.images?.[0]?.url)).toBe("https://poligraph.fr/opengraph-image");
  });
});

describe("the site image", () => {
  it("mirrors src/app/opengraph-image.tsx", () => {
    const source = readFileSync(join(APP_DIR, "opengraph-image.tsx"), "utf-8");
    expect(source).toContain(`export const alt = "${SITE_OG_IMAGE.alt}";`);
    expect(source).toContain("export const size = OG_SIZE;");
    const ogSize = readFileSync(join(process.cwd(), "src/lib/og-utils.tsx"), "utf-8");
    expect(ogSize).toMatch(
      new RegExp(`OG_SIZE = \\{ width: ${SITE_OG_IMAGE.width}, height: ${SITE_OG_IMAGE.height} \\}`)
    );
  });
});

describe("every page goes through the shared base", () => {
  const files = metadataFiles();

  it("scans the app", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("has no hand-written openGraph block", () => {
    // A literal block is how og:type, og:site_name, og:locale and og:image went missing.
    const offenders = files
      .filter((file) => /openGraph\s*:\s*\{/.test(code(file)))
      .map((file) => relative(APP_DIR, file));
    expect(offenders).toEqual([]);
  });

  it("uses the base as it is in the root layout", () => {
    expect(code(join(APP_DIR, "layout.tsx"))).toMatch(/openGraph:\s*OPEN_GRAPH_BASE\b/);
    expect(code(join(APP_DIR, "layout.tsx"))).toMatch(/metadataBase:\s*new URL\(SITE_URL\)/);
  });

  it("claims a segment image file only where one exists", () => {
    const offenders = files
      .filter((file) => code(file).includes("SEGMENT_IMAGE_FILE"))
      .filter((file) => !existsSync(join(dirname(file), "opengraph-image.tsx")))
      .map((file) => relative(APP_DIR, file));
    expect(offenders).toEqual([]);
  });

  it("does not replace a segment image file with the site image by omission", () => {
    const offenders = files
      .filter((file) => existsSync(join(dirname(file), "opengraph-image.tsx")))
      .filter((file) => /openGraph\(/.test(code(file)))
      .filter((file) => !/SEGMENT_IMAGE_FILE|images\s*:/.test(code(file)))
      .map((file) => relative(APP_DIR, file));
    expect(offenders).toEqual([]);
  });
});
