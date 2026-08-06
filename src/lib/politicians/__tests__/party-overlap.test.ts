import { describe, it, expect } from "vitest";
import { findOverlaps, type AffiliationInterval } from "@/lib/politicians/party-overlap";

function interval(
  partyId: string,
  startDate: string | null,
  endDate: string | null
): AffiliationInterval {
  return {
    partyId,
    partyShortName: partyId.toUpperCase(),
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
  };
}

describe("findOverlaps", () => {
  it("reports an affiliation covering the candidate period", () => {
    const result = findOverlaps(interval("ps", "2000-01-01", "2010-01-01"), [
      interval("lr", "2005-01-01", "2015-01-01"),
    ]);

    expect(result).toEqual([
      {
        type: "OVERLAP",
        partyId: "lr",
        partyShortName: "LR",
        startDate: new Date("2005-01-01").toISOString(),
        endDate: new Date("2015-01-01").toISOString(),
      },
    ]);
  });

  // Intervals are half-open, [start, end[. A succession sets the previous endDate to the
  // new startDate, and that seam must not read as a conflict.
  it("does not report affiliations that meet edge to edge", () => {
    expect(
      findOverlaps(interval("tdp", "2020-01-01", null), [
        interval("ps", "1997-06-03", "2020-01-01"),
      ])
    ).toEqual([]);
  });

  it("treats a null endDate as open ended", () => {
    expect(
      findOverlaps(interval("tdp", "2020-01-01", null), [interval("ps", "1997-06-03", null)])
    ).toHaveLength(1);
  });

  it("treats a null startDate as reaching back indefinitely", () => {
    expect(
      findOverlaps(interval("ps", null, "2018-01-01"), [interval("lr", "1990-01-01", "1995-01-01")])
    ).toHaveLength(1);
  });

  it("reports nothing for disjoint periods", () => {
    expect(
      findOverlaps(interval("ps", "1997-01-01", "2018-01-01"), [
        interval("tdp", "2020-01-01", null),
      ])
    ).toEqual([]);
  });

  it("reports every conflicting affiliation", () => {
    expect(
      findOverlaps(interval("ps", null, null), [
        interval("lr", "1990-01-01", "1995-01-01"),
        interval("tdp", "2020-01-01", null),
      ])
    ).toHaveLength(2);
  });

  it("returns an empty list when there is nothing to compare against", () => {
    expect(findOverlaps(interval("ps", "1997-01-01", null), [])).toEqual([]);
  });
});
