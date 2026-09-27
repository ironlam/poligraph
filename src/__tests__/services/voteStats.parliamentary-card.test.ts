import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));

import { buildPoliticianParliamentaryCard, type PoliticianVotingStats } from "@/services/voteStats";

const STATS: PoliticianVotingStats = {
  total: 120,
  pour: 60,
  contre: 30,
  abstention: 10,
  nonVotant: 20,
  eligibleScrutins: 200,
  scrutinsSansVoteEnregistre: 80,
  participationRate: 50,
  participationStatus: "AVAILABLE",
};

describe("buildPoliticianParliamentaryCard", () => {
  it("derives the card from the stats the profile already read, without a query", () => {
    expect(
      buildPoliticianParliamentaryCard("DEPUTE", STATS, { count: 4, total: 100, rate: 4 })
    ).toEqual({
      chamber: "AN",
      mandateType: "DEPUTE",
      votesCount: 100,
      eligibleScrutins: 200,
      participationRate: 50,
      participationStatus: "AVAILABLE",
      rank: null,
      totalPeers: null,
      dissidenceRate: 4,
      dissidenceCount: 4,
      dissidenceTotal: 100,
    });
  });

  it("maps a senator to the Senate and leaves dissidence empty when none is computable", () => {
    const card = buildPoliticianParliamentaryCard("SENATEUR", STATS, null);

    expect(card.chamber).toBe("SENAT");
    expect(card.dissidenceRate).toBeNull();
    expect(card.dissidenceCount).toBeNull();
    expect(card.dissidenceTotal).toBeNull();
  });
});

describe("fiche politicien : une seule lecture des statistiques par rendu", () => {
  function read(path: string): string {
    return readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  }

  const page = read("src/app/politiques/[slug]/page.tsx");
  const body = read("src/app/politiques/[slug]/_components/PoliticianProfileBody.tsx");
  const voteStats = read("src/app/politiques/[slug]/vote-stats.ts");

  it("ne lit les statistiques de vote qu'une fois", () => {
    // Two reads under two cache keys returned the same value, so no behavioural test
    // could see the duplicate. It cost a render one extra chain on a pool of four.
    expect(voteStats.match(/getPoliticianVotingStats\(/g)).toHaveLength(1);
    expect(page).not.toContain("getPoliticianVotingStats");
    expect(body).not.toContain("getPoliticianVotingStats");
    expect(page + body + voteStats).not.toContain("getPoliticianParliamentaryCard");
  });

  it("résout le parlementaire même quand un mandat local est plus récent", () => {
    // Mandates arrive sorted by startDate desc, so a deputy who became mayor has the mayoral
    // mandate first. Reading the headline mandate served an empty votes tab to 42 people.
    const flatPage = page.replace(/\s+/g, " ");

    expect(flatPage).not.toMatch(/const mandateType =[^;]*\bcurrentMandate\b/);
    expect(flatPage).not.toMatch(/const isDepute =[^;]*\bcurrentMandate\b/);
    expect(body.replace(/\s+/g, " ")).toMatch(/currentMandate=\{\s*currentParliamentaryMandate/);
  });

  it("garde la dissidence dans la frontière de cache des votes", () => {
    const boundary = voteStats.slice(
      voteStats.indexOf("export async function getProfileVoteStats")
    );

    expect(boundary).toContain('"use cache"');
    expect(boundary).toContain("getPoliticianDissidence(politicianId)");
    expect(voteStats.match(/getPoliticianDissidence\(/g)).toHaveLength(1);
  });

  it("n'élargit pas le rendu en lançant le dossier et les votes ensemble", () => {
    // Each of these two reads already fans out close to the pool's four connections. Running them
    // inside one `Promise.all` asks for eight and queues the excess, which is the shape
    // POLIGRAPH-2X reports. They are awaited one after the other on purpose.
    const flatBody = body.replace(/\s+/g, " ");

    expect(flatBody).toMatch(/const dossier = await getPoliticianDossier\(/);
    expect(flatBody).toMatch(/const voteStats = mandateType \? await getProfileVoteStats\(/);
    expect(flatBody).not.toMatch(/Promise\.all\(\[\s*getPoliticianDossier/);
  });
});
