import { describe, it, expect } from "vitest";
import { isLinkingStalled, isIngestionAnomaly } from "@/lib/monitoring/amendment-link-freshness";

describe("isLinkingStalled", () => {
  it("lag beyond threshold + linkable unlinked votes remain -> stalled", () => {
    expect(isLinkingStalled({ lagHours: 72, recentLinkableUnlinked: 5, maxLagHours: 48 })).toBe(
      true
    );
  });

  it("lag beyond threshold but nothing linkable unlinked (recess) -> not stalled", () => {
    expect(isLinkingStalled({ lagHours: 72, recentLinkableUnlinked: 0, maxLagHours: 48 })).toBe(
      false
    );
  });

  it("lag within threshold, even with linkable unlinked votes -> not stalled", () => {
    expect(isLinkingStalled({ lagHours: 24, recentLinkableUnlinked: 5, maxLagHours: 48 })).toBe(
      false
    );
  });
});

describe("isIngestionAnomaly", () => {
  it("feed unchanged (304) -> never an anomaly, even if entriesSeen > db count", () => {
    expect(
      isIngestionAnomaly({
        notModified: true,
        entriesSeen: 1000,
        created: 0,
        updated: 0,
        dbAmendmentCount: 10,
        recentLinkableUnlinked: 50,
      })
    ).toBe(false);
  });

  it("feed processed and something was created -> not an anomaly", () => {
    expect(
      isIngestionAnomaly({
        notModified: false,
        entriesSeen: 100,
        created: 3,
        updated: 0,
        dbAmendmentCount: 10,
        recentLinkableUnlinked: 50,
      })
    ).toBe(false);
  });

  it("feed processed, nothing created/updated, ZIP has more entries than DB reflects -> anomaly", () => {
    expect(
      isIngestionAnomaly({
        notModified: false,
        entriesSeen: 100,
        created: 0,
        updated: 0,
        dbAmendmentCount: 10,
        recentLinkableUnlinked: 0,
      })
    ).toBe(true);
  });

  it("feed processed, nothing created/updated, entriesSeen matches DB but linkable votes remain unlinked -> anomaly", () => {
    expect(
      isIngestionAnomaly({
        notModified: false,
        entriesSeen: 10,
        created: 0,
        updated: 0,
        dbAmendmentCount: 10,
        recentLinkableUnlinked: 3,
      })
    ).toBe(true);
  });

  it("feed processed, nothing created/updated, entriesSeen matches DB, no linkable unlinked votes -> no anomaly", () => {
    expect(
      isIngestionAnomaly({
        notModified: false,
        entriesSeen: 10,
        created: 0,
        updated: 0,
        dbAmendmentCount: 10,
        recentLinkableUnlinked: 0,
      })
    ).toBe(false);
  });
});
