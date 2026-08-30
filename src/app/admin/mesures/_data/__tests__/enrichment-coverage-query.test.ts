import { beforeEach, describe, expect, it, vi } from "vitest";

const { countMock } = vi.hoisted(() => ({ countMock: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { measure: { count: countMock } },
}));

import { queryMeasureEnrichmentCoverage } from "../enrichment-coverage-query";

describe("queryMeasureEnrichmentCoverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retourne les sept compteurs exacts du corpus public", async () => {
    countMock
      .mockResolvedValueOnce(2200)
      .mockResolvedValueOnce(98)
      .mockResolvedValueOnce(982)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(1277)
      .mockResolvedValueOnce(4);

    await expect(queryMeasureEnrichmentCoverage()).resolves.toEqual({
      total: 2200,
      withDetails: 98,
      withApprovedSubtopics: 982,
      withQualifications: 12,
      withVoteLinks: 8,
      withSourceLocation: 1277,
      withHistory: 4,
    });

    expect(countMock).toHaveBeenCalledTimes(7);
    for (const [request] of countMock.mock.calls) {
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
    countMock.mockResolvedValue(0);

    await queryMeasureEnrichmentCoverage();

    expect(countMock).toHaveBeenNthCalledWith(
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
});
