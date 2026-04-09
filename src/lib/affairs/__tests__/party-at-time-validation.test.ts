import { describe, expect, it } from "vitest";
import { isValidPartyAtTime, validatePartyAtTime } from "../party-at-time-validation";

describe("validatePartyAtTime", () => {
  it("accepts when facts occurred after party was founded", () => {
    const result = validatePartyAtTime({
      factsDate: new Date("2022-05-15"),
      partyFoundedDate: new Date("2021-04-30"),
    });
    expect(result).toEqual({ valid: true });
  });

  it("rejects when facts occurred before party was founded", () => {
    // The real Zemmour 2009 Youssoupha case that triggered issue #303:
    // partyAtTime = Reconquête (founded 2021-04-30), factsDate = 2009-03-01
    const result = validatePartyAtTime({
      factsDate: new Date("2009-03-01"),
      partyFoundedDate: new Date("2021-04-30"),
    });
    expect(result).toEqual({
      valid: false,
      reason: "party_founded_after_facts",
    });
  });

  it("accepts when facts occurred on the exact founding day", () => {
    const day = new Date("2021-04-30");
    const result = validatePartyAtTime({
      factsDate: day,
      partyFoundedDate: day,
    });
    expect(result).toEqual({ valid: true });
  });

  it("rejects when facts occurred after party was dissolved", () => {
    const result = validatePartyAtTime({
      factsDate: new Date("2020-01-01"),
      partyFoundedDate: new Date("2000-01-01"),
      partyDissolvedDate: new Date("2015-05-30"),
    });
    expect(result).toEqual({
      valid: false,
      reason: "party_dissolved_before_facts",
    });
  });

  it("accepts when facts occurred before party was dissolved", () => {
    const result = validatePartyAtTime({
      factsDate: new Date("2010-05-15"),
      partyFoundedDate: new Date("2000-01-01"),
      partyDissolvedDate: new Date("2015-05-30"),
    });
    expect(result).toEqual({ valid: true });
  });

  it("defaults to valid when factsDate is null (unknown)", () => {
    const result = validatePartyAtTime({
      factsDate: null,
      partyFoundedDate: new Date("2021-04-30"),
    });
    expect(result).toEqual({ valid: true });
  });

  it("defaults to valid when partyFoundedDate is null (unknown)", () => {
    const result = validatePartyAtTime({
      factsDate: new Date("2009-03-01"),
      partyFoundedDate: null,
    });
    expect(result).toEqual({ valid: true });
  });

  it("defaults to valid when both dates are null", () => {
    const result = validatePartyAtTime({
      factsDate: null,
      partyFoundedDate: null,
    });
    expect(result).toEqual({ valid: true });
  });
});

describe("isValidPartyAtTime", () => {
  it("returns false for the Zemmour Reconquête 2009 regression", () => {
    expect(
      isValidPartyAtTime({
        factsDate: new Date("2009-03-01"),
        partyFoundedDate: new Date("2021-04-30"),
      })
    ).toBe(false);
  });

  it("returns true when both dates are consistent", () => {
    expect(
      isValidPartyAtTime({
        factsDate: new Date("2024-01-01"),
        partyFoundedDate: new Date("2021-04-30"),
      })
    ).toBe(true);
  });
});
