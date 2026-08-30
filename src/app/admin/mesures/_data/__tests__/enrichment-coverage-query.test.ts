import { beforeEach, describe, expect, it, vi } from "vitest";

const { measureCountMock, revisionCountMock } = vi.hoisted(() => ({
  measureCountMock: vi.fn(),
  revisionCountMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    measure: { count: measureCountMock },
    measureRevision: { count: revisionCountMock },
  },
}));

import { queryMeasureEnrichmentCoverage } from "../enrichment-coverage-query";

describe("queryMeasureEnrichmentCoverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retourne les sept compteurs exacts du corpus public", async () => {
    measureCountMock
      .mockResolvedValueOnce(2200)
      .mockResolvedValueOnce(98)
      .mockResolvedValueOnce(982)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(1277)
      .mockResolvedValueOnce(4);
    revisionCountMock.mockResolvedValueOnce(8);

    await expect(queryMeasureEnrichmentCoverage()).resolves.toEqual({
      total: 2200,
      withDetails: 98,
      withApprovedSubtopics: 982,
      withQualifications: 12,
      withVoteLinks: 8,
      withSourceLocation: 1277,
      withHistory: 4,
    });

    expect(measureCountMock).toHaveBeenCalledTimes(6);
    expect(revisionCountMock).toHaveBeenCalledOnce();
    for (const [request] of measureCountMock.mock.calls) {
      expect(request.where).toEqual(
        expect.objectContaining({
          election: { slug: "presidentielle-2027" },
          publicationStatus: "PUBLISHED",
          withdrawnAt: null,
        })
      );
    }
  });

  it("compte uniquement les sous-thèmes validés et actifs", async () => {
    measureCountMock.mockResolvedValue(0);
    revisionCountMock.mockResolvedValue(0);

    await queryMeasureEnrichmentCoverage();

    expect(measureCountMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.objectContaining({
          publishedRevision: {
            is: expect.objectContaining({
              subtopics: {
                some: { status: "APPROVED", subtopic: { active: true } },
              },
            }),
          },
        }),
      })
    );
  });

  it("compte uniquement les votes applicables à la révision publiée", async () => {
    measureCountMock.mockResolvedValue(0);
    revisionCountMock.mockResolvedValue(0);

    await queryMeasureEnrichmentCoverage();

    expect(revisionCountMock).toHaveBeenCalledWith({
      where: {
        publishedOf: {
          is: expect.objectContaining({
            election: { slug: "presidentielle-2027" },
            publicationStatus: "PUBLISHED",
          }),
        },
        applicableVoteLinks: { some: {} },
      },
    });
  });
});
