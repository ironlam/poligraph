/**
 * Identity of an unordered pair of affairs.
 *
 * Its own module so both the detector and the decision store can depend on it
 * without importing each other. Every store and every exclusion goes through
 * this one function, which is what stops (A, B) and (B, A) from producing two
 * rows for one pair (issue #525).
 */

export interface CanonicalPair {
  a: string;
  b: string;
  key: string;
}

export function canonicalPair(idA: string, idB: string): CanonicalPair {
  const [a, b] = [idA, idB].sort();
  return { a: a!, b: b!, key: `${a}:${b}` };
}
