import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redisBackend = vi.hoisted(() => ({
  createScript: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    createScript = redisBackend.createScript;
  },
}));

import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  DistributedLoginRateLimiter,
  LOGIN_BLOCK_DURATION_MS,
  LOGIN_FAILURE_WINDOW_MS,
  LoginRateLimitUnavailableError,
  reserveLoginAttempt,
  resetLoginRateLimiterForTests,
} from "@/lib/rate-limit";

interface Entry {
  failures: number;
  failureExpiresAt: number;
  blockedUntil: number;
}

class SharedFakeRedis {
  readonly entries = new Map<string, Entry>();
  unavailable = false;
  private scriptIndex = 0;

  createScript<TResult>(): { exec: (keys: string[]) => Promise<TResult> } {
    const operation = this.scriptIndex++ % 3;
    return {
      exec: async (keys) => {
        if (this.unavailable) throw new Error("test backend unavailable");
        const key = keys[0]!;
        const entry = this.getEntry(key);
        if (operation === 0) return this.check(entry) as TResult;
        if (operation === 1) return this.reserveAttempt(entry) as TResult;
        this.entries.delete(key);
        return 1 as TResult;
      },
    };
  }

  private getEntry(key: string): Entry {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { failures: 0, failureExpiresAt: 0, blockedUntil: 0 };
      this.entries.set(key, entry);
    }
    if (entry.failureExpiresAt <= Date.now()) entry.failures = 0;
    return entry;
  }

  private check(entry: Entry): [number, number, number] {
    if (entry.blockedUntil > Date.now()) return [0, 0, entry.blockedUntil - Date.now()];
    return [
      1,
      5 - entry.failures,
      entry.failureExpiresAt > Date.now() ? entry.failureExpiresAt - Date.now() : 0,
    ];
  }

  private reserveAttempt(entry: Entry): [number, number, number] {
    if (entry.blockedUntil > Date.now()) return [0, 0, entry.blockedUntil - Date.now()];
    if (entry.failures === 0) entry.failureExpiresAt = Date.now() + LOGIN_FAILURE_WINDOW_MS;
    entry.failures += 1;
    if (entry.failures >= 5) {
      entry.failures = 0;
      entry.failureExpiresAt = 0;
      entry.blockedUntil = Date.now() + LOGIN_BLOCK_DURATION_MS;
      return [1, 0, LOGIN_BLOCK_DURATION_MS];
    }
    return [1, 5 - entry.failures, entry.failureExpiresAt - Date.now()];
  }
}

describe("distributed admin login limiter policy", () => {
  const now = Date.parse("2026-08-13T12:00:00.000Z");
  let backend: SharedFakeRedis;
  let limiter: DistributedLoginRateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    backend = new SharedFakeRedis();
    limiter = new DistributedLoginRateLimiter(backend);
  });

  afterEach(() => vi.useRealTimers());

  it("atomically reserves attempts one through four within the 15-minute budget", async () => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      await expect(limiter.reserveAttempt("client")).resolves.toMatchObject({
        allowed: true,
        remaining: 5 - attempt,
      });
    }
  });

  it("admits the fifth reservation, arms a 30-minute block, and denies the sixth", async () => {
    for (let attempt = 1; attempt <= 4; attempt++) await limiter.reserveAttempt("client");
    await expect(limiter.reserveAttempt("client")).resolves.toEqual({
      allowed: true,
      remaining: 0,
      retryAfter: 30 * 60,
    });
    await expect(limiter.check("client")).resolves.toMatchObject({ allowed: false });
    vi.advanceTimersByTime(LOGIN_BLOCK_DURATION_MS - 1);
    await expect(limiter.check("client")).resolves.toMatchObject({ allowed: false });
    vi.advanceTimersByTime(1);
    await expect(limiter.check("client")).resolves.toEqual({
      allowed: true,
      remaining: 5,
      retryAfter: 0,
    });
  });

  it("expires a sub-threshold failure window after 15 minutes", async () => {
    await limiter.reserveAttempt("client");
    await limiter.reserveAttempt("client");
    vi.advanceTimersByTime(LOGIN_FAILURE_WINDOW_MS);
    await expect(limiter.check("client")).resolves.toEqual({
      allowed: true,
      remaining: 5,
      retryAfter: 0,
    });
  });

  it("shares state across limiter instances and cold starts", async () => {
    const otherInstance = new DistributedLoginRateLimiter(backend);
    for (let attempt = 1; attempt <= 5; attempt++) await limiter.reserveAttempt("client");
    await expect(otherInstance.check("client")).resolves.toMatchObject({ allowed: false });
  });

  it("admits at most five concurrent reservations for one identity", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => limiter.reserveAttempt("client"))
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    expect(results.filter((result) => !result.allowed)).toHaveLength(3);
    expect([...backend.entries.values()][0]?.blockedUntil).toBe(now + LOGIN_BLOCK_DURATION_MS);
  });

  it("bounds every temporary state with the policy TTL", async () => {
    await limiter.reserveAttempt("client");
    expect([...backend.entries.values()][0]?.failureExpiresAt).toBe(now + LOGIN_FAILURE_WINDOW_MS);
    for (let attempt = 2; attempt <= 5; attempt++) await limiter.reserveAttempt("client");
    expect([...backend.entries.values()][0]?.blockedUntil).toBe(now + LOGIN_BLOCK_DURATION_MS);
  });

  it("clears failures and a concurrent block after a proven successful login", async () => {
    for (let attempt = 1; attempt <= 5; attempt++) await limiter.reserveAttempt("client");
    await limiter.resetAfterSuccess("client");
    await expect(limiter.check("client")).resolves.toEqual({
      allowed: true,
      remaining: 5,
      retryAfter: 0,
    });
  });
});

describe("distributed admin login limiter availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLoginRateLimiterForTests();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("fails closed in production when configuration is absent", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    resetLoginRateLimiterForTests();
    await expect(checkLoginRateLimit("client")).rejects.toBeInstanceOf(
      LoginRateLimitUnavailableError
    );
  });

  it("fails closed for checks, admission, and reset when the backend errors", async () => {
    const backend = new SharedFakeRedis();
    backend.unavailable = true;
    redisBackend.createScript.mockImplementation(() => backend.createScript());
    await expect(checkLoginRateLimit("client")).rejects.toBeInstanceOf(
      LoginRateLimitUnavailableError
    );
    await expect(reserveLoginAttempt("client")).rejects.toBeInstanceOf(
      LoginRateLimitUnavailableError
    );
    await expect(clearLoginRateLimit("client")).rejects.toBeInstanceOf(
      LoginRateLimitUnavailableError
    );
  });

  it("allows the explicit local fallback", async () => {
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    resetLoginRateLimiterForTests();
    await expect(checkLoginRateLimit("local")).resolves.toEqual({
      allowed: true,
      remaining: 5,
      retryAfter: 0,
    });
  });
});
