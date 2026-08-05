/**
 * Which database `DATABASE_URL` names, and the hard refusals built on the answer.
 *
 * **This module must never import vitest.** It is split out of `db-guard.ts` for exactly that
 * reason: `assertDisposableTestDb()` is also called by `scripts/seed-measures-demo.ts`, which
 * runs under tsx, and importing the `describe` helpers there fails with "Vitest cannot be
 * imported in a CommonJS module using require()". The guard has to be usable by the callers
 * that most need it, and a script that writes to a database is one of them.
 *
 * `db-guard.ts` re-exports everything here and adds the two vitest `describe` gates, so
 * existing imports of `@/test/db-guard` keep working.
 *
 * Why the guard exists at all: `.env` and `.env.prod` both point at the same production
 * Supabase, so this project has no separate development database. A check on "is there a
 * database?" turns any seed helper into a production writer as soon as someone exports
 * `DATABASE_URL` in their shell.
 */

/** Hosts that can only be a throwaway database on the machine running the code. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Whether `DATABASE_URL` names a local database.
 *
 * Parses rather than pattern-matches, so both credentialed
 * (`postgresql://user:pass@localhost:5432/db`) and bare (`postgresql://localhost/db`) forms
 * are recognised. Anything unparseable counts as non-local: an unreadable URL is not evidence
 * of safety.
 */
export function isLocalTestDb(url: string | undefined = process.env.DATABASE_URL): boolean {
  if (!url) return false;
  try {
    // IPv6 hostnames come back bracketed ("[::1]"); compare the host itself.
    const hostname = new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return LOCAL_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

/**
 * Hard refusal, for shared seed and cleanup helpers.
 *
 * Second layer behind `describeIfLocalDb`: a helper can be called from a script or a future
 * test that forgot the gate, and it must not depend on its caller having been careful.
 */
export function assertLocalTestDb(): void {
  if (!isLocalTestDb()) {
    throw new Error(
      "Ces fixtures refusent de s'exécuter : DATABASE_URL ne désigne pas une base locale. " +
        "Lancer les tests d'intégration via le harness jetable (npm run test:db:477)."
    );
  }
}

// --- Destructive suites: the exact disposable container ----------------------
//
// `isLocalTestDb` answers "is this a local database", which is the right question for a suite
// that only writes rows. It is not enough for suites that run DDL: "local" also describes a
// persistent development database or an SSH tunnel to a remote one. Discovered concretely on
// the lot 1B search substrate, whose drift test ran ALTER TABLE and
// `prisma db push --accept-data-loss`, and whose internal URL check happened AFTER the first
// statement, so a refusal left the added column behind on someone else's database.
//
// Deliberately pinned to the port 55433 container only, and NOT to the #477 harness on 55432:
// the two containers are created by different compose files with different extensions, so "any
// disposable container" would be a claim this module cannot verify. The cost of pinning is that
// a suite launched under the wrong harness skips instead of running, which is the safe
// direction and is visible in the vitest output.

/** The container from docker-compose.test-search.yml, and nothing else. */
const DISPOSABLE_TEST_DB = {
  hostname: "localhost",
  port: "55433",
  database: "poligraph_test",
} as const;

/**
 * Whether `DATABASE_URL` names the disposable container of `npm run test:db:search`.
 *
 * Narrows {@link isLocalTestDb} rather than replacing it, so there stays a single definition of
 * "local" and a single definition of "the destructible container". Parses rather than
 * pattern-matches, so a credentialed URL and a bare one both work and the expected values
 * cannot be smuggled in through a password or a query parameter. Anything unparseable counts as
 * "not it".
 */
export function isDisposableTestDb(url: string | undefined = process.env.DATABASE_URL): boolean {
  if (!url || !isLocalTestDb(url)) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.toLowerCase() === DISPOSABLE_TEST_DB.hostname &&
      parsed.port === DISPOSABLE_TEST_DB.port &&
      parsed.pathname.replace(/^\//, "") === DISPOSABLE_TEST_DB.database
    );
  } catch {
    return false;
  }
}

/**
 * Hard refusal, second layer behind `describeIfDisposableDb`.
 *
 * Call it from every `beforeAll` of a destructive suite, from fixture modules, and from any
 * script that writes: a block can be added later with the wrong `describe`, and a helper must
 * not depend on its caller having been careful.
 */
export function assertDisposableTestDb(): void {
  if (!isDisposableTestDb()) {
    throw new Error(
      "Ces tests refusent de s'exécuter : DATABASE_URL ne désigne pas le conteneur jetable " +
        "(localhost:55433/poligraph_test). Lancer npm run test:db:search."
    );
  }
}
