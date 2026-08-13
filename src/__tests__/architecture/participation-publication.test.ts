import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (path.includes("/generated/") || path.includes("/__tests__/")) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}

describe("architecture de publication de la participation", () => {
  it("borne le producteur persistant de participation à l'Assemblée nationale", () => {
    const source = withoutComments(readFileSync("src/services/sync/compute-stats.ts", "utf8"));
    const producer = source.match(
      /async function computePoliticianParticipation[\s\S]*?(?=async function computeDissidenceData)/
    )?.[0];

    expect(producer).toBeDefined();
    expect(producer).toContain("m.type = 'DEPUTE'");
    expect(producer).not.toContain("SENATEUR");
  });

  it("la frontière API réutilise le service fail-closed sans recalcul local", () => {
    const source = withoutComments(
      readFileSync("src/app/api/politiques/[slug]/votes/route.ts", "utf8")
    );

    expect(source).toContain("getPoliticianVotingStats(politician.id)");
    expect(source).not.toMatch(/participationRate\s*[:=].*[\/\*+-]/);
  });

  it("interdit un second moteur de participation dans les statistiques de groupe", () => {
    const producer = withoutComments(
      readFileSync("src/services/sync/compute-group-stats.ts", "utf8")
    );
    const comparator = withoutComments(readFileSync("src/lib/data/compare.ts", "utf8"));

    expect(producer).not.toMatch(/voteCount\s*\/\s*maxVotes/);
    expect(producer).not.toContain("scrutinCount * memberCount");
    expect(producer).not.toContain("parliamentaryGroupStats.upsert");
    expect(producer).not.toMatch(/averageParticipationPct\s*:/);
    expect(comparator).not.toMatch(/activeVotes\s*\/\s*totalVotes/);
  });

  it("neutralise les champs persistés hostiles à chaque loader de groupe public", () => {
    const loaders = withoutComments(readFileSync("src/lib/data/groupes.ts", "utf8"));
    const stats = withoutComments(readFileSync("src/services/voteStats.ts", "utf8"));

    expect(loaders.match(/averageParticipationPct:\s*null/g)).toHaveLength(2);
    expect(stats).toContain("averageParticipationPct: null");
  });

  it("réserve PoliticianParticipation au producteur, jamais à un lecteur public", () => {
    const consumers = sourceFiles("src")
      .filter((path) => !path.includes("/services/sync/"))
      .map((path) => [path, withoutComments(readFileSync(path, "utf8"))] as const)
      .filter(([, source]) => source.includes("politicianParticipation"));

    expect(consumers).toEqual([]);
  });

  it("borne les accès directs aux anciennes statistiques de groupe", () => {
    const consumers = sourceFiles("src")
      .filter((path) => !path.includes("/services/sync/"))
      .map((path) => [path, withoutComments(readFileSync(path, "utf8"))] as const)
      .filter(([, source]) => source.includes("db.parliamentaryGroupStats"))
      .map(([path]) => path);

    expect(consumers).toEqual(["src/services/voteStats.ts"]);
  });

  it("réserve les snapshots de participation au producteur AN", () => {
    const consumers = sourceFiles("src")
      .filter((path) => !path.includes("/services/sync/"))
      .map((path) => [path, withoutComments(readFileSync(path, "utf8"))] as const)
      .filter(([, source]) => /(?:party|group)-participation/.test(source));

    expect(consumers).toEqual([]);
  });
});
