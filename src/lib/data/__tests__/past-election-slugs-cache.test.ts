import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * `getPastElectionSlugs` answers a question the clock can change on its own: an election flips from
 * "À venir" to "Passée" on polling day, with no database write behind it. Nothing purges the
 * "elections" tag that day either, since the daily sync revalidates "votes" alone.
 *
 * So its cache profile is load-bearing. Under `synced` (revalidate 86 400 s) the mobile menu would
 * keep announcing a ballot that has already been held, for up to a day. `hours` (revalidate 3 600 s)
 * is what `src/lib/cache.ts` designates as ELECTION_PROFILE, and what
 * `revalidateTag("elections", …)` already passes on the purge side.
 *
 * Read from source rather than executed: `cacheLife` is a Next compiler directive with no runtime
 * value to assert. The regex is deliberately narrow, matching this one function's body.
 */
describe("getPastElectionSlugs cache policy", () => {
  const source = readFileSync(resolve(__dirname, "../../../lib/data/elections.ts"), "utf-8");

  const body = source.slice(
    source.indexOf("export async function getPastElectionSlugs"),
    source.indexOf("export async function loadFeaturedElection")
  );

  it("finds the function it is guarding", () => {
    expect(body).not.toBe("");
    expect(body).toContain("isElectionOver");
  });

  it("caches on the election profile, not the daily one", () => {
    expect(body).toMatch(/cacheLife\(\s*"hours"\s*\)/);
    expect(body).not.toMatch(/cacheLife\(\s*"synced"\s*\)/);
  });

  it("stays purgeable through the elections tag", () => {
    expect(body).toMatch(/cacheTag\(\s*"elections"/);
  });
});
