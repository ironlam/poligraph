import { describe, it, expect } from "vitest";
import { RULES, fingerprintOf, rulesFingerprint } from "@/lib/affairs/grading-rules";

/**
 * The fingerprint pins the rule VALUES, not the file text, so reformatting or
 * rewording a comment leaves it alone.
 *
 * Adding a version means adding an entry here. Editing an existing entry in
 * place is possible, and no test can prevent it: the guard turns a forgotten
 * bump into a CI failure, it does not protect against a deliberate change.
 */
const KNOWN_FINGERPRINTS: Record<number, string> = {
  1: "a5f8154c1a1bed8a",
  // v2 (#576): the predicate behind `partlySuspended` moved from
  // `prisonSuspended === false` to `prisonFirmMonths === prisonMonths`, the patterns
  // gained `;` as a segment separator, and `ineligibilityContext` was added so an
  // ineligibility split stops satisfying the prison predicate.
  2: "9d0939e641c49660",
};

describe("les règles de notation sont versionnées", () => {
  it("l'empreinte correspond à la version déclarée", () => {
    expect(rulesFingerprint()).toBe(KNOWN_FINGERPRINTS[RULES.version]);
  });

  it("chaque version connue a une empreinte", () => {
    expect(Object.keys(KNOWN_FINGERPRINTS)).toContain(String(RULES.version));
  });

  // Folding the version into the hash would make the guard circular: bumping it
  // would move the fingerprint on its own, so the test would pass without anyone
  // checking whether the rules actually changed.
  it("l'empreinte ignore la version", () => {
    expect(fingerprintOf({ ...RULES, version: RULES.version + 1 })).toBe(rulesFingerprint());
  });

  it("l'empreinte bouge si une règle de preuve bouge", () => {
    const altered = { ...RULES, evidence: { ...RULES.evidence, officialHosts: ["exemple.test"] } };

    expect(fingerprintOf(altered)).not.toBe(rulesFingerprint());
  });

  it("l'empreinte bouge si une règle de cohérence bouge", () => {
    const altered = {
      ...RULES,
      coherence: { ...RULES.coherence, adverseInvolvements: ["DIRECT"] as const },
    };

    expect(fingerprintOf(altered)).not.toBe(rulesFingerprint());
  });

  // Declaration order is not a rule change, so it must not read as one.
  //
  // Rebuilt from RULES' own keys rather than listed by hand: a hand-written list goes
  // stale the moment a top-level key is added, and then asserts that reordering changes
  // the fingerprint, which is the opposite of what it means to check.
  it("l'empreinte ignore l'ordre de déclaration des clés", () => {
    const reordered = Object.fromEntries(
      Object.entries(RULES).reverse()
    ) as unknown as typeof RULES;

    expect(Object.keys(reordered)).not.toEqual(Object.keys(RULES));
    expect(fingerprintOf(reordered)).toBe(rulesFingerprint());
  });
});
