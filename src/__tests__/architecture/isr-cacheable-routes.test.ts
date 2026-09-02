import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * A dynamic segment that declares `revalidate` but no `generateStaticParams` is
 * classified by Next as fully dynamic (`f` in the build route table), and the
 * `revalidate` value then applies to nothing: the page is server-rendered on
 * every request and never enters the ISR cache.
 *
 * Measured in production before this guard existed: /parlement/groupes/[slug],
 * /recap/[week], /elections/presidentielle-2027/reperes/[slug] and
 * /elections/presidentielle-2027/themes/[theme] answered x-vercel-cache: MISS on
 * every consecutive request, while every comparable route that does declare
 * generateStaticParams answered HIT or STALE.
 *
 * The remedy is `generateStaticParams` returning an empty array: its mere
 * presence makes the route ISR-cacheable without prerendering anything at build
 * time. See the comment on /parlement/votes/[slug], which documents both that
 * and the constraint below.
 *
 * The exemption is `searchParams`: a page that reads it varies per query string
 * and cannot be a single cache entry, so Next keeps it dynamic whatever else it
 * declares. Combining the two also triggers DYNAMIC_SERVER_USAGE alongside the
 * "use cache" data functions.
 */

const APP_DIR = join(process.cwd(), "src/app");

/** Every page.tsx that sits under at least one [param] segment, admin aside. */
function dynamicPageFiles(dir = APP_DIR, underParam = false): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (dir === APP_DIR && entry.name === "admin") continue;
      out.push(...dynamicPageFiles(full, underParam || /^\[.+\]$/.test(entry.name)));
    } else if (underParam && entry.name === "page.tsx") {
      out.push(full);
    }
  }
  return out;
}

/** Drop block and line comments so the predicates below read code, not prose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("routes dynamiques et cache ISR", () => {
  it("trouve bien des pages dynamiques à inspecter", () => {
    // Guards the walk itself: finding nothing would make every assertion below
    // vacuously true.
    expect(dynamicPageFiles().length).toBeGreaterThan(10);
  });

  it("toute page dynamique avec revalidate et sans searchParams déclare generateStaticParams", () => {
    const offenders: string[] = [];

    for (const file of dynamicPageFiles()) {
      const src = stripComments(readFileSync(file, "utf8"));
      if (!/export const revalidate\s*=/.test(src)) continue;
      if (/\bsearchParams\b/.test(src)) continue;
      if (/export\s+(async\s+)?(function|const)\s+generateStaticParams\b/.test(src)) continue;
      offenders.push(relative(APP_DIR, file));
    }

    expect(offenders).toEqual([]);
  });

  it("ne se laisse pas berner par une mention en commentaire", () => {
    // The predicates above read code, not prose. Without stripComments, the very
    // comment that documents `generateStaticParams` and `searchParams` on the
    // fixed routes would exempt them, and this guard would pass on a route that
    // declares neither. That happened while writing this file.
    const commentOnly = `
      // generateStaticParams and searchParams are only named here.
      /* searchParams */
      export const revalidate = 86400;
    `;
    const src = stripComments(commentOnly);
    expect(/\bsearchParams\b/.test(src)).toBe(false);
    expect(/export\s+(async\s+)?(function|const)\s+generateStaticParams\b/.test(src)).toBe(false);
    expect(/export const revalidate\s*=/.test(src)).toBe(true);
  });
});
