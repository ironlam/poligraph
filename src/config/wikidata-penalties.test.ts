import { describe, it, expect } from "vitest";
import { mapWikidataPenalty, parseDurationToMonths } from "./wikidata-penalties";

describe("mapWikidataPenalty", () => {
  it("maps prison Q-ID to prisonMonths field", () => {
    const result = mapWikidataPenalty("Q853735");
    // Wikidata says « emprisonnement », not « emprisonnement ferme ». The mapping used to
    // add `suspended: false` here, which is an assertion the source does not carry.
    expect(result).toEqual({ field: "prisonMonths" });
  });

  it("maps sursis Q-ID to prisonMonths with fullySuspended", () => {
    const result = mapWikidataPenalty("Q4737759");
    expect(result).toEqual({ field: "prisonMonths", fullySuspended: true });
  });

  it("maps amende Q-ID to fineAmount", () => {
    const result = mapWikidataPenalty("Q1243001");
    expect(result).toEqual({ field: "fineAmount" });
  });

  it("maps ineligibilite Q-ID to ineligibilityMonths", () => {
    const result = mapWikidataPenalty("Q16643987");
    expect(result).toEqual({ field: "ineligibilityMonths" });
  });

  it("maps TIG Q-ID to communityService", () => {
    const result = mapWikidataPenalty("Q4820670");
    expect(result).toEqual({ field: "communityService" });
  });

  it("maps bracelet to otherSentence", () => {
    const result = mapWikidataPenalty("Q108476309");
    expect(result).toEqual({ field: "otherSentence", label: "Bracelet électronique" });
  });

  it("maps perpetuite to prisonMonths with fixedMonths=9999", () => {
    const result = mapWikidataPenalty("Q68676");
    expect(result).toEqual({ field: "prisonMonths", fixedMonths: 9999 });
  });

  it("returns null for unknown Q-ID", () => {
    expect(mapWikidataPenalty("Q999999999")).toBeNull();
  });
});

describe("parseDurationToMonths", () => {
  it("converts years to months", () => {
    expect(parseDurationToMonths("2", "http://www.wikidata.org/entity/Q577")).toBe(24);
  });

  it("converts months directly", () => {
    expect(parseDurationToMonths("6", "http://www.wikidata.org/entity/Q5151")).toBe(6);
  });

  it("converts days to months (rounded up)", () => {
    expect(parseDurationToMonths("45", "http://www.wikidata.org/entity/Q573")).toBe(2);
  });

  it("returns null for unknown unit", () => {
    expect(parseDurationToMonths("5", "http://www.wikidata.org/entity/Q999")).toBeNull();
  });

  it("handles string amounts with + prefix", () => {
    expect(parseDurationToMonths("+3", "http://www.wikidata.org/entity/Q577")).toBe(36);
  });
});
