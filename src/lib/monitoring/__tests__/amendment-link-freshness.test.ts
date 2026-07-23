import { describe, it, expect } from "vitest";
import { isLinkingStalled, isIngestionAnomaly } from "@/lib/monitoring/amendment-link-freshness";

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
