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

/**
 * One alternative per quote style, so an apostrophe inside a double-quoted title ("l'accent")
 * does not end the match early: the first version of this guard missed exactly that case.
 */
const LITERAL = [String.raw`"(?:[^"\\\n]|\\.)*"`, String.raw`'(?:[^'\\\n]|\\.)*'`, "`[^`]*`"].join(
  "|"
);

function offendersIn(src: string): string[] {
  const found: string[] = [];
  const IGNORED_KEYS = ["openGraph", "twitter"];

  const direct = new RegExp(String.raw`\btitle:\s*(${LITERAL})`, "g");
  let m: RegExpExecArray | null;
  while ((m = direct.exec(src)) !== null) {
    if (!m[1]!.includes(SUFFIX)) continue;
    if (IGNORED_KEYS.includes(enclosingKey(src, m.index))) continue;
    found.push(m[1]!.slice(0, 60));
  }

  // `const title = "... | Poligraph"` returned as `{ title, ... }`: the shorthand hides the
  // literal from the pattern above, which is how the condamnations and municipales pages
  // shipped "| Poligraph | Poligraph".
  const declared = new RegExp(String.raw`\b(?:const|let)\s+title\s*=\s*(${LITERAL})`).exec(src);
  if (declared?.[1]?.includes(SUFFIX)) {
    const shorthand = /[{,]\s*title\s*(?=[,}])/g;
    while ((m = shorthand.exec(src)) !== null) {
      if (IGNORED_KEYS.includes(enclosingKey(src, m.index))) continue;
      found.push(`title (shorthand) = ${declared[1].slice(0, 50)}`);
    }
  }
  return found;
}

function offenders(): string[] {
  return pageFiles().flatMap((file) =>
    offendersIn(stripComments(readFileSync(file, "utf8"))).map(
      (o) => `${relative(APP_DIR, file)}: ${o}`
    )
  );
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

  it("détecte un titre contenant une apostrophe", () => {
    expect(
      offendersIn(`export const metadata = { title: "Où chacun met l'accent | Poligraph" };`)
    ).toHaveLength(1);
  });

  it("détecte un titre passé en raccourci depuis une variable suffixée", () => {
    const sample = `const title = \`Municipales à \${name} | Poligraph\`;
    return { title, openGraph: { title } };`;
    // Only the page-level shorthand counts: the openGraph one legitimately carries the brand.
    expect(offendersIn(sample)).toHaveLength(1);
  });

  it("laisse passer une variable suffixée réservée à openGraph et twitter", () => {
    const sample = `const title = \`\${base} | Poligraph\`;
    return { title: base, openGraph: { title }, twitter: { title } };`;
    expect(offendersIn(sample)).toEqual([]);
  });

  it("aucun titre de page ne code en dur le suffixe du template", () => {
    expect(offenders()).toEqual([]);
  });
});
