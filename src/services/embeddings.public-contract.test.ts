import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    chatEmbedding: { findMany: vi.fn(), upsert: vi.fn() },
    affair: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    politician: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    factCheck: { findMany: vi.fn(), count: vi.fn() },
    mandate: { groupBy: vi.fn() },
    party: { count: vi.fn() },
    legislativeDossier: { count: vi.fn() },
    pressArticle: { count: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("voyageai", () => ({
  VoyageAIClient: class {
    async embed() {
      return { data: [{ embedding: [1, 0] }] };
    }
  },
}));

import {
  indexAffair,
  indexAllOfType,
  indexGlobalStats,
  indexPolitician,
  searchSimilar,
} from "@/services/embeddings";

const PUBLISHED = "PUBLISHED";

function embedding(entityType: string, entityId: string) {
  return { entityType, entityId, content: entityId, embedding: [1, 0], metadata: null };
}

describe("le RAG du chat ne sert que du contenu publié", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VOYAGE_API_KEY = "test";
    mocks.db.affair.findMany.mockResolvedValue([]);
    mocks.db.politician.findMany.mockResolvedValue([]);
    mocks.db.factCheck.findMany.mockResolvedValue([]);
  });

  it("écarte à la recherche les affaires, fiches et fact-checks non publics déjà indexés", async () => {
    mocks.db.chatEmbedding.findMany.mockResolvedValue([
      embedding("AFFAIR", "affaire-publiee"),
      embedding("AFFAIR", "affaire-brouillon"),
      embedding("POLITICIAN", "fiche-brouillon"),
      embedding("FACTCHECK", "factcheck-non-public"),
      embedding("DOSSIER", "dossier"),
    ]);
    mocks.db.affair.findMany.mockResolvedValue([{ id: "affaire-publiee" }]);

    const results = await searchSimilar({ query: "affaire", limit: 10, threshold: 0.5 });

    expect(results.map((r) => r.entityId).sort()).toEqual(["affaire-publiee", "dossier"]);
    expect(mocks.db.affair.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["affaire-publiee", "affaire-brouillon"] },
          publicationStatus: PUBLISHED,
          politician: { publicationStatus: PUBLISHED },
        }),
      })
    );
  });

  it.each([
    [
      "AFFAIR",
      "affair",
      { publicationStatus: PUBLISHED, politician: { publicationStatus: PUBLISHED } },
    ],
    ["POLITICIAN", "politician", { publicationStatus: PUBLISHED }],
    ["FACTCHECK", "factCheck", { publicationStatus: PUBLISHED }],
  ] as const)(
    "n'indexe en masse que les entités %s publiques",
    async (entityType, model, expectedWhere) => {
      await indexAllOfType(entityType);

      expect(mocks.db[model].findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining(expectedWhere) })
      );
    }
  );

  it("n'indexe pas une affaire en brouillon", async () => {
    const draft = {
      id: "affaire-brouillon",
      title: "Brouillon",
      slug: "brouillon",
      description: "",
      publicationStatus: "DRAFT",
      politician: { fullName: "X", slug: "x" },
      partyAtTime: null,
      verdictDate: null,
      sources: [],
    };
    mocks.db.affair.findUnique.mockResolvedValue(draft);
    mocks.db.affair.findFirst.mockResolvedValue(null);

    await indexAffair("affaire-brouillon");

    expect(mocks.db.chatEmbedding.upsert).not.toHaveBeenCalled();
  });

  it("n'indexe pas une fiche non publiée", async () => {
    const draft = {
      id: "fiche-brouillon",
      fullName: "X",
      slug: "x",
      civility: null,
      birthDate: null,
      currentParty: null,
      currentPartyId: null,
      publicationStatus: "DRAFT",
      mandates: [],
      affairs: [],
    };
    mocks.db.politician.findUnique.mockResolvedValue(draft);
    mocks.db.politician.findFirst.mockResolvedValue(null);

    await indexPolitician("fiche-brouillon");

    expect(mocks.db.chatEmbedding.upsert).not.toHaveBeenCalled();
  });

  it("ne compte que les affaires et fact-checks publics dans les statistiques globales", async () => {
    mocks.db.mandate.groupBy.mockResolvedValue([]);
    mocks.db.party.count.mockResolvedValue(0);
    mocks.db.legislativeDossier.count.mockResolvedValue(0);
    mocks.db.pressArticle.count.mockResolvedValue(0);
    const isPublic = (args?: { where?: { publicationStatus?: string } }) =>
      args?.where?.publicationStatus === PUBLISHED;
    mocks.db.affair.count.mockImplementation(async (args) => (isPublic(args) ? 3 : 10));
    mocks.db.factCheck.count.mockImplementation(async (args) => (isPublic(args) ? 2 : 7));

    await indexGlobalStats();

    const content = mocks.db.chatEmbedding.upsert.mock.calls[0]?.[0]?.create?.content as string;
    expect(content).toContain("Affaires judiciaires : 3 (dont 3 condamnations définitives)");
    expect(content).toContain("Fact-checks : 2 articles");
  });
});
