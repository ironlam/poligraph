import { describe, it, expect } from "vitest";
import {
  isIndexableScrutin,
  scrutinRobotsMetadata,
  type ScrutinIndexSignals,
} from "../scrutin-robots";

/** A bare amendment scrutin: real ballots, zero editorial substance. The shape that
 *  floods Coverage with "duplicate without user-selected canonical". */
const BARE_AMENDMENT: ScrutinIndexSignals = {
  totalVotes: 212,
  summary: null,
  citizenImpact: null,
  policyTitleStatus: null,
  isKeyVote: false,
};

describe("isIndexableScrutin", () => {
  it("excludes a bare amendment scrutin", () => {
    expect(isIndexableScrutin(BARE_AMENDMENT)).toBe(false);
  });

  it.each([
    ["a key vote", { isKeyVote: true }],
    ["an approved policy title", { policyTitleStatus: "APPROVED" as const }],
    ["a summary", { summary: "Le texte durcit les sanctions." }],
    ["a citizen impact", { citizenImpact: "Vos cotisations augmentent de 0,3 point." }],
  ])("indexes a scrutin with %s", (_label, signal) => {
    expect(isIndexableScrutin({ ...BARE_AMENDMENT, ...signal })).toBe(true);
  });

  // A policy title only earns indexation once a human has approved it: the earlier
  // states are generator output that may still be wrong or a near-copy of the official
  // title, which is exactly the duplicate content this rule exists to withhold.
  it.each(["DRAFT", "NEEDS_REVIEW", "REJECTED", "STALE"] as const)(
    "does not index a %s policy title",
    (status) => {
      expect(isIndexableScrutin({ ...BARE_AMENDMENT, policyTitleStatus: status })).toBe(false);
    }
  );

  it("treats blank text as absent", () => {
    expect(isIndexableScrutin({ ...BARE_AMENDMENT, summary: "   ", citizenImpact: "" })).toBe(
      false
    );
  });

  // Vote data is a precondition, not one signal among four: a scrutin with no ballot
  // recorded has nothing to show whatever text hangs off it. This subsumes the previous
  // `!summary && total === 0` guard.
  it.each([
    ["a summary", { summary: "Un résumé." }],
    ["a key vote flag", { isKeyVote: true }],
    ["an approved policy title", { policyTitleStatus: "APPROVED" as const }],
  ])("excludes a scrutin with no ballots even with %s", (_label, signal) => {
    expect(isIndexableScrutin({ ...BARE_AMENDMENT, totalVotes: 0, ...signal })).toBe(false);
  });
});

describe("scrutinRobotsMetadata", () => {
  it("returns {} for an indexable scrutin so it inherits the site default", () => {
    expect(scrutinRobotsMetadata({ ...BARE_AMENDMENT, isKeyVote: true })).toEqual({});
  });

  it("returns noindex,follow for a bare one (links still pass equity)", () => {
    expect(scrutinRobotsMetadata(BARE_AMENDMENT)).toEqual({
      robots: { index: false, follow: true },
    });
  });
});
