import { describe, it, expect } from "vitest";
import {
  findGroupMajority,
  computePoliticianDissidence,
  aggregateDissidenceByGroup,
  CURRENT_GROUP_VOTES_FROM,
  type GroupVoteEntry,
  type PoliticianVoteWithGroup,
} from "../dissidence";

describe("CURRENT_GROUP_VOTES_FROM (shared dissidence scan)", () => {
  // Regression: the group majority and the individual votes MUST come from the
  // same population. The mandate date filter has to stay in the shared fragment,
  // otherwise the majority is computed on out-of-mandate votes (past bug: 333
  // majorities flipped, ~140 politicians judged against a wrong majority).
  const sql = CURRENT_GROUP_VOTES_FROM.sql;

  it("filters votes to the current mandate date range", () => {
    expect(sql).toContain('v."votingDate" >= m."startDate"');
    expect(sql).toContain('m."endDate" IS NULL OR v."votingDate" <= m."endDate"');
  });

  it("scopes to current DEPUTE/SENATEUR mandates and real positions", () => {
    expect(sql).toContain('m."isCurrent" = true');
    expect(sql).toContain("'DEPUTE'::\"MandateType\", 'SENATEUR'::\"MandateType\"");
    expect(sql).toContain("v.position IN ('POUR', 'CONTRE', 'ABSTENTION')");
  });
});

describe("findGroupMajority", () => {
  it("returns the position with most votes per scrutin+group", () => {
    const entries: GroupVoteEntry[] = [
      { scrutinId: "s1", groupId: "g1", position: "POUR", count: 10 },
      { scrutinId: "s1", groupId: "g1", position: "CONTRE", count: 3 },
      { scrutinId: "s1", groupId: "g1", position: "ABSTENTION", count: 2 },
      { scrutinId: "s1", groupId: "g2", position: "POUR", count: 2 },
      { scrutinId: "s1", groupId: "g2", position: "CONTRE", count: 8 },
    ];
    const result = findGroupMajority(entries);
    expect(result.get("s1:g1")).toBe("POUR");
    expect(result.get("s1:g2")).toBe("CONTRE");
  });

  it("picks first position alphabetically on tie", () => {
    const entries: GroupVoteEntry[] = [
      { scrutinId: "s1", groupId: "g1", position: "POUR", count: 5 },
      { scrutinId: "s1", groupId: "g1", position: "CONTRE", count: 5 },
    ];
    const result = findGroupMajority(entries);
    expect(result.get("s1:g1")).toBe("CONTRE");
  });
});

describe("computePoliticianDissidence", () => {
  it("calculates dissidence rate correctly", () => {
    const majority = new Map([
      ["s1:g1", "POUR"],
      ["s2:g1", "POUR"],
      ["s3:g1", "CONTRE"],
    ]);
    const votes: PoliticianVoteWithGroup[] = [
      { politicianId: "p1", scrutinId: "s1", groupId: "g1", position: "POUR" },
      { politicianId: "p1", scrutinId: "s2", groupId: "g1", position: "CONTRE" },
      { politicianId: "p1", scrutinId: "s3", groupId: "g1", position: "CONTRE" },
    ];
    const result = computePoliticianDissidence(votes, majority);
    expect(result.get("p1")).toEqual({
      dissidenceCount: 1,
      dissidenceTotal: 3,
      dissidenceRate: 33.3,
    });
  });

  it("returns empty map for votes with no group majority", () => {
    const majority = new Map<string, string>();
    const votes: PoliticianVoteWithGroup[] = [
      { politicianId: "p1", scrutinId: "s1", groupId: "g1", position: "POUR" },
    ];
    const result = computePoliticianDissidence(votes, majority);
    expect(result.size).toBe(0);
  });
});

describe("aggregateDissidenceByGroup", () => {
  it("averages dissidence rates per group", () => {
    const data = [
      {
        groupId: "g1",
        groupCode: "EPR",
        groupName: "EPR",
        groupColor: "#0033cc",
        groupChamber: "AN",
        dissidenceRate: 10,
      },
      {
        groupId: "g1",
        groupCode: "EPR",
        groupName: "EPR",
        groupColor: "#0033cc",
        groupChamber: "AN",
        dissidenceRate: 20,
      },
      {
        groupId: "g1",
        groupCode: "EPR",
        groupName: "EPR",
        groupColor: "#0033cc",
        groupChamber: "AN",
        dissidenceRate: 15,
      },
      {
        groupId: "g2",
        groupCode: "RN",
        groupName: "RN",
        groupColor: "#002060",
        groupChamber: "AN",
        dissidenceRate: 5,
      },
      {
        groupId: "g2",
        groupCode: "RN",
        groupName: "RN",
        groupColor: "#002060",
        groupChamber: "AN",
        dissidenceRate: 5,
      },
      {
        groupId: "g2",
        groupCode: "RN",
        groupName: "RN",
        groupColor: "#002060",
        groupChamber: "AN",
        dissidenceRate: 5,
      },
    ];
    const result = aggregateDissidenceByGroup(data);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.groupCode === "EPR")?.avgDissidenceRate).toBe(15);
    expect(result.find((r) => r.groupCode === "RN")?.avgDissidenceRate).toBe(5);
  });

  it("excludes groups with fewer than 3 members", () => {
    const data = [
      {
        groupId: "g1",
        groupCode: "EPR",
        groupName: "EPR",
        groupColor: null,
        groupChamber: "AN",
        dissidenceRate: 10,
      },
      {
        groupId: "g1",
        groupCode: "EPR",
        groupName: "EPR",
        groupColor: null,
        groupChamber: "AN",
        dissidenceRate: 20,
      },
    ];
    const result = aggregateDissidenceByGroup(data);
    expect(result).toHaveLength(0);
  });
});
