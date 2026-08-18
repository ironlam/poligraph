import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  articleFindMany: vi.fn(),
  articleCount: vi.fn(),
  articleGroupBy: vi.fn(),
  politicianMentionCount: vi.fn(),
  partyMentionCount: vi.fn(),
  partyFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    pressArticle: {
      findMany: mocks.articleFindMany,
      count: mocks.articleCount,
      groupBy: mocks.articleGroupBy,
    },
    pressArticleMention: { count: mocks.politicianMentionCount },
    pressArticlePartyMention: { count: mocks.partyMentionCount },
    party: { findMany: mocks.partyFindMany },
  },
}));

import { getPartiesWithPressMentions, getPressStats, searchPress } from "./press";

function hasPublicPolitician(value: unknown): boolean {
  return JSON.stringify(value).includes('"politician":{"publicationStatus":"PUBLISHED"}');
}

function hasPublicParty(value: unknown): boolean {
  return JSON.stringify(value).includes(
    '"party":{"politicians":{"some":{"publicationStatus":"PUBLISHED"}}}'
  );
}

describe("presse, frontières publiques", () => {
  beforeEach(() => vi.clearAllMocks());

  it("écarte un article lié seulement à des entités non publiques et nettoie ses mentions", async () => {
    mocks.articleFindMany.mockImplementation(async (args: unknown) => {
      const publicSelection = hasPublicPolitician(args) && hasPublicParty(args);
      const publicArticle = {
        id: "article-public",
        title: "Article public",
        mentions: [
          {
            id: "mention-public",
            politician: { slug: "alice-publique", fullName: "Alice Publique" },
          },
        ],
        partyMentions: [
          {
            id: "party-mention-public",
            party: { slug: "parti-public", name: "Parti public", shortName: "PP" },
          },
        ],
        _count: { mentions: 1 },
      };
      const internalArticle = {
        id: "article-interne",
        title: "Article lié seulement au parti DRAFT",
        mentions: [],
        partyMentions: [
          {
            id: "party-mention-draft",
            party: { slug: "parti-draft", name: "Parti DRAFT", shortName: "PD" },
          },
        ],
        _count: { mentions: 0 },
      };
      return (publicSelection ? [publicArticle] : [publicArticle, internalArticle]) as never;
    });
    mocks.articleCount.mockImplementation(async (args: unknown) =>
      hasPublicPolitician(args) && hasPublicParty(args) ? 1 : 2
    );

    const result = await searchPress({
      page: 1,
      limit: 20,
      partyId: "party-public",
      search: "Article",
    });

    expect(result).toMatchObject({ total: 1, totalPages: 1 });
    expect(result.articles).toEqual([
      expect.objectContaining({
        id: "article-public",
        title: "Article public",
        _count: { mentions: 1 },
        mentions: [
          expect.objectContaining({
            politician: { slug: "alice-publique", fullName: "Alice Publique" },
          }),
        ],
        partyMentions: [
          expect.objectContaining({
            party: { slug: "parti-public", name: "Parti public", shortName: "PP" },
          }),
        ],
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("article-interne");
    expect(JSON.stringify(result)).not.toContain("parti-draft");
    expect(JSON.stringify(result)).not.toContain("Parti DRAFT");
  });

  it("exclut les mentions non publiques de tous les agrégats", async () => {
    mocks.articleCount.mockImplementation(async (args: unknown) =>
      hasPublicPolitician(args) && hasPublicParty(args) ? 6 : 8
    );
    mocks.articleGroupBy.mockImplementation(async (args: unknown) =>
      hasPublicPolitician(args) && hasPublicParty(args)
        ? [{ feedSource: "lemonde", _count: 6 }]
        : [
            { feedSource: "lemonde", _count: 6 },
            { feedSource: "interne", _count: 2 },
          ]
    );
    mocks.politicianMentionCount.mockImplementation(async (args: unknown) =>
      hasPublicPolitician(args) ? 7 : 11
    );
    mocks.partyMentionCount.mockImplementation(async (args: unknown) =>
      hasPublicParty(args) ? 5 : 13
    );

    const stats = await getPressStats();

    expect(stats).toEqual({
      totalArticles: 6,
      bySource: { lemonde: 6 },
      totalMentions: 7,
      totalPartyMentions: 5,
    });
    expect(stats.bySource).not.toHaveProperty("interne");
  });

  it("ne propose aucun parti de filtre sans personnalité publiée", async () => {
    mocks.partyFindMany.mockImplementation(async (args: unknown) => {
      const publicOnly = JSON.stringify(args).includes(
        '"politicians":{"some":{"publicationStatus":"PUBLISHED"}}'
      );
      return (
        publicOnly
          ? [{ id: "party-public", name: "Parti public", shortName: "PP" }]
          : [
              { id: "party-public", name: "Parti public", shortName: "PP" },
              { id: "party-draft", name: "Parti DRAFT", shortName: "PD" },
            ]
      ) as never;
    });

    const parties = await getPartiesWithPressMentions();

    expect(parties).toEqual([
      expect.objectContaining({ id: "party-public", name: "Parti public" }),
    ]);
    expect(JSON.stringify(parties)).not.toContain("party-draft");
  });

  it("normalise relevance vers l'ordre récent sans dépendre d'un _count non filtré", async () => {
    const articleRecent = {
      id: "article-a",
      title: "Article A récent",
      publishedAt: new Date("2026-08-18T10:00:00.000Z"),
      mentions: [],
      partyMentions: [],
      _count: { mentions: 0 },
    };
    const articleWithDraftMentions = {
      id: "article-b",
      title: "Article B avec cinq mentions DRAFT",
      publishedAt: new Date("2026-08-17T10:00:00.000Z"),
      mentions: [],
      partyMentions: [],
      _count: { mentions: 0 },
    };

    mocks.articleFindMany.mockImplementation(async (args: { orderBy?: unknown }) => {
      const usesUnfilteredCount = JSON.stringify(args.orderBy).includes("_count");
      return (
        usesUnfilteredCount
          ? [articleWithDraftMentions, articleRecent]
          : [articleRecent, articleWithDraftMentions]
      ) as never;
    });
    mocks.articleCount.mockResolvedValue(2);

    const result = await searchPress({
      page: 1,
      limit: 20,
      sort: "relevance",
    });

    expect(result.articles.map((article) => article.id)).toEqual(["article-a", "article-b"]);
    expect(mocks.articleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      })
    );
    expect(JSON.stringify(mocks.articleFindMany.mock.calls[0]?.[0]?.orderBy)).not.toContain(
      "_count"
    );
  });

  it("conserve l'ordre récent public et son départage déterministe", async () => {
    mocks.articleFindMany.mockResolvedValue([]);
    mocks.articleCount.mockResolvedValue(0);

    await searchPress({ page: 1, limit: 20, sort: "recent" });

    expect(mocks.articleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      })
    );
  });
});
