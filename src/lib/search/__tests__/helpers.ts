/**
 * Gate and fixtures for the lot 1B search substrate tests.
 *
 * The gate NARROWS the repository one, it does not replace it. `describeIfLocalDb` from
 * `@/test/db-guard` (issue #547) answers "is this a local database", which is the right
 * question for a suite that only writes rows. It is not enough here: these tests run
 * `ALTER TABLE`, `CREATE INDEX` and `prisma db push --accept-data-loss` against whatever
 * `DATABASE_URL` names, and "local" also describes a persistent development database or
 * a tunnel to a remote one. So this gate requires the exact throwaway container.
 *
 * Checking inside `dbPush()` alone was not enough either: the drift test adds a column
 * and an index BEFORE calling it, so a refusal there left both behind on someone else's
 * database. The gate has to come before the first statement, which is what a skipped
 * `describe` guarantees.
 */

import { describe } from "vitest";
import { isLocalTestDb } from "@/test/db-guard";

/** The container from docker-compose.test-search.yml, and nothing else. */
const SEARCH_TEST_DB = {
  hostname: "localhost",
  port: "55433",
  database: "poligraph_test",
} as const;

/**
 * Whether `DATABASE_URL` names the disposable search container.
 *
 * Parses rather than pattern-matches, so a credentialed URL and a bare one both work and
 * a substring cannot be smuggled in through a password or a query parameter. Anything
 * unparseable counts as "not it": an unreadable URL is not evidence of safety.
 */
export function isSearchTestDb(url: string | undefined = process.env.DATABASE_URL): boolean {
  if (!url || !isLocalTestDb(url)) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.toLowerCase() === SEARCH_TEST_DB.hostname &&
      parsed.port === SEARCH_TEST_DB.port &&
      parsed.pathname.replace(/^\//, "") === SEARCH_TEST_DB.database
    );
  } catch {
    return false;
  }
}

/** `describe` for the destructive suites of this lot: runs on the throwaway container, skips everywhere else. */
export const describeIfSearchTestDb = isSearchTestDb() ? describe : describe.skip;

/**
 * Hard refusal, second layer behind {@link describeIfSearchTestDb}.
 *
 * Called from every `beforeAll` of the lot: a block can be added later with the wrong
 * `describe`, and a helper must not depend on its caller having been careful.
 */
export function assertSearchTestDb(): void {
  if (!isSearchTestDb()) {
    throw new Error(
      "Ces tests refusent de s'exécuter : DATABASE_URL ne désigne pas le conteneur jetable " +
        "de recherche (localhost:55433/poligraph_test). Lancer npm run test:db:search."
    );
  }
}

// Fixtures must not reuse fixed identifiers: a `@@unique([entityType, entityId])`
// collides on the second test of a block if two tests pick the same one, and the
// failure looks like a logic bug rather than a fixture bug.
let sequence = 0;

export function uniqueEntityId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${process.pid}-${sequence}`;
}

// A token safe to embed in indexed text. Letters and digits only: hyphens make the
// text-search parser emit several lexemes per token, which would make an assertion
// about the dictionary depend on tokenizer details instead.
export function uniqueToken(): string {
  sequence += 1;
  return `zk${process.pid}x${sequence}`;
}
