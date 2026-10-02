import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    chatEmbedding: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    affair: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    politician: { findMany: vi.fn(), findFirst: vi.fn() },
    factCheck: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    party: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    pressArticle: { findUnique: vi.fn(), count: vi.fn() },
    mandate: { groupBy: vi.fn() },
    legislativeDossier: { count: vi.fn() },
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
  indexParty,
  indexPolitician,
  indexPressArticle,
  searchSimilar,
} from "@/services/embeddings";

const PUBLISHED = "PUBLISHED";

type Where = Record<string, unknown> | undefined;

/** True only when the where clause carries the politician publication gate. */
function gatesPolitician(where: Where): boolean {
  const politician = where?.politician as Where;
  return politician?.publicationStatus === PUBLISHED;
}

function gatesPublication(where: Where): boolean {
  return where?.publicationStatus === PUBLISHED;
}

function embedding(entityType: string, entityId: string) {
  return { entityType, entityId, content: entityId, embedding: [1, 0], metadata: null };
}

function upsertedContent(): string {
  return mocks.db.chatEmbedding.upsert.mock.calls[0]?.[0]?.create?.content as string;
}

const draftMention = { politician: { fullName: "Fiche Brouillon", slug: "fiche-brouillon" } };
const publicMention = { politician: { fullName: "Fiche Publique", slug: "fiche-publique" } };

describe("le RAG du chat ne sert que du contenu publié", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VOYAGE_API_KEY = "test";
    for (const model of ["affair", "politician", "factCheck", "party"] as const) {
      mocks.db[model].findMany.mockResolvedValue([]);
      mocks.db[model].findFirst.mockResolvedValue(null);
    }
    mocks.db.chatEmbedding.findMany.mockResolvedValue([]);
    mocks.db.chatEmbedding.deleteMany.mockResolvedValue({ count: 0 });
  });

  describe("recherche", () => {
    it("écarte les affaires, fiches et fact-checks non publics déjà indexés", async () => {
      mocks.db.chatEmbedding.findMany.mockResolvedValue([
        embedding("AFFAIR", "affaire-publiee"),
        embedding("AFFAIR", "affaire-brouillon"),
        embedding("POLITICIAN", "fiche-brouillon"),
        embedding("FACTCHECK", "factcheck-non-public"),
        embedding("PARTY", "parti-interne"),
        embedding("DOSSIER", "dossier"),
      ]);
      mocks.db.affair.findMany.mockImplementation(async ({ where }) =>
        gatesPublication(where) && gatesPolitician(where) ? [{ id: "affaire-publiee" }] : []
      );

      const results = await searchSimilar({ query: "affaire", limit: 10, threshold: 0.5 });

      expect(results.map((r) => r.entityId).sort()).toEqual(["affaire-publiee", "dossier"]);
    });

    it("ne vérifie en base qu'une fenêtre bornée de candidats", async () => {
      mocks.db.chatEmbedding.findMany.mockResolvedValue(
        Array.from({ length: 50 }, (_, i) => embedding("AFFAIR", `affaire-${i}`))
      );
      mocks.db.affair.findMany.mockImplementation(async ({ where }) =>
        (where.id.in as string[]).map((id) => ({ id }))
      );

      const results = await searchSimilar({ query: "affaire", limit: 2, threshold: 0.5 });

      expect(results).toHaveLength(2);
      const checkedIds = mocks.db.affair.findMany.mock.calls[0]?.[0]?.where?.id?.in as string[];
      expect(checkedIds.length).toBeLessThanOrEqual(8);
    });
  });

  describe("indexation unitaire", () => {
    it("retire l'embedding d'une affaire qui n'est plus publique", async () => {
      // Simulates the database: the draft is only found when the public gate is absent.
      mocks.db.affair.findFirst.mockImplementation(async ({ where }) =>
        gatesPublication(where) && gatesPolitician(where) ? null : { id: "affaire-brouillon" }
      );

      await indexAffair("affaire-brouillon");

      expect(mocks.db.chatEmbedding.upsert).not.toHaveBeenCalled();
      expect(mocks.db.chatEmbedding.deleteMany).toHaveBeenCalledWith({
        where: { entityType: "AFFAIR", entityId: "affaire-brouillon" },
      });
    });

    it("retire l'embedding d'une fiche qui n'est plus publique", async () => {
      mocks.db.politician.findFirst.mockImplementation(async ({ where }) =>
        gatesPublication(where) ? null : { id: "fiche-brouillon" }
      );

      await indexPolitician("fiche-brouillon");

      expect(mocks.db.chatEmbedding.upsert).not.toHaveBeenCalled();
      expect(mocks.db.chatEmbedding.deleteMany).toHaveBeenCalledWith({
        where: { entityType: "POLITICIAN", entityId: "fiche-brouillon" },
      });
    });

    it("retire l'embedding d'un parti sans membre public", async () => {
      mocks.db.party.findFirst.mockImplementation(async ({ where }) =>
        where?.politicians ? null : { id: "parti-interne" }
      );

      await indexParty("parti-interne");

      expect(mocks.db.chatEmbedding.upsert).not.toHaveBeenCalled();
      expect(mocks.db.chatEmbedding.deleteMany).toHaveBeenCalledWith({
        where: { entityType: "PARTY", entityId: "parti-interne" },
      });
    });

    it("n'écrit plus de compte d'affaires dans l'embedding d'une fiche", async () => {
      mocks.db.politician.findFirst.mockResolvedValue({
        id: "fiche-publique",
        fullName: "Fiche Publique",
        slug: "fiche-publique",
        civility: null,
        birthDate: null,
        currentParty: null,
        currentPartyId: null,
        mandates: [],
        affairs: [{ id: "affaire" }],
      });

      await indexPolitician("fiche-publique");

      expect(upsertedContent()).not.toMatch(/affaire/i);
      const metadata = mocks.db.chatEmbedding.upsert.mock.calls[0]?.[0]?.create?.metadata;
      expect(metadata).not.toHaveProperty("hasAffairs");
    });

    it("ne nomme dans un article de presse que les élus et partis publics", async () => {
      mocks.db.pressArticle.findUnique.mockImplementation(async ({ include }) => ({
        id: "article",
        title: "Article",
        feedSource: "lemonde",
        url: "https://example.org",
        publishedAt: new Date("2026-01-01"),
        aiSummary: null,
        description: null,
        mentions: gatesPolitician(include.mentions.where)
          ? [publicMention]
          : [publicMention, draftMention],
        partyMentions: include.partyMentions.where?.party
          ? []
          : [{ party: { name: "Parti interne", shortName: "PI", slug: "pi" } }],
      }));

      await indexPressArticle("article");

      const content = upsertedContent();
      expect(content).toContain("Fiche Publique");
      expect(content).not.toContain("Fiche Brouillon");
      expect(content).not.toContain("Parti interne");
    });
  });

  describe("indexation en masse", () => {
    it.each([
      ["AFFAIR", "affair"],
      ["POLITICIAN", "politician"],
      ["FACTCHECK", "factCheck"],
      ["PARTY", "party"],
    ] as const)("ne sélectionne que les entités %s publiques", async (entityType, model) => {
      await indexAllOfType(entityType);

      const where = mocks.db[model].findMany.mock.calls[0]?.[0]?.where as Where;
      const isGated =
        model === "affair"
          ? gatesPublication(where) && gatesPolitician(where)
          : model === "party"
            ? Boolean(where?.politicians)
            : gatesPublication(where);
      expect(isGated).toBe(true);
    });

    it("supprime les embeddings dont l'entité n'est plus publique, sans toucher aux statistiques globales", async () => {
      mocks.db.chatEmbedding.findMany.mockResolvedValue([
        { entityId: "parti-public", updatedAt: new Date() },
        { entityId: "parti-interne", updatedAt: new Date() },
        { entityId: "global-stats", updatedAt: new Date() },
      ]);
      mocks.db.party.findMany.mockResolvedValue([]);
      mocks.db.party.findMany.mockImplementation(async ({ where }) =>
        where?.politicians ? [{ id: "parti-public", updatedAt: new Date(0) }] : []
      );

      await indexAllOfType("PARTY", { deltaOnly: true });

      expect(mocks.db.chatEmbedding.deleteMany).toHaveBeenCalledWith({
        where: { entityType: "PARTY", entityId: { in: ["parti-interne"] } },
      });
    });

    it("ne supprime rien quand la sélection est tronquée par limit", async () => {
      mocks.db.chatEmbedding.findMany.mockResolvedValue([
        { entityId: "affaire-hors-lot", updatedAt: new Date() },
      ]);

      await indexAllOfType("AFFAIR", { limit: 1 });

      expect(mocks.db.chatEmbedding.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("statistiques globales", () => {
    it("ne compte que les entités publiques", async () => {
      mocks.db.mandate.groupBy.mockImplementation(async ({ where }) => [
        { type: "DEPUTE", _count: gatesPolitician(where) ? 5 : 9 },
      ]);
      mocks.db.party.count.mockImplementation(async (args) => (args?.where?.politicians ? 4 : 8));
      mocks.db.affair.count.mockImplementation(async ({ where }) =>
        gatesPublication(where) && gatesPolitician(where) ? 3 : 10
      );
      mocks.db.factCheck.count.mockImplementation(async (args) =>
        gatesPublication(args?.where) ? 2 : 7
      );
      mocks.db.legislativeDossier.count.mockResolvedValue(0);
      mocks.db.pressArticle.count.mockResolvedValue(0);

      await indexGlobalStats();

      const content = upsertedContent();
      expect(content).toContain("Il y a 5 députés");
      expect(content).toContain("Partis politiques référencés : 4");
      expect(content).toContain("Affaires judiciaires : 3 (dont 3 condamnations définitives)");
      expect(content).toContain("Fact-checks : 2 articles");
    });
  });
});
