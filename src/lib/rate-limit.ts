import { createHash } from "crypto";
import { Redis } from "@upstash/redis";
import { isProductionRuntime } from "@/lib/ratelimit/degraded-mode";
import { getUpstashCredentials } from "@/lib/ratelimit/upstash-credentials";

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_BLOCK_DURATION_MS = 30 * 60 * 1000;

export interface LoginRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

export class LoginRateLimitUnavailableError extends Error {}

interface RedisScript<TResult> {
  exec(keys: string[], args: string[]): Promise<TResult>;
}

interface LoginRedis {
  createScript<TResult>(script: string): RedisScript<TResult>;
}

const CHECK_SCRIPT = `
local blockedTtl = redis.call("PTTL", KEYS[2])
if blockedTtl > 0 then
  return {0, 0, blockedTtl}
end
local failures = tonumber(redis.call("GET", KEYS[1]) or "0")
local failureTtl = redis.call("PTTL", KEYS[1])
return {1, math.max(0, tonumber(ARGV[1]) - failures), math.max(0, failureTtl)}
`;

const ADMISSION_SCRIPT = `
local blockedTtl = redis.call("PTTL", KEYS[2])
if blockedTtl > 0 then
  return {0, 0, blockedTtl}
end
local failures = redis.call("INCR", KEYS[1])
if failures == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
if failures >= tonumber(ARGV[1]) then
  redis.call("SET", KEYS[2], "1", "PX", ARGV[3])
  redis.call("DEL", KEYS[1])
  return {1, 0, tonumber(ARGV[3])}
end
return {1, tonumber(ARGV[1]) - failures, redis.call("PTTL", KEYS[1])}
`;

const RESET_SCRIPT = `
redis.call("DEL", KEYS[1], KEYS[2])
return 1
`;

export class DistributedLoginRateLimiter {
  private readonly checkScript: RedisScript<[number, number, number]>;
  private readonly admissionScript: RedisScript<[number, number, number]>;
  private readonly resetScript: RedisScript<number>;

  constructor(redis: LoginRedis) {
    this.checkScript = redis.createScript(CHECK_SCRIPT);
    this.admissionScript = redis.createScript(ADMISSION_SCRIPT);
    this.resetScript = redis.createScript(RESET_SCRIPT);
  }

  private keys(identity: string): [string, string] {
    const digest = createHash("sha256").update(identity).digest("hex");
    return [`rl:admin-login:failures:${digest}`, `rl:admin-login:blocked:${digest}`];
  }

  async check(identity: string): Promise<LoginRateLimitResult> {
    const result = await this.checkScript.exec(this.keys(identity), [String(LOGIN_MAX_FAILURES)]);
    return this.toResult(result);
  }

  async reserveAttempt(identity: string): Promise<LoginRateLimitResult> {
    const result = await this.admissionScript.exec(this.keys(identity), [
      String(LOGIN_MAX_FAILURES),
      String(LOGIN_FAILURE_WINDOW_MS),
      String(LOGIN_BLOCK_DURATION_MS),
    ]);
    return this.toResult(result);
  }

  async resetAfterSuccess(identity: string): Promise<void> {
    await this.resetScript.exec(this.keys(identity), []);
  }

  private toResult([allowed, remaining, retryAfterMs]: [
    number,
    number,
    number,
  ]): LoginRateLimitResult {
    return {
      allowed: allowed === 1,
      remaining,
      retryAfter: retryAfterMs > 0 ? Math.max(1, Math.ceil(retryAfterMs / 1000)) : 0,
    };
  }
}

let loginLimiter: DistributedLoginRateLimiter | null | undefined;

function getLoginLimiter(): DistributedLoginRateLimiter | null {
  if (loginLimiter !== undefined) return loginLimiter;
  const credentials = getUpstashCredentials();
  if (!credentials) return (loginLimiter = null);
  return (loginLimiter = new DistributedLoginRateLimiter(new Redis(credentials)));
}

function requireLoginLimiter(): DistributedLoginRateLimiter | null {
  const limiter = getLoginLimiter();
  if (!limiter && isProductionRuntime(process.env)) {
    throw new LoginRateLimitUnavailableError("Login rate limiter unavailable");
  }
  return limiter;
}

export async function checkLoginRateLimit(identity: string): Promise<LoginRateLimitResult> {
  const limiter = requireLoginLimiter();
  if (!limiter) return { allowed: true, remaining: LOGIN_MAX_FAILURES, retryAfter: 0 };
  try {
    return await limiter.check(identity);
  } catch {
    throw new LoginRateLimitUnavailableError("Login rate limiter unavailable");
  }
}

export async function reserveLoginAttempt(identity: string): Promise<LoginRateLimitResult> {
  const limiter = requireLoginLimiter();
  if (!limiter) return { allowed: true, remaining: LOGIN_MAX_FAILURES, retryAfter: 0 };
  try {
    return await limiter.reserveAttempt(identity);
  } catch {
    throw new LoginRateLimitUnavailableError("Login rate limiter unavailable");
  }
}

export async function clearLoginRateLimit(identity: string): Promise<void> {
  const limiter = requireLoginLimiter();
  if (!limiter) return;
  try {
    // A proven credential resets both the reserved-attempt window and any concurrent block.
    await limiter.resetAfterSuccess(identity);
  } catch {
    throw new LoginRateLimitUnavailableError("Login rate limiter unavailable");
  }
}

export function resetLoginRateLimiterForTests(): void {
  if (process.env.NODE_ENV !== "test") throw new Error("Test helper unavailable");
  loginLimiter = undefined;
}
