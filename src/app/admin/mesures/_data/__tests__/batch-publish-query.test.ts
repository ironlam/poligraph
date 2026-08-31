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
            publicationStatus: "DRAFT",
            publishedRevision: null,
            latestRevision: {
              id: "revision-1",
              text: "Créer un service public du logement.",
              details: null,
            },
          },
        ],
      },
    ]);

    await expect(queryBatchPublishGroups()).resolves.toEqual([
      {
        batchKind: "FIRST_PUBLICATION",
        programEditionId: "edition-1",
        groupKey: "edition-1:FIRST_PUBLICATION",
        editionLabel: "Cahier 1",
        editionVersion: 1,
        ownerLabel: "Candidate Exemple",
        electionTitle: "Élection présidentielle de 2027",
        items: [
          {
            batchKind: "FIRST_PUBLICATION",
            measureId: "measure-1",
            revisionId: "revision-1",
            expectedUpdatedAt: "2027-01-16T10:00:00.000Z",
            text: "Créer un service public du logement.",
            details: null,
          },
        ],
        hasMore: false,
      },
    ]);
  });

  it("demande les premières publications et les contextes v9 relus", async () => {
    findManyMock.mockResolvedValue([]);

    await queryBatchPublishGroups();

    expect(findManyMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          measures: {
            some: expect.objectContaining({
              publicationStatus: "PUBLISHED",
              latestRevision: {
                is: expect.objectContaining({
                  extractorVersion: { endsWith: ":measure-context-v9" },
                  reviewedAt: { not: null },
                }),
              },
            }),
          },
        }),
      })
    );
  });

  it("inclut une correction de contexte relue sans changement de formulation", async () => {
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
            publicationStatus: "PUBLISHED",
            publishedRevision: { text: "Créer un service public du logement." },
            latestRevision: {
              id: "revision-context",
              text: "Créer un service public du logement.",
              details: "La mesure prévoit une gestion publique des logements concernés.",
            },
          },
        ],
      },
    ]);

    const [group] = await queryBatchPublishGroups();

    expect(group?.items).toEqual([
      expect.objectContaining({
        revisionId: "revision-context",
        details: "La mesure prévoit une gestion publique des logements concernés.",
      }),
    ]);
  });

  it("borne le lot à la candidature sélectionnée", async () => {
    findManyMock.mockResolvedValue([]);

    await queryBatchPublishGroups({ candidacyId: "candidature-1" });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          candidacyId: "candidature-1",
          measures: {
            some: expect.objectContaining({ candidacyId: "candidature-1" }),
          },
        },
        select: expect.objectContaining({
          measures: expect.objectContaining({
            where: expect.objectContaining({ candidacyId: "candidature-1" }),
          }),
        }),
      })
    );
  });
});
