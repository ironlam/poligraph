/**
 * Fixtures for the lot 1B search substrate tests.
 *
 * The database gate is NOT here: it is `describeIfLocalDb` from `@/test/db-guard`,
 * which already exists (issue #547) and parses the URL instead of matching a port.
 * A second gate would be a second convention to keep in sync.
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
