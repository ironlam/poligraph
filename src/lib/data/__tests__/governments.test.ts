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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPublishedGovernments", () => {
  it("une seule requête, limitée aux gouvernements publiés, sous le tag gouvernements", async () => {
    governmentFindMany.mockResolvedValue([]);
    await getPublishedGovernments();
    expect(governmentFindMany).toHaveBeenCalledTimes(1);
    expect(governmentFindMany.mock.calls[0]![0].where).toEqual({ publicationStatus: "PUBLISHED" });
    expect(cacheTag).toHaveBeenCalledWith("gouvernements");
    expect(cacheLife).toHaveBeenCalledWith("synced");
  });
});

describe("getGovernmentEpisodes", () => {
  it("une seule requête sur les fonctions des gouvernements publiés", async () => {
    membershipFindMany.mockResolvedValue([
      {
        id: "mg1",
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
        startAct: { url: "https://act/start" },
        endAct: null,
        currentAffairsEndAct: null,
        mandate: {
          id: "m1",
          publicId: null,
          type: "MINISTRE",
          title: "Ministre",
          startDate: d("2025-10-12"),
          endDate: null,
          lastConfirmedAt: d("2026-09-30"),
          politician,
        },
      },
    ]);
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
