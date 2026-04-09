import { describe, it, expect, vi, beforeEach } from "vitest";

const createManyMock = vi.fn();
const updateMock = vi.fn();
const deleteManyMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    vote: {
      createMany: (...args: unknown[]) => createManyMock(...args),
      deleteMany: (...args: unknown[]) => deleteManyMock(...args),
    },
    scrutin: {
      update: (...args: unknown[]) => updateMock(...args),
    },
  },
}));

describe("Vote denorm fields are populated by sync write paths", () => {
  beforeEach(() => {
    createManyMock.mockReset();
    deleteManyMock.mockReset();
    updateMock.mockReset();
  });

  it("writeVotesForScrutin writes votingDate AND chamber on every Vote row", async () => {
    // Simulate the per-scrutin write block: load votesToCreate + scrutin metadata,
    // call createMany with denormalized votingDate + chamber.
    const scrutinVotingDate = new Date("2025-03-15T15:00:00Z");
    const scrutinChamber = "AN" as const;
    const votesToCreate = [
      { politicianId: "p1", position: "POUR" },
      { politicianId: "p2", position: "CONTRE" },
    ];

    // This is the SHAPE we want production code to produce after Task 5a.3:
    const expectedData = votesToCreate.map((v) => ({
      scrutinId: "s1",
      politicianId: v.politicianId,
      position: v.position,
      votingDate: scrutinVotingDate, // <-- denorm field 1
      chamber: scrutinChamber, // <-- denorm field 2
    }));

    const { writeVotesForScrutin } = await import("@/services/sync/scrutins-vote-writer");

    await writeVotesForScrutin({
      scrutinId: "s1",
      votingDate: scrutinVotingDate,
      chamber: scrutinChamber,
      votes: votesToCreate as never,
    });

    expect(createManyMock).toHaveBeenCalledWith({
      data: expectedData,
      skipDuplicates: true,
    });
  });

  it("the helper rejects calls without votingDate", async () => {
    const { writeVotesForScrutin } = await import("@/services/sync/scrutins-vote-writer");

    await expect(
      writeVotesForScrutin({
        scrutinId: "s1",
        // @ts-expect-error -- intentional missing field
        votingDate: undefined,
        chamber: "AN",
        votes: [],
      })
    ).rejects.toThrow(/votingDate is required/);
  });

  it("the helper rejects calls without chamber", async () => {
    const { writeVotesForScrutin } = await import("@/services/sync/scrutins-vote-writer");

    await expect(
      writeVotesForScrutin({
        scrutinId: "s1",
        votingDate: new Date(),
        // @ts-expect-error -- intentional missing field
        chamber: undefined,
        votes: [],
      })
    ).rejects.toThrow(/chamber is required/);
  });
});
