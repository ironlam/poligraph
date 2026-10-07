import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { programEdition: { findMany: findManyMock } },
}));

import { queryBatchReviewGroups } from "../batch-review-query";

describe("queryBatchReviewGroups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sérialise un lot de brouillons actifs", async () => {
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

    await expect(queryBatchReviewGroups()).resolves.toEqual([
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
            text: "Créer un service public du logement.",
            details: null,
            previousText: null,
          },
        ],
        hasMore: false,
      },
    ]);
  });

  it("demande les premières publications et les contextes v9 non relus", async () => {
    findManyMock.mockResolvedValue([]);

    await queryBatchReviewGroups();

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
                  reviewedAt: null,
                }),
              },
            }),
          },
        }),
      })
    );
  });

  it("inclut une correction de contexte sans changement de formulation", async () => {
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

    const [group] = await queryBatchReviewGroups();

    expect(group?.items).toEqual([
      expect.objectContaining({
        revisionId: "revision-context",
        details: "La mesure prévoit une gestion publique des logements concernés.",
      }),
    ]);
  });

  it("exclut de l'interface une correction de contexte incohérente", async () => {
    // Only the context query returns the row: the text-correction query filters on MANUAL in the
    // database, which this mock does not evaluate.
    findManyMock.mockResolvedValue([]);
    findManyMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
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
            publicationStatus: "PUBLISHED",
            publishedRevision: { text: "Texte public" },
            latestRevision: {
              id: "revision-context",
              text: "Texte modifié",
              details: "Contexte",
            },
          },
        ],
      },
    ]);

    await expect(queryBatchReviewGroups()).resolves.toEqual([]);
  });

  it("borne le lot à la candidature sélectionnée", async () => {
    findManyMock.mockResolvedValue([]);

    await queryBatchReviewGroups({ candidacyId: "candidature-1" });

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

  it("propose une correction de formulation manuelle avec le texte qu'elle remplace", async () => {
    findManyMock.mockResolvedValue([]);
    findManyMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
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
              publicationStatus: "PUBLISHED",
              publishedRevision: { text: "Texte public avec une note interne." },
              latestRevision: {
                id: "revision-correction",
                text: "Texte public corrigé.",
                details: null,
              },
            },
          ],
        },
      ]);

    const [group] = await queryBatchReviewGroups();

    expect(group).toEqual(
      expect.objectContaining({
        batchKind: "TEXT_CORRECTION",
        groupKey: "edition-1:TEXT_CORRECTION",
      })
    );
    expect(group?.items).toEqual([
      {
        batchKind: "TEXT_CORRECTION",
        measureId: "measure-1",
        revisionId: "revision-correction",
        text: "Texte public corrigé.",
        details: null,
        previousText: "Texte public avec une note interne.",
      },
    ]);
    expect(findManyMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.objectContaining({
          measures: {
            some: expect.objectContaining({
              publicationStatus: "PUBLISHED",
              latestRevision: {
                is: expect.objectContaining({ extractionMethod: "MANUAL", reviewedAt: null }),
              },
            }),
          },
        }),
      })
    );
  });

  it("n'inclut pas comme correction de formulation un brouillon au texte identique", async () => {
    findManyMock.mockResolvedValue([]);
    findManyMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
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
              publicationStatus: "PUBLISHED",
              publishedRevision: { text: "Texte public avec une note interne." },
              latestRevision: {
                id: "revision-correction",
                text: "Texte public avec une note interne.",
                details: null,
              },
            },
          ],
        },
      ]);

    await expect(queryBatchReviewGroups()).resolves.toEqual([]);
  });
});
