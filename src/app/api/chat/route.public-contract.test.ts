import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  streamText: vi.fn(),
  searchSimilar: vi.fn(),
  rerankResults: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: mocks.queryRaw } }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn(() => "mock-model") }));
vi.mock("ai", () => ({ streamText: mocks.streamText }));
vi.mock("@/services/embeddings", () => ({
  searchSimilar: mocks.searchSimilar,
  rerankResults: mocks.rerankResults,
}));
vi.mock("@/services/chat/patterns", () => ({ matchPattern: vi.fn(async () => null) }));
vi.mock("@/services/chat/keywords", () => ({
  searchDatabaseByKeywords: vi.fn(async () => null),
}));

import { POST } from "@/app/api/chat/route";

function rawSqlText(call: unknown[]): string {
  const query = call[0] as { sql?: string } | readonly string[];
  if (!Array.isArray(query)) return (query as { sql?: string }).sql ?? "";
  const strings = query;
  const values = call.slice(1);
  return strings
    .map((part, index) => {
      const value = values[index] as { sql?: string } | undefined;
      return `${part}${value?.sql ?? "?"}`;
    })
    .join("");
}

describe("compteurs publics transmis au chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test";
    process.env.VOYAGE_API_KEY = "test";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    mocks.queryRaw.mockResolvedValue([
      {
        total_affairs: 0,
        total_politicians: 1,
        total_dossiers: 0,
        total_votes: 0,
        total_factchecks: 0,
        total_press_articles: 0,
        total_deputies: 0,
        total_senators: 0,
        total_meps: 0,
        total_ministers: 0,
      },
    ]);
    const results = [
      {
        id: "public-result",
        entityType: "AFFAIR",
        content: "Contenu public",
        similarity: 1,
        metadata: { title: "Affaire publique" },
      },
    ];
    mocks.searchSimilar.mockResolvedValue(results);
    mocks.rerankResults.mockResolvedValue(results);
    mocks.streamText.mockReturnValue({
      textStream: {
        async *[Symbol.asyncIterator]() {
          yield "ok";
        },
      },
    });
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.VOYAGE_API_KEY;
  });

  it("écarte fact-checks non publics et affaires liées à une personnalité DRAFT", async () => {
    const response = await POST(
      new Request("https://poligraph.fr/api/chat", {
        method: "POST",
        body: JSON.stringify({ messages: [{ role: "user", content: "affaire fact-check" }] }),
      })
    );

    expect(await response.text()).toBe("ok");
    const rawCall = mocks.queryRaw.mock.calls[0];
    expect(rawCall).toBeDefined();
    const sql = rawSqlText(rawCall!);
    expect(sql).toContain('a."publicationStatus" =');
    expect(sql).toContain('public_affair_politician."publicationStatus" =');
    expect(sql).toContain('fc."publicationStatus" =');
    expect(sql).toContain("fc.source IN");

    const streamCall = mocks.streamText.mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>;
    };
    const prompt = streamCall.messages.at(-1)?.content;
    expect(prompt).toContain("Total affaires judiciaires référencées: 0");
    expect(prompt).toContain("Fact-checks référencés: 0");
  });
});
