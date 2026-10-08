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

/** Lecteurs publics : tout `src/app` hors admin, et les chargeurs de `src/lib/data`. */
const PUBLIC_READ_ROOTS = ["src/app", "src/lib/data"];
const PRIVATE_PREFIXES = ["src/app/admin/", "src/app/api/admin/"];

/** Inclusions d'étapes volontairement non filtrées, avec leur raison. Vide à ce jour. */
const UNFILTERED_EXCEPTIONS: readonly string[] = [];

const EVENTS_INCLUDE = /\bevents\s*:\s*(true|\{)/;

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

const publicReaders = PUBLIC_READ_ROOTS.flatMap((root) => walk(root)).filter(
  (file) => !PRIVATE_PREFIXES.some((prefix) => file.startsWith(prefix))
);

/**
 * Inclusions `events: true` (jamais filtrable), ou `events: {` dont la ligne et les 3 suivantes
 * n'ont pas `PUBLIC_EVENT_WHERE`.
 */
function unfilteredEventIncludes(file: string, source: string): string[] {
  const lines = source.split("\n");
  return lines.flatMap((line, index) => {
    const match = EVENTS_INCLUDE.exec(line);
    if (!match) return [];
    const location = `${file}:${index + 1}`;
    if (match[1] === "true") return [location];
    const window = lines.slice(index, index + 4).join("\n");
    return window.includes("PUBLIC_EVENT_WHERE") ? [] : [location];
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

  it("chaque lecture publique des étapes passe par PUBLIC_EVENT_WHERE", () => {
    const offenders = publicReaders
      .flatMap((file) => unfilteredEventIncludes(file, readFileSync(file, "utf8")))
      .filter((location) => !UNFILTERED_EXCEPTIONS.includes(location));
    expect(offenders).toEqual([]);
  });

  it("contrôle positif : le scanner voit les deux chargeurs publics connus", () => {
    for (const file of [
      "src/app/affaires/[slug]/page.tsx",
      "src/lib/data/politician-profile-reads.ts",
    ]) {
      expect(publicReaders).toContain(file);
      expect(readFileSync(file, "utf8")).toMatch(EVENTS_INCLUDE);
    }
    expect(publicReaders.some((file) => file.startsWith("src/app/admin/"))).toBe(false);
  });

  it("contrôle positif : une inclusion fautive en mémoire est repérée", () => {
    const bare = "db.affair.findMany({\n  include: { events: true },\n});";
    const unfiltered = 'include: {\n  events: {\n    orderBy: { date: "asc" },\n  },\n}';
    const filtered = "events: {\n  where: PUBLIC_EVENT_WHERE,\n}";
    expect(unfilteredEventIncludes("x.ts", bare)).toEqual(["x.ts:2"]);
    expect(unfilteredEventIncludes("x.ts", unfiltered)).toEqual(["x.ts:2"]);
    expect(unfilteredEventIncludes("x.ts", filtered)).toEqual([]);
  });
});
