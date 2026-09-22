import { describe, it, expect, vi } from "vitest";
import { normalizeApiPath, classifyClient, recordApiCall } from "@/lib/api/usage-stats";

describe("normalizeApiPath", () => {
  it("collapses a dynamic segment so the hash stays bounded", () => {
    expect(normalizeApiPath("/api/politiques/xavier-dupont/votes")).toBe(
      "/api/politiques/[slug]/votes"
    );
    expect(normalizeApiPath("/api/partis/les-republicains")).toBe("/api/partis/[slug]");
  });

  it("keeps a static path as it is", () => {
    expect(normalizeApiPath("/api/export/politiques")).toBe("/api/export/politiques");
  });

  it("buckets anything unknown, so a crafted path cannot blow up the cardinality", () => {
    expect(normalizeApiPath("/api/does/not/exist/at/all")).toBe("other");
    expect(normalizeApiPath("/api/" + "x".repeat(500))).toBe("other");
  });

  it("labels the election routes instead of dropping them into the catch-all", () => {
    expect(normalizeApiPath("/api/elections/municipales-2026")).toBe("/api/elections/[slug]");
    expect(normalizeApiPath("/api/elections/municipales-2026/candidacies")).toBe(
      "/api/elections/[slug]/candidacies"
    );
  });

  it("keeps a static path that a dynamic pattern would otherwise swallow", () => {
    expect(normalizeApiPath("/api/elections/calendar")).toBe("/api/elections/calendar");
    expect(normalizeApiPath("/api/v1/elus/search")).toBe("/api/v1/elus/search");
  });
});

describe("classifyClient", () => {
  it("recognises the companion extension by user agent", () => {
    expect(classifyClient("PoligraphCompanion/1.2", new URLSearchParams())).toBe("companion");
  });

  it("does not trust a query parameter to override user agent classification", () => {
    expect(classifyClient("curl/8.5.0", new URLSearchParams("client=companion"))).toBe("script");
  });

  it("separates bots, scripts and browsers", () => {
    expect(classifyClient("Googlebot/2.1", new URLSearchParams())).toBe("bot");
    expect(classifyClient("curl/8.5.0", new URLSearchParams())).toBe("script");
    expect(classifyClient("Mozilla/5.0 (X11; Linux) Chrome/120", new URLSearchParams())).toBe(
      "browser"
    );
  });

  it("falls back rather than guessing when there is no user agent", () => {
    expect(classifyClient(null, new URLSearchParams())).toBe("other");
  });
});

describe("recordApiCall", () => {
  /** Minimal stand-in for `redis.pipeline()`: records the queued commands, one `exec`. */
  function pipelineStub(exec: () => Promise<unknown> = () => Promise.resolve([])) {
    const commands: unknown[][] = [];
    const chain = {
      hincrby: (...args: unknown[]) => (commands.push(["hincrby", ...args]), chain),
      expire: (...args: unknown[]) => (commands.push(["expire", ...args]), chain),
      exec: vi.fn(exec),
    };
    return { redis: { pipeline: vi.fn(() => chain) }, commands, chain };
  }

  it("counts the route and the client, and expires the keys", async () => {
    const { redis, commands } = pipelineStub();
    await recordApiCall(
      redis as never,
      "/api/politiques/x-dupont/votes",
      "curl/8",
      new URLSearchParams()
    );

    expect(commands).toContainEqual([
      "hincrby",
      expect.stringMatching(/^apistats:\d{4}-\d{2}-\d{2}$/),
      "/api/politiques/[slug]/votes",
      1,
    ]);
    expect(commands).toContainEqual([
      "hincrby",
      expect.stringMatching(/^apistats:client:\d{4}-\d{2}-\d{2}$/),
      "script",
      1,
    ]);
    expect(commands.filter(([name]) => name === "expire")).toHaveLength(2);
  });

  it("issues the four Redis commands in one round-trip", async () => {
    // A pipeline is a single HTTP request to Upstash, and the commands run in the order
    // they were queued: `expire` can never land before the `hincrby` that creates the key
    // and silently leave the day hash without a TTL.
    const { redis, commands, chain } = pipelineStub();
    await recordApiCall(redis as never, "/api/stats", null, new URLSearchParams());

    expect(redis.pipeline).toHaveBeenCalledTimes(1);
    expect(chain.exec).toHaveBeenCalledTimes(1);
    expect(commands.map(([name]) => name)).toEqual(["hincrby", "hincrby", "expire", "expire"]);
  });

  it("never throws when Redis is down: a counter must not break a public route", async () => {
    const { redis } = pipelineStub(() => Promise.reject(new Error("upstash down")));
    await expect(
      recordApiCall(redis as never, "/api/stats", null, new URLSearchParams())
    ).resolves.toBeUndefined();
  });
});
