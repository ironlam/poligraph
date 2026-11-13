import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  election: { findUnique: vi.fn() },
  candidacy: { findMany: vi.fn() },
  statsSnapshot: { findUnique: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));

import { getSenatorialesResults } from "../senatoriales";

const SNAPSHOT = {
  capturedAt: "2026-09-20T00:00:00.000Z",
  totalSeats: 348,
  seatsAtStake: 178,
  seats: [],
  groups: [],
};

describe("getSenatorialesResults, forme de la requête", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.statsSnapshot.findUnique.mockResolvedValue({ data: SNAPSHOT });
    dbMock.candidacy.findMany.mockResolvedValue([]);
  });

  it("filtre les élus sur l'identifiant de l'élection, jamais par jointure sur le slug", async () => {
    dbMock.election.findUnique.mockResolvedValue({
      id: "election-senat-2026",
      status: "COMPLETED",
    });

    await getSenatorialesResults();

    // The slug join made Postgres walk the whole Candidacy primary key (20 to 40 s per page).
    const { where } = dbMock.candidacy.findMany.mock.calls[0]![0];
    expect(where).toEqual({ electionId: "election-senat-2026", isElected: true });
    expect(where).not.toHaveProperty("election");
  });

  it("ne lit aucune candidature quand l'élection n'existe pas", async () => {
    dbMock.election.findUnique.mockResolvedValue(null);

    const summary = await getSenatorialesResults();

    expect(dbMock.candidacy.findMany).not.toHaveBeenCalled();
    expect(summary.elected).toEqual([]);
  });
});
