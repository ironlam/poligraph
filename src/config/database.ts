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
 * Across processes. This is the term a single-process measurement never bounds. Read from the
 * Supabase dashboard on 2026-09-22, for the Small compute this project runs on:
 *
 *   Max client connections     400, fixed   ← what a `pg.Pool` opens toward Supavisor
 *   Connection pool size        15, per user+db ← what Supavisor opens toward Postgres
 *
 * The 400 is not the binding constraint: eight instances at four connections is 32. The 15 is. In
 * transaction mode a backend is held for the duration of a query, not of a connection, so those 15
 * are shared by every process that imports this module: request instances, each `next build` worker
 * during a deploy, each Inngest job and each batch script under scripts/. Past 15 queries in flight
 * Supavisor queues rather than refusing, so the symptom becomes latency, not an error.
 *
 * Commit e6f26dc3 (2026-02-27) cut the pool from 10 to 2 citing "Supabase's pooler limit (~60
 * connections)". That number does not match anything the dashboard reports, so it is recorded here
 * as the claim it was, not as a measurement. Sizing this against the 15 is what holds.
 */
/**
 * Backends Supavisor opens toward Postgres for this user+db, read from the Supabase dashboard on
 * 2026-09-22 (Small compute). Shared by every process, so it is the ceiling that actually binds.
 */
export const SUPAVISOR_BACKENDS = 15;

export const DEFAULT_POOL_MAX = 4;

/**
 * A ceiling on the override, sized against the 15 backends rather than against arithmetic overflow.
 * Raising the client pool past that point buys no throughput: the extra connections queue at
 * Supavisor instead of at pg-pool, which moves the wait rather than removing it. Six leaves room to
 * step up once if pool waits reappear, and stops well before the point where the override would
 * only be trading one queue for another.
 */
export const MAX_POOL_MAX = 6;

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
