import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ $queryRaw: vi.fn() }));

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { getPoliticianDissidence } from "@/services/voteStats";
import {
  computePoliticianDissidence,
  findGroupMajority,
  type GroupVoteEntry,
  type PoliticianVoteWithGroup,
} from "@/services/sync/dissidence";

const targetId = "politician-target";

function target(scrutinId: string, groupId: string, position: string) {
  return {
    politicianId: targetId,
    scrutinId,
    groupId,
    position,
  };
}

function groupCount(scrutinId: string, groupId: string, position: string, count: number) {
  return {
    scrutinId,
    groupId,
    position,
    count,
  };
}

describe("dissidence individuelle target-first", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reste strictement identique aux helpers batch sur les cas de doctrine", async () => {
    const targetVotes = [
      // Aligné avec une majorité POUR.
      target("aligned", "g1", "POUR"),
      // Dissident face à une majorité POUR.
      target("dissident", "g1", "CONTRE"),
      // Abstention majoritaire.
      target("abstention", "g1", "ABSTENTION"),
      // Égalité déterministe: CONTRE précède POUR alphabétiquement.
      target("tie", "g1", "POUR"),
      // Second groupe pertinent.
      target("other-group", "g2", "CONTRE"),
      // Défense en profondeur si une position non exprimée franchissait le SQL.
      target("ignored", "g2", "NON_VOTANT"),
    ];
    const counts = [
      groupCount("aligned", "g1", "POUR", 8),
      groupCount("aligned", "g1", "CONTRE", 2),
      groupCount("dissident", "g1", "POUR", 7),
      groupCount("dissident", "g1", "CONTRE", 3),
      groupCount("abstention", "g1", "ABSTENTION", 6),
      groupCount("abstention", "g1", "POUR", 4),
      groupCount("tie", "g1", "POUR", 5),
      groupCount("tie", "g1", "CONTRE", 5),
      groupCount("other-group", "g2", "CONTRE", 9),
      groupCount("other-group", "g2", "POUR", 1),
      groupCount("ignored", "g2", "NON_VOTANT", 100),
    ];
    dbMock.$queryRaw.mockResolvedValueOnce(targetVotes).mockResolvedValueOnce(counts);

    const live = await getPoliticianDissidence(targetId);
    const batch = computePoliticianDissidence(
      targetVotes as PoliticianVoteWithGroup[],
      findGroupMajority(counts as GroupVoteEntry[])
    ).get(targetId);

    expect(live).toEqual({ count: 2, total: 5, rate: 40 });
    expect(live).toEqual({
      count: batch?.dissidenceCount,
      total: batch?.dissidenceTotal,
      rate: batch?.dissidenceRate,
    });
  });

  it("retourne null sans vote exprimé applicable", async () => {
    dbMock.$queryRaw.mockResolvedValue([]);

    await expect(getPoliticianDissidence(targetId)).resolves.toBeNull();
    expect(dbMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("borne aussi le chemin des profils à grand volume aux couples pertinents", async () => {
    const targetVotes = Array.from({ length: 501 }, (_, index) =>
      target(`scrutin-${index}`, "g-heavy", "POUR")
    );
    const counts = targetVotes.map((vote) => groupCount(vote.scrutinId, vote.groupId, "POUR", 10));
    dbMock.$queryRaw.mockResolvedValueOnce(targetVotes).mockResolvedValueOnce(counts);

    await expect(getPoliticianDissidence(targetId)).resolves.toEqual({
      count: 0,
      total: 501,
      rate: 0,
    });

    const groupQueryParts = dbMock.$queryRaw.mock.calls[1]?.[0] as readonly string[];
    const groupQuery = groupQueryParts.join("?");
    expect(groupQuery).toContain("applicable_group_votes AS MATERIALIZED");
    expect(groupQuery).toContain("jsonb_to_recordset(?::jsonb)");
  });
});
