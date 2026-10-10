import { beforeEach, describe, expect, it, vi } from "vitest";

const { governmentFindMany, membershipFindMany, cacheTag, cacheLife } = vi.hoisted(() => ({
  governmentFindMany: vi.fn(),
  membershipFindMany: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheTag, cacheLife }));
vi.mock("@/lib/db", () => ({
  db: {
    government: { findMany: governmentFindMany },
    mandateGovernment: { findMany: membershipFindMany },
  },
}));

import { getGovernmentEpisodes, getPublishedGovernments } from "../governments";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const politician = {
  id: "p1",
  publicId: null,
  slug: "jean-test",
  fullName: "Jean Test",
  lastName: "Test",
  civility: null,
  photoUrl: null,
  blobPhotoUrl: null,
  biography: null,
  publicationStatus: "DRAFT",
  statusOverride: false,
};

function membershipRow(id: string, politicianId: string) {
  return {
    id,
    governmentId: "g1",
    startEvidence: "ACT",
    startSourceUrl: null,
    endEvidence: null,
    endSourceUrl: null,
    endKind: null,
    predecessorId: null,
    sameDayOrderEstablished: false,
    sameDayOrderSourceUrl: null,
    currentAffairsEndedAt: null,
    startDetermination: "CONVENTION",
    endDetermination: null,
    currentAffairsEndDetermination: null,
    startAct: {
      label: "Décret",
      url: "https://act/start",
      signedAt: d("2025-10-12"),
      effectiveAt: null,
      journalPublishedAt: null,
      journalNumber: null,
      jorfId: null,
    },
    endAct: null,
    currentAffairsEndAct: null,
    mandate: {
      id: `m-${id}`,
      publicId: null,
      type: "MINISTRE",
      title: "Ministre",
      startDate: d("2025-10-12"),
      endDate: null,
      lastConfirmedAt: d("2026-09-30"),
      politician: { ...politician, id: politicianId },
    },
  };
}

const governmentRow = {
  id: "g1",
  slug: "lecornu-2",
  name: "Gouvernement Sébastien Lecornu II",
  sequence: 48,
  primeMinister: { slug: "sebastien-lecornu", fullName: "Sébastien Lecornu", civility: "M." },
  primeMinisterAppointedAt: d("2025-10-10"),
  primeMinisterAppointedEvidence: "ACT",
  primeMinisterAppointedDetermination: null,
  formedAt: d("2025-10-12"),
  formedEvidence: "ACT",
  formedSourceUrl: null,
  formedDetermination: null,
  resignedAt: null,
  resignedEvidence: null,
  resignedSourceUrl: null,
  resignedDetermination: null,
  endedAt: null,
  endedEvidence: null,
  endedSourceUrl: null,
  endedDetermination: null,
  completeness: "COMPLETE",
  pendingChanges: null,
  coverageNote: null,
  compositionVerifiedAt: d("2026-09-30"),
  compositionVerifiedSourceUrl: null,
  compositionCheckedAt: null,
  primeMinisterAppointedAct: null,
  formedAct: null,
  resignedAct: null,
  endedAct: null,
  currentAffairsAct: null,
  currentAffairsActId: null,
  updatedAt: new Date("2026-10-10T08:30:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPublishedGovernments", () => {
  it("une seule requête, limitée aux gouvernements publiés, sous le tag gouvernements", async () => {
    governmentFindMany.mockResolvedValue([]);
    membershipFindMany.mockResolvedValue([]);
    await getPublishedGovernments();
    expect(governmentFindMany).toHaveBeenCalledTimes(1);
    expect(governmentFindMany.mock.calls[0]![0].where).toEqual({ publicationStatus: "PUBLISHED" });
    expect(cacheTag).toHaveBeenCalledWith("gouvernements");
    expect(cacheLife).toHaveBeenCalledWith("synced");
  });

  it("ne recharge pas les fonctions : les compteurs viennent du lecteur des fonctions", async () => {
    governmentFindMany.mockResolvedValue([governmentRow]);
    membershipFindMany.mockResolvedValue([membershipRow("mg1", "p1"), membershipRow("mg2", "p1")]);
    const [g] = await getPublishedGovernments();
    const select = governmentFindMany.mock.calls[0]![0].select;
    expect(select.memberships).toBeUndefined();
    expect(JSON.stringify(select)).not.toContain("biography");
    expect(JSON.stringify(membershipFindMany.mock.calls[0]![0].select)).toContain("biography");
    expect(membershipFindMany).toHaveBeenCalledTimes(1);
    expect(g).toMatchObject({ slug: "lecornu-2", participantCount: 1, hiddenCount: 0 });
  });
});

describe("getGovernmentEpisodes", () => {
  it("une seule requête sur les fonctions des gouvernements publiés", async () => {
    membershipFindMany.mockResolvedValue([membershipRow("mg1", "p1")]);
    const { episodes, people } = await getGovernmentEpisodes();
    expect(membershipFindMany).toHaveBeenCalledTimes(1);
    expect(membershipFindMany.mock.calls[0]![0].where).toEqual({
      government: { publicationStatus: "PUBLISHED" },
    });
    expect(cacheTag).toHaveBeenCalledWith("gouvernements");
    expect(episodes).toHaveLength(1);
    expect(episodes[0]!).toMatchObject({
      start: "2025-10-12",
      startSourceUrl: "https://act/start",
      lastConfirmedAt: "2026-09-30",
    });
    expect(people.p1).toMatchObject({ slug: "jean-test", visibility: "pending" });
  });
});
