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
  it("counts the route and the client, and expires the keys", async () => {
    const redis = { hincrby: vi.fn().mockResolvedValue(1), expire: vi.fn().mockResolvedValue(1) };
    await recordApiCall(
      redis as never,
      "/api/politiques/x-dupont/votes",
      "curl/8",
      new URLSearchParams()
    );

    expect(redis.hincrby).toHaveBeenCalledWith(
      expect.stringMatching(/^apistats:\d{4}-\d{2}-\d{2}$/),
      "/api/politiques/[slug]/votes",
      1
    );
    expect(redis.hincrby).toHaveBeenCalledWith(
      expect.stringMatching(/^apistats:client:\d{4}-\d{2}-\d{2}$/),
      "script",
      1
    );
    expect(redis.expire).toHaveBeenCalledTimes(2);
  });

  it("issues the four Redis commands in one round-trip, not two sequential ones", async () => {
    // IMPORTANT 6: `expire` used to wait on `hincrby` finishing first (two Promise.all
    // calls, awaited in sequence). If `hincrby` never resolves, that old shape would
    // never even call `expire`. A single merged Promise.all dispatches all four calls
    // synchronously regardless of whether any of them has resolved yet.
    let resolveHincrby!: (value: number) => void;
    const pendingHincrby = new Promise<number>((resolve) => {
      resolveHincrby = resolve;
    });
    const redis = {
      hincrby: vi.fn().mockReturnValue(pendingHincrby),
      expire: vi.fn().mockResolvedValue(1),
    };

    const call = recordApiCall(redis as never, "/api/stats", null, new URLSearchParams());
    // Flush pending microtasks without ever resolving `hincrby`.
    await Promise.resolve();
    await Promise.resolve();

    expect(redis.expire).toHaveBeenCalledTimes(2);

    resolveHincrby(1);
    await call;
  });

  it("never throws when Redis is down: a counter must not break a public route", async () => {
    const redis = {
      hincrby: vi.fn().mockRejectedValue(new Error("upstash down")),
      expire: vi.fn(),
    };
    await expect(
      recordApiCall(redis as never, "/api/stats", null, new URLSearchParams())
    ).resolves.toBeUndefined();
  });
});
