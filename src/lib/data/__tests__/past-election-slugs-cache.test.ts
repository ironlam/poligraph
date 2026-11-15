import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * `getPastElectionSlugs` answers a question the clock can change on its own: an election flips from
 * "À venir" to "Résultats" on polling day, with no database write behind it.
 *
 * It is read by the header of every page, so the profile of its cached part sets the ISR
 * revalidate and expire of the whole site. Under `hours` every route was revalidated each hour and
 * expired after a day, whatever its own `revalidate` said (measured on 575 prerendered routes in
 * November 2026). So the rows are cached under `synced`, and the clock is read outside the cached
 * function: a cached entry must not keep the verdict of the moment it was cached.
 *
 * Read from source rather than executed: `cacheLife` is a Next compiler directive with no runtime
 * value to assert. The slices are deliberately narrow, one per function body.
 */
describe("getPastElectionSlugs cache policy", () => {
  const source = readFileSync(resolve(__dirname, "../../../lib/data/elections.ts"), "utf-8");

  const verdict = source.slice(
    source.indexOf("export async function getPastElectionSlugs"),
    source.indexOf("async function loadNavElectionRows")
  );
  const rows = source.slice(
    source.indexOf("async function loadNavElectionRows"),
    source.indexOf("export async function loadFeaturedElection")
  );

  it("finds the functions it is guarding", () => {
    expect(verdict).not.toBe("");
    expect(rows).not.toBe("");
  });

  it("reads the clock outside any cache boundary", () => {
    expect(verdict).toMatch(/isElectionOver\(election, now\)/);
    expect(verdict).not.toContain('"use cache"');
    expect(rows).not.toContain("isElectionOver");
  });

  it("caches the rows on the daily profile, like every boundary a public page reads", () => {
    expect(rows).toContain('"use cache"');
    expect(rows).toMatch(/cacheLife\(\s*"synced"\s*\)/);
  });

  it("stays purgeable through the elections tag", () => {
    expect(rows).toMatch(/cacheTag\(\s*"elections"/);
  });
});
