import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { programEdition: { findMany: findManyMock } },
}));

import { queryBatchPublishGroups } from "../batch-publish-query";

describe("queryBatchPublishGroups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sérialise un lot relu avec sa version optimiste", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "edition-1",
        label: "Cahier 1",
        version: 1,
        candidacy: { candidateName: "Candidate Exemple" },
        party: null,
        election: { title: "Élection présidentielle de 2027" },
        measures: [
          {
            id: "measure-1",
            updatedAt: new Date("2027-01-16T10:00:00.000Z"),
            latestRevision: { id: "revision-1", text: "Créer un service public du logement." },
          },
        ],
      },
    ]);

    await expect(queryBatchPublishGroups()).resolves.toEqual([
      {
        programEditionId: "edition-1",
        editionLabel: "Cahier 1",
        editionVersion: 1,
        ownerLabel: "Candidate Exemple",
        electionTitle: "Élection présidentielle de 2027",
        items: [
          {
            measureId: "measure-1",
            revisionId: "revision-1",
            expectedUpdatedAt: "2027-01-16T10:00:00.000Z",
            text: "Créer un service public du logement.",
          },
        ],
        hasMore: false,
      },
    ]);
  });

  it("demande uniquement les premières publications relues et sourcées", async () => {
    findManyMock.mockResolvedValue([]);

    await queryBatchPublishGroups();

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          measures: {
            some: expect.objectContaining({
              publicationStatus: "DRAFT",
              publishedRevisionId: null,
              latestRevision: {
                is: expect.objectContaining({
                  reviewedAt: { not: null },
                  sources: { some: {} },
                }),
              },
            }),
          },
        },
      })
    );
  });
});
