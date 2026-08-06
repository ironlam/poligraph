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
 * `sr-only` is meant for a container, never for a table.
 *
 * It sets `position: absolute; width: 1px; overflow: hidden; white-space: nowrap`,
 * but a table cannot shrink below the intrinsic width its `<caption>` and its
 * nowrap cells demand. `table-layout: fixed` does not help: the caption box sets
 * a floor. The table then sticks out of the body and widens the document, which
 * reads on mobile as a blank strip on the right.
 *
 * Wrapping the table in `<div className="sr-only">` settles it: the div is the
 * 1px clipping box, and the table inside can be as wide as it likes without
 * contributing to layout.
 *
 * Measured on /statistiques?tab=legislatif at 412px: 503px of document width
 * with `sr-only table-fixed` on the table, 412px once wrapped.
 *
 * This guard replaced a weaker one that only demanded `table-fixed`. That
 * version passed while the bug was live, because a table whose caption happens
 * to be shorter than the viewport fits by luck.
 */
describe("screen-reader-only tables", () => {
  it("are wrapped in an sr-only container rather than carrying the class themselves", () => {
    const offenders: string[] = [];

    for (const file of tsxFiles(SRC)) {
      const content = readFileSync(file, "utf-8");
      for (const match of content.matchAll(/<table[^>]*className="([^"]*)"/g)) {
        const classes = match[1]!;
        if (!/\bsr-only\b/.test(classes)) continue;
        offenders.push(`${relative(SRC, file)} -> <table className="${classes}">`);
      }
    }

    expect(
      offenders,
      `A table must not carry "sr-only" itself. Wrap it in <div className="sr-only">:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
