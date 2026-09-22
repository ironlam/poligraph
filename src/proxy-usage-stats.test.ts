import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";

// Spy on `recordApiCall` itself rather than on `event.waitUntil`, which the proxy also uses
// for the unrelated degraded-mode Sentry flush (`reportDegradedMode`). Asserting on
// `waitUntil` would conflate the two mechanisms.
const recordApiCall = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/api/usage-stats", () => ({
  recordApiCall: (...args: unknown[]) => recordApiCall(...args),
}));

// The proxy's own Ratelimit instance is memoized at module scope, so `limitMock`'s
// resolved value is what drives the success/reject branch in every test below.
const { limitMock } = vi.hoisted(() => ({ limitMock: vi.fn() }));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow(): Record<string, never> {
      return {};
    }
    limit = limitMock;
  },
}));

// The proxy never calls a real Redis method in this test: `limitMock` fully stands
// in for the limiter's decision, so the Redis client itself only needs to exist.
vi.mock("@upstash/redis", () => ({
  Redis: class {},
}));

import { proxy } from "@/proxy";

const CRED_KEYS = ["POLIGRAPH_API_KV_REST_API_URL", "POLIGRAPH_API_KV_REST_API_TOKEN"] as const;

describe("proxy : comptage des appels API", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of CRED_KEYS) {
      saved[k] = process.env[k];
    }
    process.env.POLIGRAPH_API_KV_REST_API_URL = "https://example.upstash.io";
    process.env.POLIGRAPH_API_KV_REST_API_TOKEN = "test-token";
    recordApiCall.mockClear();
    limitMock.mockClear();
  });

  afterEach(() => {
    for (const k of CRED_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("records the call after a request that passed the limiter", async () => {
    limitMock.mockResolvedValue({
      success: true,
      limit: 60,
      remaining: 59,
      reset: Date.now() + 60_000,
    });
    const event = { waitUntil: vi.fn() } as unknown as NextFetchEvent;
    const request = new NextRequest("https://poligraph.fr/api/stats", {
      headers: { "user-agent": "curl/8.5.0" },
    });

    await proxy(request, event);

    expect(recordApiCall).toHaveBeenCalledTimes(1);
    const [, pathname, userAgent] = recordApiCall.mock.calls[0]!;
    expect(pathname).toBe("/api/stats");
    expect(userAgent).toBe("curl/8.5.0");
  });

  it("does not count a request the limiter rejected", async () => {
    limitMock.mockResolvedValue({
      success: false,
      limit: 60,
      remaining: 0,
      reset: Date.now() + 60_000,
    });
    const event = { waitUntil: vi.fn() } as unknown as NextFetchEvent;
    const request = new NextRequest("https://poligraph.fr/api/stats", {
      headers: { "user-agent": "curl/8.5.0" },
    });

    await proxy(request, event);

    expect(recordApiCall).not.toHaveBeenCalled();
  });
});
