/**
 * Gate for integration tests that write to a database (issue #547).
 *
 * The predicates and the hard refusals live in `./disposable-db`, which imports no vitest: a
 * seed script running under tsx has to be able to call `assertDisposableTestDb()`, and pulling
 * `describe` in through it crashes. This module adds the two vitest gates and re-exports the
 * rest, so `@/test/db-guard` stays the single import for tests.
 *
 * Skipping is deliberately preferred over throwing. A guard that throws inside `beforeAll`
 * still lets earlier writes in that same hook reach the database, and the residue then outlives
 * the run. A block that never starts writes nothing, so there is nothing to clean up.
 *
 * Run these tests through the disposable harness (`npm run test:db:search`), which exports a
 * `@localhost` URL and tears the container down on exit.
 */

import { describe } from "vitest";
import { isDisposableTestDb, isLocalTestDb } from "./disposable-db";

export {
  assertDisposableTestDb,
  assertLocalTestDb,
  isDisposableTestDb,
  isLocalTestDb,
} from "./disposable-db";

/**
 * `describe` for suites that write to a database: runs against a local database, skips
 * everywhere else, including against production.
 *
 * Replaces the `process.env.DATABASE_URL ? describe : describe.skip` idiom, which gated on the
 * presence of a database rather than on which one.
 */
export const describeIfLocalDb = isLocalTestDb() ? describe : describe.skip;

/**
 * `describe` for destructive suites: runs on the disposable container, skips everywhere else,
 * including on another local database.
 */
export const describeIfDisposableDb = isDisposableTestDb() ? describe : describe.skip;
