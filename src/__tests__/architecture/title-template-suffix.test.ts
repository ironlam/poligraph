import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * The root layout sets `title.template = "%s | Poligraph"`, so a page whose own
 * `title` already ends with the suffix ships it twice:
 * "Municipales 2026 | Poligraph | Poligraph". Google truncates the result and it
 * wastes about thirty characters of a title's useful budget.
 *
 * Two places legitimately carry the suffix and must keep it: `openGraph.title`
 * and `twitter.title`, which the template never touches, and `title.absolute`,
 * which bypasses it on purpose.
 */

const APP_DIR = join(process.cwd(), "src/app");
const SUFFIX = "| Poligraph";

function pageFiles(dir = APP_DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...pageFiles(full));
    else if (entry.name === "page.tsx") out.push(full);
  }
  return out;
}

/** Comments must not be scanned: this file's own docstring names the suffix. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * Walks back from a position to the key of the object literal containing it, so
 * a title nested under `openGraph:` can be told apart from a page-level one.
 */
function enclosingKey(src: string, pos: number): string {
  let depth = 0;
  for (let i = pos; i > 0; i--) {
    const ch = src[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      if (depth === 0) {
        const before = src.slice(Math.max(0, i - 60), i);
        return /(\w+)\s*:\s*\{?\s*$/.exec(before)?.[1] ?? "ROOT";
      }
      depth--;
    }
  }
  return "ROOT";
}

function offenders(): string[] {
  const found: string[] = [];
  for (const file of pageFiles()) {
    const src = stripComments(readFileSync(file, "utf8"));
    const re = /title:\s*([`"'])([^`"']*)\1/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      if (!m[2]!.includes(SUFFIX)) continue;
      if (["openGraph", "twitter"].includes(enclosingKey(src, m.index))) continue;
      found.push(`${relative(APP_DIR, file)}: ${m[2]!.slice(0, 50)}`);
    }
  }
  return found;
}

describe("suffixe de marque dans les titres de page", () => {
  it("inspecte bien un nombre plausible de pages", () => {
    // Without this, a broken walk would make the assertion below vacuous.
    expect(pageFiles().length).toBeGreaterThan(80);
  });

  it("distingue un titre de page d'un titre openGraph", () => {
    // Pins the discriminator itself: it is what makes the guard usable.
    const sample = `export const metadata = {
      title: "Page",
      openGraph: { title: "Page | Poligraph" },
    };`;
    const i = sample.indexOf('title: "Page | Poligraph"');
    expect(enclosingKey(sample, i)).toBe("openGraph");
    expect(enclosingKey(sample, sample.indexOf('title: "Page"'))).toBe("ROOT");
  });

  it("aucun titre de page ne code en dur le suffixe du template", () => {
    expect(offenders()).toEqual([]);
  });
});
