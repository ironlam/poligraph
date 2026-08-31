import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getUpstashCredentials } from "@/lib/ratelimit/upstash-credentials";

const DAILY_LIMIT = 5_000;
const MONTHLY_LIMIT = 100_000;
const BUDGET_TIMEOUT_MS = 500;

type BudgetLimiter = {
  limit(identifier: string): Promise<{ success: boolean; remaining: number; reset: number }>;
};

export type SemanticSearchBudgetDecision = {
  allowed: boolean;
  reason: "available" | "daily-limit" | "monthly-limit" | "unavailable";
};

async function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("délai du budget sémantique dépassé")),
          BUDGET_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Reserves one global paid embedding call. A shared budget outage fails the semantic branch closed
 * in production, while the caller keeps serving the lexical result.
 */
export class PresidentialSemanticSearchBudget {
  constructor(
    private readonly daily: BudgetLimiter | null,
    private readonly monthly: BudgetLimiter | null,
    private readonly allowWithoutSharedBudget: boolean
  ) {}

  async reserve(): Promise<SemanticSearchBudgetDecision> {
    if (!this.daily || !this.monthly) {
      return {
        allowed: this.allowWithoutSharedBudget,
        reason: this.allowWithoutSharedBudget ? "available" : "unavailable",
      };
    }

    try {
      const [daily, monthly] = await withTimeout(
        Promise.all([this.daily.limit("global"), this.monthly.limit("global")])
      );
      if (!monthly.success) return { allowed: false, reason: "monthly-limit" };
      if (!daily.success) return { allowed: false, reason: "daily-limit" };
      return { allowed: true, reason: "available" };
    } catch {
      return { allowed: false, reason: "unavailable" };
    }
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildBudget(): PresidentialSemanticSearchBudget {
  const credentials = getUpstashCredentials();
  const allowWithoutSharedBudget = process.env.NODE_ENV !== "production";
  if (!credentials) {
    return new PresidentialSemanticSearchBudget(null, null, allowWithoutSharedBudget);
  }

  const redis = new Redis(credentials);
  const dailyLimit = positiveInteger(
    process.env.PRESIDENTIAL_SEARCH_DAILY_EMBEDDING_LIMIT,
    DAILY_LIMIT
  );
  const monthlyLimit = positiveInteger(
    process.env.PRESIDENTIAL_SEARCH_MONTHLY_EMBEDDING_LIMIT,
    MONTHLY_LIMIT
  );
  return new PresidentialSemanticSearchBudget(
    new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(dailyLimit, "1 d"),
      prefix: "budget:presidential-search:daily",
    }),
    new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(monthlyLimit, "30 d"),
      prefix: "budget:presidential-search:monthly",
    }),
    allowWithoutSharedBudget
  );
}

const semanticSearchBudget = buildBudget();

export function reservePresidentialSemanticSearchBudget(): Promise<SemanticSearchBudgetDecision> {
  return semanticSearchBudget.reserve();
}
