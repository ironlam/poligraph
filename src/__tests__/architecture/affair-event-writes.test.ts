import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Les étapes d'une affaire ne s'écrivent que par le service de chronologie (garde de publication,
 * audit) ou par la fusion d'affaires. Les lectures publiques ne voient que les étapes publiées.
 */

const WRITE_PATTERN =
  /\baffairEvent\s*\.\s*(create|update|upsert|delete|createMany|updateMany|deleteMany)\b/;

const ALLOWED_PREFIXES = [
  "src/lib/affairs/events/",
  "src/services/affairs/reconciliation.ts",
  "src/generated/",
];

const PUBLIC_LOADERS = [
  "src/app/affaires/[slug]/page.tsx",
  "src/lib/data/politician-profile-reads.ts",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      walk(path, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

const files = walk("src");

/** Lignes `events: {` dont les 3 lignes suivantes (ou la ligne elle-même) n'ont pas le filtre. */
function unfilteredEventBlocks(file: string): string[] {
  const lines = readFileSync(file, "utf8").split("\n");
  return lines.flatMap((line, index) => {
    if (!/\bevents\s*:\s*\{/.test(line)) return [];
    const window = lines.slice(index, index + 4).join("\n");
    return window.includes("PUBLIC_EVENT_WHERE") ? [] : [`${file}:${index + 1}`];
  });
}

describe("étapes d'affaire : écritures et lectures publiques", () => {
  it("ne sont écrites que par le service de chronologie et la fusion", () => {
    const offenders = files
      .filter((file) => !ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix)))
      .flatMap((file) =>
        readFileSync(file, "utf8")
          .split("\n")
          .flatMap((line, index) => (WRITE_PATTERN.test(line) ? [`${file}:${index + 1}`] : []))
      );
    expect(offenders).toEqual([]);
  });

  it("contrôle positif : le scanner lit bien le service d'écriture", () => {
    const file = "src/lib/affairs/events/service.ts";
    expect(files).toContain(file);
    expect(WRITE_PATTERN.test(readFileSync(file, "utf8"))).toBe(true);
  });

  it.each(PUBLIC_LOADERS)("%s filtre chaque inclusion des étapes", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).toMatch(/\bevents\s*:\s*\{/);
    expect(unfilteredEventBlocks(file)).toEqual([]);
  });
});
