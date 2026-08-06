import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { resolve, relative } from "path";

const SRC = resolve(__dirname, "../..");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "generated") continue;
      out.push(...tsxFiles(full));
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * `sr-only` sets `position: absolute; width: 1px`, but a table laid out with
 * `table-layout: auto` sizes itself on its content and ignores that width. It
 * then sticks out of the body and widens the document, which reads on mobile as
 * a blank strip on the right of every page carrying such a table.
 *
 * The trap is invisible on review: nothing is visible on screen, and only
 * `documentElement.scrollWidth` shows it.
 */
describe("screen-reader-only tables", () => {
  it("all declare a fixed layout so they cannot widen the document", () => {
    const offenders: string[] = [];

    for (const file of tsxFiles(SRC)) {
      const content = readFileSync(file, "utf-8");
      for (const match of content.matchAll(/<table[^>]*className="([^"]*)"/g)) {
        const classes = match[1]!;
        if (!/\bsr-only\b/.test(classes)) continue;
        if (/\btable-fixed\b/.test(classes)) continue;
        offenders.push(`${relative(SRC, file)} -> className="${classes}"`);
      }
    }

    expect(
      offenders,
      `These sr-only tables can widen the document. Add "table-fixed":\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
