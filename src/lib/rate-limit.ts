import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { isProductionRuntime } from "@/lib/ratelimit/degraded-mode";
import { getUpstashCredentials } from "@/lib/ratelimit/upstash-credentials";

export interface LoginRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

export class LoginRateLimitUnavailableError extends Error {}

let loginLimiter: Ratelimit | null | undefined;

function getLoginLimiter(): Ratelimit | null {
  if (loginLimiter !== undefined) return loginLimiter;
  const credentials = getUpstashCredentials();
  if (!credentials) return (loginLimiter = null);
  const redis = new Redis(credentials);
  return (loginLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "30 m"),
    prefix: "rl:admin-login",
  }));
}

export async function checkLoginRateLimit(identity: string): Promise<LoginRateLimitResult> {
  const limiter = getLoginLimiter();
  if (!limiter) {
    if (isProductionRuntime(process.env)) {
      throw new LoginRateLimitUnavailableError("Login rate limiter unavailable");
    }
    return { allowed: true, remaining: 5, retryAfter: 0 };
  }

  try {
    const result = await limiter.limit(identity);
    return {
      allowed: result.success,
      remaining: result.remaining,
      retryAfter: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
    };
  } catch {
    throw new LoginRateLimitUnavailableError("Login rate limiter unavailable");
  }
}

export async function clearLoginRateLimit(identity: string): Promise<void> {
  const limiter = getLoginLimiter();
  if (!limiter) return;
  try {
    await limiter.resetUsedTokens(identity);
  } catch {
    // Authentication already succeeded. A reset outage must not mint extra attempts.
  }
}

export function resetLoginRateLimiterForTests(): void {
  if (process.env.NODE_ENV !== "test") throw new Error("Test helper unavailable");
  loginLimiter = undefined;
}
