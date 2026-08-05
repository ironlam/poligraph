/**
 * Fixtures for the lot 1B search substrate tests.
 *
 * The gate is NOT here: it is `describeIfDisposableDb` / `assertDisposableTestDb`
 * from `@/test/db-guard`, next to the `describeIfLocalDb` it narrows. It lived in
 * this file first, then moved when the measures lot needed the same guarantee. Two
 * lots sharing one definition beats two definitions to keep in sync, which is the
 * same reason the lot never wrote its own "is this local" predicate.
 */

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
