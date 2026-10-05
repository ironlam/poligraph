import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("lectures brutes de la fiche politicien", () => {
  it("n'utilisent aucun cache Next", () => {
    const src = withoutComments(read("src/lib/data/politician-profile-reads.ts"));
    expect(src).not.toMatch(/["']use cache["']|cacheTag\(|cacheLife\(/);
    expect(src).not.toMatch(/getPoliticianVotingStats\(/);
    expect(src).toMatch(/computePoliticianVotingStats\(/);
  });

  it("sont déléguées par les lectures en cache", () => {
    const politicians = withoutComments(read("src/lib/data/politicians.ts"));
    expect(politicians).toMatch(/readPoliticianIdentity\(/);
    expect(politicians).toMatch(/readPoliticianDossier\(/);
  });

  it("sont appelées l'une après l'autre par la construction du document", () => {
    // One connection at a time: PostgresDriverMetrics does not measure concurrency.
    const build = withoutComments(read("src/lib/politicians/profile-snapshot/build.ts"));
    expect(build).toMatch(/readPoliticianIdentity\(/);
    expect(build).toMatch(/readProfileVoteStats\(/);
    expect(build).not.toMatch(/Promise\.all/); // also catches Promise.allSettled
  });
});
