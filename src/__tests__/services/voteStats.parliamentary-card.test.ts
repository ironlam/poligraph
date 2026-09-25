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
  const source = readFileSync("src/app/politiques/[slug]/page.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("ne lit les statistiques de vote qu'une fois", () => {
    // Two reads under two cache keys returned the same value, so no behavioural test
    // could see the duplicate. It cost a render one extra chain on a pool of four.
    expect(source.match(/getPoliticianVotingStats\(/g)).toHaveLength(1);
    expect(source).not.toContain("getPoliticianParliamentaryCard");
  });

  it("garde la dissidence dans la frontière de cache des votes", () => {
    const boundary = source.slice(
      source.indexOf("async function getVoteStats"),
      source.indexOf("export async function generateMetadata")
    );

    expect(boundary).toContain('"use cache"');
    expect(boundary).toContain("getPoliticianDissidence(politicianId)");
    expect(source.match(/getPoliticianDissidence\(/g)).toHaveLength(1);
  });
});
