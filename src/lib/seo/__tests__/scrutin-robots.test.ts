import { describe, it, expect } from "vitest";
import {
  isIndexableScrutin,
  scrutinRobotsMetadata,
  type ScrutinIndexSignals,
} from "../scrutin-robots";

/** A bare amendment scrutin: real ballots, no editorial decision attached. The shape
 *  that floods Coverage with "duplicate without user-selected canonical". */
const BARE_AMENDMENT: ScrutinIndexSignals = {
  type: "AMENDEMENT",
  totalVotes: 212,
  citizenImpact: null,
  isKeyVote: false,
};

describe("isIndexableScrutin", () => {
  it("excludes a bare amendment scrutin", () => {
    expect(isIndexableScrutin(BARE_AMENDMENT)).toBe(false);
  });

  it.each([
    ["the key-vote flag", { isKeyVote: true }],
    ["a citizen impact", { citizenImpact: "Vos cotisations augmentent de 0,3 point." }],
  ])("indexes an amendment carrying %s", (_label, signal) => {
    expect(isIndexableScrutin({ ...BARE_AMENDMENT, ...signal })).toBe(true);
  });

  // Everything that is not an amendment decides a text or the fate of a government, which
  // is documentary value on its own: no prose required.
  it.each(["FINAL", "MOTION", "ARTICLE", "AUTRE"] as const)("indexes a bare %s scrutin", (type) => {
    expect(isIndexableScrutin({ ...BARE_AMENDMENT, type })).toBe(true);
  });

  // Fail-open, like the commune-population and MAIRE-without-commune fallbacks: a missing
  // signal must never silently deindex a page.
  it("indexes a scrutin whose type is unknown", () => {
    expect(isIndexableScrutin({ ...BARE_AMENDMENT, type: null })).toBe(true);
  });

  it("treats blank citizen impact as absent", () => {
    expect(isIndexableScrutin({ ...BARE_AMENDMENT, citizenImpact: "   " })).toBe(false);
    expect(isIndexableScrutin({ ...BARE_AMENDMENT, citizenImpact: "" })).toBe(false);
  });

  // Vote data is a precondition, not one signal among several: a scrutin with no ballot
  // recorded has nothing to show whatever else it carries. Applies to every type, so a
  // vote solennel with no tally recorded stays out too.
  it.each([
    ["an amendment with the key-vote flag", { isKeyVote: true }],
    ["an amendment with a citizen impact", { citizenImpact: "Un impact." }],
    ["a vote solennel", { type: "FINAL" as const }],
  ])("excludes %s when no ballot was recorded", (_label, signal) => {
    expect(isIndexableScrutin({ ...BARE_AMENDMENT, totalVotes: 0, ...signal })).toBe(false);
  });

  // Guard against the calibration regressing to signals a generator fills in bulk. The
  // summary and the APPROVED policy title are deliberately absent from ScrutinIndexSignals
  // (measured on production data: keying on them withheld zero pages), so this is enforced
  // by the type, and this test documents why the fields are not there.
  it("exposes only signals that require an editorial decision", () => {
    const keys = Object.keys(BARE_AMENDMENT).sort();
    expect(keys).toEqual(["citizenImpact", "isKeyVote", "totalVotes", "type"]);
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
