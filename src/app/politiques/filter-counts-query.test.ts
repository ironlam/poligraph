import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The filter counts of /politiques once probed nine EXISTS per published politician. The cost
 * grew with the number of profiles (36 650, mostly mayors) up to a second per run, and came back
 * in Sentry as a slow query each time the corpus grew. They now start from the mandates, the
 * affairs and the party roles. This guard keeps the per-politician form from coming back.
 */
const source = readFileSync(join(process.cwd(), "src/app/politiques/page.tsx"), "utf8");
const start = source.indexOf("async function getFilterCounts()");
const body = source.slice(start, source.indexOf("export default async function", start));
const sql = body.slice(body.indexOf("SELECT"), body.lastIndexOf("`"));

describe("compteurs de filtres de /politiques", () => {
  it("la requête est bien trouvée par ce garde", () => {
    expect(start).toBeGreaterThan(-1);
    expect(sql).toContain('FROM "Mandate" m');
  });

  it("ne sonde plus chaque fiche par des EXISTS corrélés", () => {
    expect(sql).not.toMatch(/WHERE\s+EXISTS/);
    expect(sql).not.toContain('FROM "Politician" p\n    WHERE');
  });

  it("ne compte que des fiches publiées, dans chacune des cinq sous-requêtes", () => {
    const published = sql.match(/p\."publicationStatus" = 'PUBLISHED'/g) ?? [];
    expect(published).toHaveLength(5);
  });
});
