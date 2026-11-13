import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NARROW_TAGS, POLITICIAN_VOTES_TAG, SELECTABLE_TAGS } from "@/lib/cache-tags";

/**
 * The vote record of a profile (counts per legislature, participation, parliamentary path) reads
 * votes and deputy mandates, nothing the daily sync rewrites under "politicians". Tagged
 * "politicians", those readers were re-run three times a day by the daily's final purge: the
 * `Vote` groupBy joined to `Scrutin` alone was about ten hours of database time a week.
 */
const VOTE_READER_FILES = [
  "src/services/voteStats.ts",
  "src/services/politician-legislature-votes.ts",
  "src/lib/data/politician-parliamentary-path.ts",
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function cacheTagCalls(path: string): string[] {
  const code = stripComments(readFileSync(join(process.cwd(), path), "utf8"));
  return [...code.matchAll(/cacheTag\(([^)]*)\)/g)].map((match) => match[1]!);
}

describe("tag des lecteurs de votes de la fiche politicien", () => {
  it("le tag existe et un opérateur peut le purger seul", () => {
    expect(POLITICIAN_VOTES_TAG).toBe("politician-votes");
    expect(NARROW_TAGS).toContain(POLITICIAN_VOTES_TAG);
    expect(SELECTABLE_TAGS).toContain(POLITICIAN_VOTES_TAG);
  });

  it.each(VOTE_READER_FILES)("%s ne porte plus le tag politicians", (path) => {
    const calls = cacheTagCalls(path);
    // Guards the scan itself: no call found would make the checks below pass on nothing.
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call, `cacheTag(${call}) dans ${path}`).not.toContain('"politicians"');
    }
  });

  it.each(VOTE_READER_FILES)("%s garde votes partout et pose le tag étroit", (path) => {
    const calls = cacheTagCalls(path);
    for (const call of calls) expect(call).toContain('"votes"');
    // Not every reader is per politician (the legislature windows are shared), but each file
    // holds at least one that a mandate edit must be able to reach.
    expect(calls.some((call) => call.includes("POLITICIAN_VOTES_TAG"))).toBe(true);
  });
});
