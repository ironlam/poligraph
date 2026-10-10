import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
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

  // The pages read the stored document. A second caller of these reads would rebuild the profile
  // tree on a request path, the ~35 queries per render the document exists to remove.
  it("ne sont appelées, hors tests, que par la construction du document", () => {
    const callers = sourceFiles("src")
      .filter((file) => !file.includes("__tests__"))
      .filter((file) =>
        /\b(?:readPoliticianIdentity|readPoliticianDossier)\(/.test(withoutComments(read(file)))
      )
      .filter((file) => !file.endsWith("politician-profile-reads.ts"));
    expect(callers).toEqual(["src/lib/politicians/profile-snapshot/build.ts"]);
  });

  it("sont appelées l'une après l'autre par la construction du document", () => {
    // One connection at a time: PostgresDriverMetrics does not measure concurrency.
    const build = withoutComments(read("src/lib/politicians/profile-snapshot/build.ts"));
    expect(build).toMatch(/readPoliticianIdentity\(/);
    expect(build).toMatch(/readProfileVoteStats\(/);
    expect(build).not.toMatch(/Promise\.all/); // also catches Promise.allSettled
  });
});
