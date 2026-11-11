import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  electionFindUnique: vi.fn(),
  candidacyFindMany: vi.fn(),
  measureGroupBy: vi.fn(),
  editionFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    election: { findUnique: mocks.electionFindUnique },
    candidacy: { findMany: mocks.candidacyFindMany },
    measure: { groupBy: mocks.measureGroupBy },
    programEdition: { findMany: mocks.editionFindMany },
  },
}));

import { getPartyPresidentialProgramme } from "./party-presidentielle";

const tracked = [
  {
    id: "c-open",
    candidateName: "Dupont Jeanne",
    status: "DECLARE",
    politician: { slug: "jeanne-dupont", fullName: "Jeanne Dupont" },
  },
  {
    id: "c-closed",
    candidateName: "Martin Paul",
    status: "RETIRE",
    politician: { slug: "paul-martin", fullName: "Paul Martin" },
  },
];

function group(candidacyId: string, theme: string, attribution: string, count: number) {
  return { candidacyId, theme, attribution, _count: { _all: count } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.electionFindUnique.mockResolvedValue({ id: "el-2027" });
  // First call: tracked candidacies. Second call: the ones whose full fiche is open.
  mocks.candidacyFindMany.mockResolvedValueOnce(tracked).mockResolvedValueOnce([{ id: "c-open" }]);
  mocks.measureGroupBy.mockResolvedValue([
    group("c-open", "SANTE", "PARTY_PROGRAM", 3),
    group("c-open", "SANTE", "PERSONAL", 1),
    group("c-open", "INSTITUTIONS", "PERSONAL", 2),
  ]);
  mocks.editionFindMany.mockResolvedValue([]);
});

describe("getPartyPresidentialProgramme", () => {
  it("additionne les mesures par candidature et par thème, dans l'ordre du hub", async () => {
    const programme = await getPartyPresidentialProgramme("party-1", "parti-test");

    expect(programme?.measureCount).toBe(6);
    // SANTE precedes INSTITUTIONS in THEMES_IN_ORDER, whatever the row order.
    expect(programme?.themes).toEqual([
      { theme: "SANTE", measureCount: 4 },
      { theme: "INSTITUTIONS", measureCount: 2 },
    ]);
    expect(programme?.candidacies).toEqual([
      expect.objectContaining({
        candidateName: "Jeanne Dupont",
        ficheOpen: true,
        measureCount: 6,
        partyProgramMeasureCount: 3,
      }),
      expect.objectContaining({ candidateName: "Paul Martin", ficheOpen: false, measureCount: 0 }),
    ]);
  });

  it("ne compte que les mesures du parti demandé et de fiches ouvertes", async () => {
    await getPartyPresidentialProgramme("party-1", "parti-test");

    const where = JSON.stringify(mocks.measureGroupBy.mock.calls[0]?.[0]?.where);
    expect(where).toContain('"partyId":"party-1"');
    expect(where).toContain('"electionId":"el-2027"');
    expect(where).toContain('"publicationStatus":"PUBLISHED"');
    expect(where).toContain('"withdrawnAt":null');
  });

  it("retourne null quand aucune candidature suivie n'est rattachée au parti", async () => {
    mocks.candidacyFindMany.mockReset();
    mocks.candidacyFindMany.mockResolvedValue([]);

    expect(await getPartyPresidentialProgramme("party-1", "parti-test")).toBeNull();
  });
});
