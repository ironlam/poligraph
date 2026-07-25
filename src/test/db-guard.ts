/**
 * Gate for integration tests that write to a database (issue #547).
 *
 * `.env` and `.env.prod` both point at the same production Supabase: this project
 * has no separate development database. A gate on "is there a database?" therefore
 * turns every integration test into a production writer as soon as someone exports
 * `DATABASE_URL` in their shell. The gate has to be "is this a *local throwaway*
 * database?" instead.
 *
 * Skipping is deliberately preferred over throwing. A guard that throws inside
 * `beforeAll` still lets earlier writes in that same hook reach the database, and
 * the residue then outlives the run. A block that never starts writes nothing, so
 * there is nothing to clean up.
 *
 * Run these tests through the disposable harness (`npm run test:db:477`), which
 * exports a `@localhost` URL and tears the container down on exit.
 */

import { describe } from "vitest";

/** Hosts that can only be a throwaway database on the machine running the tests. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Whether `DATABASE_URL` names a local database.
 *
 * Parses rather than pattern-matches, so both credentialed
 * (`postgresql://user:pass@localhost:5432/db`) and bare (`postgresql://localhost/db`)
 * forms are recognised. Anything unparseable counts as non-local: an unreadable URL
 * is not evidence of safety.
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
 * `describe` for suites that write to a database: runs against a local database,
 * skips everywhere else, including against production.
 *
 * Replaces the `process.env.DATABASE_URL ? describe : describe.skip` idiom, which
 * gated on the presence of a database rather than on which one.
 */
export const describeIfLocalDb = isLocalTestDb() ? describe : describe.skip;

/**
 * Hard refusal, for shared seed and cleanup helpers.
 *
 * Second layer behind {@link describeIfLocalDb}: a helper can be called from a
 * script or a future test that forgot the gate, and it must not depend on its
 * caller having been careful.
 */
export function assertLocalTestDb(): void {
  if (!isLocalTestDb()) {
    throw new Error(
      "Ces fixtures refusent de s'exécuter : DATABASE_URL ne désigne pas une base locale. " +
        "Lancer les tests d'intégration via le harness jetable (npm run test:db:477)."
    );
  }
}
