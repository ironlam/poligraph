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
 * Two terms constrain this number, and only one of them is visible from a single process.
 *
 * Per instance. Two was sized for a serverless model where one instance serves one request at a
 * time. It does not hold when several cold renders land on the same instance: the pool becomes
 * their queue, and `connectionTimeoutMillis` turns the wait into a 500 (POLIGRAPH-V). Measured
 * against staging on 2026-09-22 with a render holding one connection for 3s, which is the shape of
 * /politiques/[slug], where Sentry already reports three separate spans over a second:
 *
 *   max=2, 12 concurrent renders → 2 fail       max=2, 16 → 6 fail
 *   max=3, 12 → none fail                       max=3, 16 → 1 fails
 *   max=4, 12 → none fail                       max=4, 16 → none fail, longest wait 9.2s
 *
 * Waiting time follows hold × floor((n - 1) / max). Four is the smallest size that absorbs the 16
 * concurrent renders per instance observed during the 2026-09-20 burst.
 *
 * Across instances. This is the term a single-process measurement never bounds, and the one that
 * broke first: commit e6f26dc3 (2026-02-27) cut the pool from 10 to 2 because "just 5-6 concurrent
 * requests exhaust Supabase's pooler limit (~60 connections), causing 'Max client connections
 * reached' errors site-wide". The failure is not local, it takes down everything sharing the
 * pooler, sync jobs included. Eight instances at four connections is 32, half that budget; fifteen
 * instances reach it. Raise this only against a measured pooler ceiling, never against a
 * single-instance benchmark.
 */
export const DEFAULT_POOL_MAX = 4;

/**
 * A ceiling on the override. Sized against the pooler budget rather than against arithmetic
 * overflow: the danger is not thousands of connections from one process, it is roughly sixty
 * across all of them. Ten is what caused the 2026-02 incident, so the override stops below it.
 */
export const MAX_POOL_MAX = 8;

/**
 * A floor of two, not one. `withAdvisoryLock` checks a client out for the whole callback and the
 * callback queries the same pool (`syncPressAnalysis` → `runPressAnalysis`), so a pool of one
 * leaves the first query inside the lock with no free slot: it waits the full
 * `connectionTimeoutMillis` and throws, every run.
 */
export const MIN_POOL_MAX = 2;

export function resolvePoolMax(env: Record<string, string | undefined>): number {
  const raw = env.DATABASE_POOL_MAX?.trim();
  if (!raw) return DEFAULT_POOL_MAX;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_POOL_MAX;

  return Math.min(MAX_POOL_MAX, Math.max(MIN_POOL_MAX, Math.trunc(parsed)));
}
