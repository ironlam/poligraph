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

function sourceSection(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) return "";
  return source.slice(startIndex, endIndex);
}

describe("architecture de publication de la participation", () => {
  it("borne le producteur persistant de participation à l'Assemblée nationale", () => {
    const source = withoutComments(readFileSync("src/services/sync/compute-stats.ts", "utf8"));
    const producer = source.match(
      /async function computePoliticianParticipation[\s\S]*?(?=async function computeDissidenceData)/
    )?.[0];

    expect(producer).toBeDefined();
    expect(producer).toContain("m.type = 'DEPUTE'");
    expect(producer).toContain("m.type IN ('DEPUTE'::\"MandateType\", 'SENATEUR'");
    expect(producer).toContain("HAVING COUNT(*) = 1");
    expect(producer).toContain("COUNT(*) FILTER (WHERE m.type = 'DEPUTE'::\"MandateType\") = 1");
    expect(producer).not.toMatch(/ROUND\([^)]*participationRate/);
    expect(producer).toContain("computationVersion: PARTICIPATION_METHOD_VERSION");
  });

  it("valide la source nominative Sénat avant toute réécriture locale", () => {
    const source = withoutComments(readFileSync("src/services/sync/scrutins-senat.ts", "utf8"));

    expect(source).toContain("assessSenateVoteSource(votes, officialTotals)");
    expect(source).toContain('sourceAssessment.status !== "COMPLETE"');
    expect(source).toContain("mapSenateVotePosition(vote.vote)");
    expect(source).toContain('status: "COMPLETE"');
    expect(source).not.toMatch(/default:\s*return\s+["']ABSENT["']/);
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
    expect(producer).toContain("parliamentaryGroupStats.upsert");
    expect(producer.match(/averageParticipationPct:\s*null/g)).toHaveLength(2);
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

    const producer = withoutComments(readFileSync("src/services/sync/compute-stats.ts", "utf8"));
    expect(producer).toContain('key: { in: ["party-participation-SENAT"');
    expect(producer).not.toContain('upsertStatsSnapshot("party-participation-SENAT"');
    expect(producer).not.toContain('upsertStatsSnapshot("group-participation-SENAT"');
  });

  it("utilise des comptages Prisma explicites pour les résultats par chambre", () => {
    const source = withoutComments(readFileSync("src/services/voteStats.ts", "utf8"));
    const counts = sourceSection(
      source,
      "async function getChamberCounts",
      "export interface PoliticianVotingStats"
    );

    expect(counts).not.toBe("");
    expect(counts).not.toContain("$queryRaw");
    expect(counts.match(/db\.scrutin\.count/g)).toHaveLength(4);
  });

  it("borne la dissidence live aux couples scrutin/groupe du politicien cible", () => {
    const source = withoutComments(readFileSync("src/services/politician-dissidence.ts", "utf8"));
    const start = source.indexOf("export async function computeTargetedPoliticianDissidence");
    const dissidence = start >= 0 ? source.slice(start) : "";

    expect(dissidence).not.toBe("");
    expect(dissidence).toContain('WHERE v."politicianId" = ${politicianId}');
    expect(dissidence).toContain("jsonb_to_recordset(${relevantPairsJson}::jsonb)");
    expect(dissidence).toContain("group_members AS MATERIALIZED");
    expect(dissidence).toContain("JOIN relevant_pairs rp");
    expect(dissidence).not.toContain("WITH current_votes AS");
    expect(dissidence).not.toContain("CURRENT_GROUP_VOTES_PREDICATE}");
    expect(dissidence.match(/v\.position IN \('POUR', 'CONTRE', 'ABSTENTION'\)/g)).toHaveLength(3);
    expect(dissidence.match(/v\."votingDate" >= m\."startDate"/g)).toHaveLength(3);
    expect(
      dissidence.match(/m\."endDate" IS NULL OR v\."votingDate" <= m\."endDate"/g)
    ).toHaveLength(3);
    expect(dissidence.match(/WHEN m\.type = 'DEPUTE'.*THEN 'AN'/g)).toHaveLength(3);
    expect(dissidence).not.toContain("NON_VOTANT");
    expect(dissidence).not.toContain("ABSENT");
    expect(dissidence).toContain("computePoliticianDissidence");
    expect(dissidence).toContain("findGroupMajority");
  });
});
