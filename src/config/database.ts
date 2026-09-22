/**
 * Supabase can occasionally spend more than Prisma's five-second default inside a measure
 * transition, especially when the transition also refreshes its search document. Keep this
 * below PostgreSQL's 30-second statement timeout while leaving enough room for ordinary pooler
 * jitter.
 */
export const PRISMA_TRANSACTION_OPTIONS = {
  maxWait: 5_000,
  timeout: 15_000,
} as const;

/**
 * Connections the application pool may hold, per process.
 *
 * Two was sized for a serverless model where one instance serves one request at a time. It does
 * not hold when several cold renders land on the same instance: the pool becomes the queue, and
 * `connectionTimeoutMillis` turns the wait into a 500. Measured against staging on 2026-09-22,
 * with a render holding one connection for 3s (the shape of /politiques/[slug], which carries
 * three separate spans over a second):
 *
 *   max=2, 12 concurrent renders → requests 11 and 12 fail at exactly 15 000 ms
 *   max=2, 16 concurrent renders → 6 of 16 fail
 *   max=8, 16 concurrent renders → none fail, longest wait 3.2 s
 *
 * The waiting time follows hold × floor((n - 1) / max), so the pool size is the only term we
 * control without touching the queries themselves.
 */
export const DEFAULT_POOL_MAX = 8;

/** A ceiling on the override: a typo must not open thousands of connections to the pooler. */
export const MAX_POOL_MAX = 32;

export function resolvePoolMax(env: Record<string, string | undefined>): number {
  const raw = env.DATABASE_POOL_MAX?.trim();
  if (!raw) return DEFAULT_POOL_MAX;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_POOL_MAX;

  return Math.min(MAX_POOL_MAX, Math.max(1, Math.trunc(parsed)));
}
