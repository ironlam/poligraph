import { describe, it, expect } from "vitest";
import {
  isLinkingStalled,
  isIngestionAnomaly,
  partitionUnlinkedVotes,
} from "@/lib/monitoring/amendment-link-freshness";
import { linkableUnlinkedVoteWhere } from "@/lib/monitoring/amendment-link-query";

const MAX_LAG = 48;
const ABS = 20;
const stalledFromCount = (count: number) =>
  isLinkingStalled({
    lagHours: 240,
    recentLinkableUnlinked: count,
    maxLagHours: MAX_LAG,
    absoluteUnlinkedThreshold: ABS,
  });

describe("isLinkingStalled", () => {
  it("lag beyond threshold + linkable unlinked votes remain -> stalled", () => {
    expect(
      isLinkingStalled({
        lagHours: 72,
        recentLinkableUnlinked: 5,
        maxLagHours: 48,
        absoluteUnlinkedThreshold: 20,
      })
    ).toBe(true);
  });

  it("lag beyond threshold but nothing linkable unlinked (recess) -> not stalled", () => {
    expect(
      isLinkingStalled({
        lagHours: 72,
        recentLinkableUnlinked: 0,
        maxLagHours: 48,
        absoluteUnlinkedThreshold: 20,
      })
    ).toBe(false);
  });

  it("lag within threshold, even with linkable unlinked votes -> not stalled", () => {
    expect(
      isLinkingStalled({
        lagHours: 24,
        recentLinkableUnlinked: 5,
        maxLagHours: 48,
        absoluteUnlinkedThreshold: 20,
      })
    ).toBe(false);
  });

  it("lag within threshold but large recentLinkableUnlinked backlog -> stalled (absolute threshold)", () => {
    expect(
      isLinkingStalled({
        lagHours: 2,
        recentLinkableUnlinked: 25,
        maxLagHours: 48,
        absoluteUnlinkedThreshold: 20,
      })
    ).toBe(true);
  });
});

describe("isIngestionAnomaly", () => {
  it("feed unchanged (304) -> never an anomaly, even with linkable votes unlinked", () => {
    expect(
      isIngestionAnomaly({ notModified: true, created: 0, updated: 0, recentLinkableUnlinked: 50 })
    ).toBe(false);
  });

  it("feed processed and something was created -> not an anomaly", () => {
    expect(
      isIngestionAnomaly({ notModified: false, created: 3, updated: 0, recentLinkableUnlinked: 50 })
    ).toBe(false);
  });

  it("feed processed and something was updated -> not an anomaly", () => {
    expect(
      isIngestionAnomaly({ notModified: false, created: 0, updated: 7, recentLinkableUnlinked: 50 })
    ).toBe(false);
  });

  it("feed processed, nothing ingested, linkable recent votes remain unlinked -> anomaly", () => {
    expect(
      isIngestionAnomaly({ notModified: false, created: 0, updated: 0, recentLinkableUnlinked: 3 })
    ).toBe(true);
  });

  it("feed processed, nothing ingested, no linkable unlinked votes (steady-state full pass) -> no anomaly", () => {
    expect(
      isIngestionAnomaly({ notModified: false, created: 0, updated: 0, recentLinkableUnlinked: 0 })
    ).toBe(false);
  });
});

describe("partitionUnlinkedVotes — confirmed-unresolvable exclusion", () => {
  it("a vote in the confirmed-unresolvable set does NOT feed the blocking count (-> not stalled)", () => {
    const set = new Set(["VTANR5L17V0001"]);
    const { blocking, confirmedUnresolvable } = partitionUnlinkedVotes(["VTANR5L17V0001"], set);
    expect(blocking).toEqual([]);
    expect(confirmedUnresolvable).toEqual(["VTANR5L17V0001"]);
    expect(stalledFromCount(blocking.length)).toBe(false);
  });

  it("an unclassified unlinked vote DOES feed the blocking count (-> stalled)", () => {
    const set = new Set(["VTANR5L17V0001"]);
    const { blocking } = partitionUnlinkedVotes(["VTANR5L17V0001", "VTANR5L17V9999"], set);
    expect(blocking).toEqual(["VTANR5L17V9999"]);
    expect(stalledFromCount(blocking.length)).toBe(true);
  });

  it("a NEW unresolved vote appearing next to a classified one re-trips the signal", () => {
    // Start: the only unlinked vote is classified -> not stalled.
    const set = new Set(["VTANR5L17V0001"]);
    expect(stalledFromCount(partitionUnlinkedVotes(["VTANR5L17V0001"], set).blocking.length)).toBe(
      false
    );
    // A brand-new unlinked vote appears; it is NOT in the config -> stalled again.
    const after = partitionUnlinkedVotes(["VTANR5L17V0001", "VTANR5L17V0002"], set);
    expect(after.blocking).toEqual(["VTANR5L17V0002"]);
    expect(stalledFromCount(after.blocking.length)).toBe(true);
  });

  it("exclusion is by id only, never by age: order/age of ids is irrelevant", () => {
    const set = new Set<string>();
    const { blocking, confirmedUnresolvable } = partitionUnlinkedVotes(["A", "B", "C"], set);
    expect(blocking).toEqual(["A", "B", "C"]);
    expect(confirmedUnresolvable).toEqual([]);
  });
});

describe("linkableUnlinkedVoteWhere — shared where-fragment", () => {
  it("excludes the confirmed-unresolvable ids via externalId NOT IN", () => {
    const where = linkableUnlinkedVoteWhere({
      legislature: 17,
      chamber: "AN",
      unresolvableIds: ["VTANR5L17V0001"],
    });
    expect(where.externalId).toEqual({ notIn: ["VTANR5L17V0001"] });
    expect(where.type).toBe("AMENDEMENT");
    expect(where.dossierLegislatifId).toEqual({ not: null });
    expect(where.amendmentLinks).toEqual({ none: {} });
  });

  it("adds no exclusion when the set is empty (unclassified votes stay in scope)", () => {
    const where = linkableUnlinkedVoteWhere({ legislature: 17, unresolvableIds: [] });
    expect(where.externalId).toBeUndefined();
  });
});
