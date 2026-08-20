import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  db: {
    pressArticle: { findUnique: vi.fn() },
    affair: { findUnique: vi.fn(), findMany: vi.fn() },
    pressArticleAffair: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
    source: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  titleMatch: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/services/affairs/matching", () => ({
  titlesShareVocabulary: h.titleMatch,
  significantTitleWords: (value: string) => new Set(value.toLowerCase().split(/\\s+/)),
}));

import {
  getArticleWorkbench,
  hashArticleRelations,
  mutateArticleAffairRelation,
  RelationshipConflictError,
} from "@/services/admin/article-affair-workbench";

const article = {
  id: "article-1",
  title: "Une affaire révélée",
  description: "Résumé",
  aiSummary: null,
  url: "https://example.test/article",
  feedSource: "example",
  publishedAt: new Date("2026-01-01"),
  aiAnalyzedAt: new Date("2026-01-02"),
  isAffairRelated: true,
  createdAt: new Date("2026-01-01"),
  _count: { mentions: 2, affairLinks: 0 },
  mentions: [
    {
      politician: { id: "pol-1", fullName: "Jeanne Test", slug: "jeanne-test" },
      matchedName: null,
    },
  ],
  affairLinks: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.titleMatch.mockReturnValue(false);
});

describe("article-affair workbench", () => {
  it("hashes relation snapshots independently of database order", () => {
    const first = hashArticleRelations([
      { id: "b", affairId: "aff-2", role: "MENTION" },
      { id: "a", affairId: "aff-1", role: "UPDATE" },
    ] as never);
    const second = hashArticleRelations([
      { id: "a", affairId: "aff-1", role: "UPDATE" },
      { id: "b", affairId: "aff-2", role: "MENTION" },
    ] as never);
    expect(first).toBe(second);
  });

  it("returns all current links and only explicable suggestions", async () => {
    h.db.pressArticle.findUnique.mockResolvedValue(article);
    h.db.affair.findMany.mockResolvedValue([
      {
        id: "aff-1",
        title: "Affaire de Jeanne Test",
        slug: "affaire-jeanne-test",
        publicationStatus: "DRAFT",
        politician: { id: "pol-1", fullName: "Jeanne Test", slug: "jeanne-test" },
        sources: [],
      },
    ]);
    const result = await getArticleWorkbench("article-1");
    expect(result?.suggestions[0]?.reasons).toEqual(["même personnalité mentionnée"]);
    expect(result?.affairLinks).toHaveLength(0);
  });

  it("links idempotently and creates the optional press source in one transaction", async () => {
    const tx = {
      pressArticle: {
        findUnique: vi.fn().mockResolvedValue({
          title: "Titre",
          url: "https://x",
          feedSource: "AFP",
          publishedAt: new Date(),
        }),
      },
      affair: { findUnique: vi.fn().mockResolvedValue({ id: "aff-1" }) },
      pressArticleAffair: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "rel-1" }),
      },
      source: { upsert: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    h.db.$transaction.mockImplementation(
      async (callback: (value: typeof tx) => Promise<unknown>) => {
        tx.pressArticle.findUnique.mockResolvedValueOnce({
          createdAt: new Date("2026-01-01"),
          affairLinks: [],
        });
        return callback(tx);
      }
    );
    await mutateArticleAffairRelation({
      operation: "LINK",
      articleId: "article-1",
      affairId: "aff-1",
      role: "REVELATION",
      addSource: true,
      justification: "La source et le contenu établissent clairement cette affaire.",
      expected: {
        articleVersion: new Date("2026-01-01").toISOString(),
        relationsHash: hashArticleRelations([]),
      },
    });
    expect(tx.pressArticleAffair.create).toHaveBeenCalledWith({
      data: { articleId: "article-1", affairId: "aff-1", role: "REVELATION" },
    });
    expect(tx.source.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { affairId_url: { affairId: "aff-1", url: "https://x" } } })
    );
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
  });

  it("refuses a stale relation snapshot before a mutation", async () => {
    const tx = {
      pressArticle: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ createdAt: new Date("2026-01-03"), affairLinks: [] }),
      },
    };
    h.db.$transaction.mockImplementation(async (callback: (value: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );
    await expect(
      mutateArticleAffairRelation({
        operation: "REMOVE",
        articleId: "article-1",
        oldAffairId: "aff-1",
        justification: "La liaison doit être retirée après vérification éditoriale.",
        expected: {
          articleVersion: new Date("2026-01-01").toISOString(),
          relationsHash: hashArticleRelations([]),
        },
      })
    ).rejects.toBeInstanceOf(RelationshipConflictError);
  });
});
