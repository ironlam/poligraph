import { describe, it, expect, vi, beforeEach } from "vitest";
import { isGovernmentFunctionType } from "../government-sync-guard";

const { dbMock, wikidataMock } = vi.hoisted(() => ({
  dbMock: {
    externalId: { findMany: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
    mandate: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    politician: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    party: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
  },
  wikidataMock: {
    getPositions: vi.fn(),
    getEntities: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/api", () => ({
  WikidataService: class {
    getPositions = wikidataMock.getPositions;
    getEntities = wikidataMock.getEntities;
  },
}));
vi.mock("@/services/politician", () => ({
  setCurrentParty: vi.fn(),
  setPartyRole: vi.fn(),
}));

import { syncCareers } from "../careers";

describe("isGovernmentFunctionType", () => {
  it("reconnaît les quatre fonctions gouvernementales", () => {
    for (const t of ["PREMIER_MINISTRE", "MINISTRE", "MINISTRE_DELEGUE", "SECRETAIRE_ETAT"]) {
      expect(isGovernmentFunctionType(t)).toBe(true);
    }
  });
  it("rejette les autres types", () => {
    for (const t of ["DEPUTE", "MAIRE", "SENATEUR", "PRESIDENT_REPUBLIQUE", ""]) {
      expect(isGovernmentFunctionType(t)).toBe(false);
    }
  });
});

describe("exclusion permanente des fonctions gouvernementales (import des carrières)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.externalId.findMany
      .mockResolvedValueOnce([
        {
          externalId: "Q1",
          politician: { id: "p1", fullName: "Test Élu", mandates: [] },
        },
      ])
      .mockResolvedValue([]);
    wikidataMock.getPositions.mockResolvedValue(
      new Map([
        [
          "Q1",
          [
            { positionId: "Q83307", startDate: new Date("2020-01-01"), endDate: null },
            { positionId: "Q1587677", startDate: new Date("2019-01-01"), endDate: null },
            { positionId: "Q30185", startDate: new Date("2014-03-30"), endDate: null },
          ],
        ],
      ])
    );
    wikidataMock.getEntities.mockResolvedValue(new Map());
  });

  it("crée le mandat non gouvernemental et ignore les fonctions gouvernementales", async () => {
    const result = await syncCareers();
    const created = dbMock.mandate.create.mock.calls.map((c) => c[0].data.type);
    expect(created).toEqual(["MAIRE"]);
    expect(dbMock.mandate.update).not.toHaveBeenCalled();
    expect(result.mandatesCreated).toBe(1);
    expect(result.governmentFunctionsSkipped).toBe(2);
  });
});
