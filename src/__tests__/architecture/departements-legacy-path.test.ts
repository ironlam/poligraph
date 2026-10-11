import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Department pages moved from /departements to /territoires/departements (#1052). next.config.ts
 * redirects the old addresses, but an internal link to them would cost every reader a 308 and
 * keep the old URL alive in the crawl. Paths are built with `territoireDepartementPath()`.
 *
 * Flags a string literal that starts with `/departements`, or `${SITE_URL}/departements`. The
 * municipales pages (`${BASE_PATH}/departements`) and API routes are other URLs and do not match.
 */

const SRC_DIR = join(process.cwd(), "src");
const LEGACY = /(?:["'`]|\$\{SITE_URL\})\/departements(?![\w-])/g;

function sourceFiles(dir = SRC_DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__" && entry.name !== "generated") out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Comments are not links, and the docstrings of the moved files name the old route. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function legacyDepartementPaths(src: string): string[] {
  return stripComments(src).match(LEGACY) ?? [];
}

describe("aucun lien interne vers /departements", () => {
  it("détecte les formes construites à la main", () => {
    expect(legacyDepartementPaths('href="/departements"')).toHaveLength(1);
    expect(legacyDepartementPaths("href={`/departements/${slug}`}")).toHaveLength(1);
    expect(legacyDepartementPaths("url: `${SITE_URL}/departements/${slug}`")).toHaveLength(1);
    expect(legacyDepartementPaths("`${BASE_PATH}/departements`")).toHaveLength(0);
    expect(legacyDepartementPaths('"/territoires/departements"')).toHaveLength(0);
    expect(legacyDepartementPaths("// `/departements/eure`")).toHaveLength(0);
  });

  it("src/ ne construit plus l'ancien chemin", () => {
    const offenders = sourceFiles().flatMap((file) =>
      legacyDepartementPaths(readFileSync(file, "utf8")).map(
        (hit) => `${relative(process.cwd(), file)}: ${hit}`
      )
    );
    expect(offenders).toEqual([]);
  });
});
