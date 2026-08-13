import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upstash = vi.hoisted(() => ({
  limit: vi.fn(),
  resetUsedTokens: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({ Redis: class {} }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }
    limit = upstash.limit;
    resetUsedTokens = upstash.resetUsedTokens;
  },
}));

import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  LoginRateLimitUnavailableError,
  resetLoginRateLimiterForTests,
} from "@/lib/rate-limit";

describe("distributed admin login limiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLoginRateLimiterForTests();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    upstash.limit.mockResolvedValue({ success: true, remaining: 4, reset: Date.now() + 60_000 });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("returns the distributed allow and deny decisions", async () => {
    await expect(checkLoginRateLimit("client")).resolves.toMatchObject({ allowed: true });
    upstash.limit.mockResolvedValueOnce({
      success: false,
      remaining: 0,
      reset: Date.now() + 60_000,
    });
    await expect(checkLoginRateLimit("client")).resolves.toMatchObject({ allowed: false });
  });

  it("fails closed in production when configuration is absent", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    resetLoginRateLimiterForTests();
    await expect(checkLoginRateLimit("client")).rejects.toBeInstanceOf(
      LoginRateLimitUnavailableError
    );
  });

  it("fails closed when the backend errors", async () => {
    upstash.limit.mockRejectedValueOnce(new Error("test outage"));
    await expect(checkLoginRateLimit("client")).rejects.toBeInstanceOf(
      LoginRateLimitUnavailableError
    );
  });

  it("allows an explicit local fallback and can reset successful logins", async () => {
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    resetLoginRateLimiterForTests();
    await expect(checkLoginRateLimit("local")).resolves.toMatchObject({ allowed: true });

    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    resetLoginRateLimiterForTests();
    await clearLoginRateLimit("client");
    expect(upstash.resetUsedTokens).toHaveBeenCalledWith("client");
  });
});
