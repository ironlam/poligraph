import { describe, expect, it } from "vitest";
import { getAffairPartyDisplay } from "../party-display";

const renaissance = {
  id: "party-ren",
  slug: "renaissance",
  shortName: "REN",
  name: "Renaissance",
  foundedDate: new Date("2016-04-06"),
};

const reconquete = {
  id: "party-rec",
  slug: "reconquete",
  shortName: "REC",
  name: "Reconquête",
  foundedDate: new Date("2021-04-30"),
};

const ump = {
  id: "party-ump",
  slug: "ump",
  shortName: "UMP",
  name: "Union pour un mouvement populaire",
  foundedDate: new Date("2002-11-17"),
};

describe("getAffairPartyDisplay", () => {
  it("prefers partyAtTime when set", () => {
    const result = getAffairPartyDisplay({
      factsDate: new Date("2005-01-01"),
      partyAtTime: ump,
      currentParty: renaissance,
    });
    expect(result).toEqual({
      kind: "at-time",
      party: ump,
      sameAsCurrent: false,
    });
  });

  it("flags at-time party as sameAsCurrent when ids match", () => {
    const result = getAffairPartyDisplay({
      factsDate: new Date("2024-01-01"),
      partyAtTime: renaissance,
      currentParty: renaissance,
    });
    expect(result.kind).toBe("at-time");
    if (result.kind === "at-time") {
      expect(result.sameAsCurrent).toBe(true);
    }
  });

  it("falls back to currentParty when partyAtTime is null and chronology is valid", () => {
    const result = getAffairPartyDisplay({
      factsDate: new Date("2024-06-15"),
      partyAtTime: null,
      currentParty: renaissance,
    });
    expect(result).toEqual({ kind: "current", party: renaissance });
  });

  it("returns unknown (pre-dates-current-party) when facts pre-date currentParty founding", () => {
    // The Zemmour Youssoupha 2009 case: facts are 2009-03-01, Reconquête was founded 2021-04-30.
    // Falling back to Reconquête would be a lie.
    const result = getAffairPartyDisplay({
      factsDate: new Date("2009-03-01"),
      partyAtTime: null,
      currentParty: reconquete,
    });
    expect(result.kind).toBe("unknown");
    if (result.kind === "unknown") {
      expect(result.reason).toBe("pre-dates-current-party");
      expect(result.currentPartyName).toBe("Reconquête");
      expect(result.currentPartyFoundedDate).toEqual(new Date("2021-04-30"));
    }
  });

  it("returns unknown (no-data) when no party is available at all", () => {
    const result = getAffairPartyDisplay({
      factsDate: new Date("2020-01-01"),
      partyAtTime: null,
      currentParty: null,
    });
    expect(result).toEqual({ kind: "unknown", reason: "no-data" });
  });

  it("falls back when currentParty has no foundedDate (unknown chronology -> permissive)", () => {
    // If we can't prove the party is post-dated, we allow the fallback.
    const independent = {
      id: "party-ind",
      shortName: "IND",
      name: "Indépendant",
      foundedDate: null,
    };
    const result = getAffairPartyDisplay({
      factsDate: new Date("1990-01-01"),
      partyAtTime: null,
      currentParty: independent,
    });
    expect(result).toEqual({ kind: "current", party: independent });
  });

  it("falls back when factsDate is null (unknown chronology -> permissive)", () => {
    const result = getAffairPartyDisplay({
      factsDate: null,
      partyAtTime: null,
      currentParty: reconquete,
    });
    expect(result).toEqual({ kind: "current", party: reconquete });
  });
});
