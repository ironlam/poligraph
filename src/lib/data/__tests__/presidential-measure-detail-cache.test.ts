import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheTag: vi.fn(),
  revalidateTags: vi.fn(),
  electionFindUnique: vi.fn(),
  measureFindFirst: vi.fn(),
  measureFindMany: vi.fn(),
  auditLogFindFirst: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheTag: mocks.cacheTag, cacheLife: vi.fn() }));
vi.mock("@/lib/cache", () => ({ revalidateTags: mocks.revalidateTags }));
vi.mock("@/lib/db", () => ({
  db: {
    election: { findUnique: mocks.electionFindUnique },
    measure: { findFirst: mocks.measureFindFirst, findMany: mocks.measureFindMany },
    auditLog: { findFirst: mocks.auditLogFindFirst },
  },
}));
vi.mock("@/lib/data/measure-parliament-links", () => ({
  getMeasureParliamentLinks: vi.fn().mockResolvedValue([]),
}));

import { getPublicPresidentialMeasureDetail } from "@/lib/data/presidential-measure-detail";
import { invalidateMeasureTags } from "@/lib/measures/cache";

const publishedRow = {
  id: "measure-1",
  slug: "une-mesure",
  theme: "ECONOMIE",
  attribution: "CANDIDATE",
  election: { id: "election-1", slug: "presidentielle-2027" },
  programEdition: null,
  publishedRevisionId: "revision-1",
  publishedRevision: {
    text: "Une mesure",
    details: null,
    evidenceSnapshot: null,
    precision: null,
    reviewedAt: new Date("2026-11-01"),
    publishedAt: new Date("2026-11-01"),
    sources: [],
    subtopics: [],
    readerGuideMentions: [],
  },
  candidacy: {
    id: "candidacy-1",
    candidateName: "Personne Test",
    party: null,
    politician: { id: "politician-1", slug: "personne-test", photoUrl: null, blobPhotoUrl: null },
  },
  voteLinks: [],
};

function tags(): string[] {
  return mocks.cacheTag.mock.calls.flat();
}

describe("page mesure : tags de cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.electionFindUnique.mockResolvedValue({ id: "election-1" });
    mocks.measureFindMany.mockResolvedValue([]);
  });

  // A batch busts `election-measures` once per revision: carrying it would regenerate every
  // measure page on every visit, each regeneration billed as an ISR write.
  it("une mesure trouvée porte son propre tag, jamais celui de toute l'élection", async () => {
    mocks.measureFindFirst.mockResolvedValue(publishedRow);

    const detail = await getPublicPresidentialMeasureDetail("presidentielle-2027", "une-mesure");

    expect(detail?.id).toBe("measure-1");
    expect(tags()).toContain("measure:measure-1");
    expect(tags()).toContain("candidacy-measure-visibility:candidacy-1");
    expect(tags()).toContain("election-candidacies:election-1");
    expect(tags()).not.toContain("election-measures:election-1");
  });

  it("invalide les fiches liées lors d'un retrait uniquement", async () => {
    mocks.measureFindFirst.mockResolvedValue(publishedRow);
    mocks.measureFindMany.mockResolvedValue([
      {
        slug: "une-mesure-liee",
        publishedRevision: { text: "Une mesure liée", subtopics: [] },
        candidacy: {
          id: "candidacy-2",
          candidateName: "Autre Personne",
          party: null,
          politician: { slug: "autre-personne" },
        },
      },
    ]);
    await getPublicPresidentialMeasureDetail("presidentielle-2027", "une-mesure");

    invalidateMeasureTags("measure-2", "election-1");
    invalidateMeasureTags("measure-2", "election-1", {
      visibilityReduced: true,
      candidacyId: "candidacy-2",
    });

    const publicationTags = ["measure:measure-2", "election-measures:election-1"];
    const removalTag = "candidacy-measure-visibility:candidacy-2";
    expect(tags()).toContain(removalTag);
    expect(mocks.revalidateTags).toHaveBeenNthCalledWith(1, publicationTags, undefined);
    expect(mocks.revalidateTags).toHaveBeenNthCalledWith(2, [...publicationTags, removalTag], {
      expire: 0,
    });
  });

  it("une mesure introuvable reste invalidée par toute publication de l'élection", async () => {
    mocks.measureFindFirst.mockResolvedValue(null);

    const detail = await getPublicPresidentialMeasureDetail("presidentielle-2027", "inconnue");

    expect(detail).toBeNull();
    expect(tags()).toContain("election-measures:election-1");
  });
});
