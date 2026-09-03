import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function tsxFiles(directory: string): string[] {
  return readdirSync(join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith(".tsx") ? [relative(ROOT, join(ROOT, path))] : [];
  });
}

describe("public page performance contracts", () => {
  it("keeps public images behind the Next optimizer", () => {
    const violations = [...tsxFiles("src/app"), ...tsxFiles("src/components")]
      .filter((path) => !path.includes("opengraph-image") && !path.includes("__tests__"))
      .filter((path) => /\bunoptimized\b/.test(read(path)));

    expect(violations).toEqual([]);
  });

  it("renders one statistics dataset per server route", () => {
    const landing = read("src/app/statistiques/page.tsx");
    const navigation = read("src/components/stats/StatsTabs.tsx");

    expect(landing).toContain("getJudicialData");
    expect(landing).not.toMatch(/getFactCheckData|getLegislativeData|getParticipationData/);
    expect(navigation).not.toContain('"use client"');
    expect(navigation).toContain("prefetch={false}");
  });

  it("does not preload low-intent link collections", () => {
    expect(read("src/components/layout/Footer.tsx")).toContain("prefetch={false}");
    expect(
      read("src/app/elections/presidentielle-2027/_components/CandidacyDirectoryLink.tsx")
    ).toContain("prefetch={false}");
  });

  it("counts candidacy measures without loading complete revisions", () => {
    const source = read("src/lib/data/presidential-candidacy-field.ts");
    expect(source).toContain("getPublicMeasureRollupsByElection");
    expect(source).not.toContain("getPublicMeasuresByElection");
  });
});
