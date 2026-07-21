import { describe, it, expect } from "vitest";
import { partitionRevalidatable } from "../partition";

describe("partitionRevalidatable", () => {
  it("puts a found APPROVED row in toRevalidate", () => {
    const result = partitionRevalidatable(["sc-1"], [{ id: "sc-1", status: "APPROVED" }]);
    expect(result.toRevalidate).toEqual(["sc-1"]);
    expect(result.skipped).toEqual([]);
  });

  it("skips a found row with a non-APPROVED status as not_approved", () => {
    for (const status of ["DRAFT", "NEEDS_REVIEW", "STALE", "REJECTED"]) {
      const result = partitionRevalidatable(["sc-1"], [{ id: "sc-1", status }]);
      expect(result.toRevalidate).toEqual([]);
      expect(result.skipped).toEqual([{ id: "sc-1", reason: "not_approved" }]);
    }
  });

  it("skips a null status (no policy title yet) as not_approved", () => {
    const result = partitionRevalidatable(["sc-1"], [{ id: "sc-1", status: null }]);
    expect(result.toRevalidate).toEqual([]);
    expect(result.skipped).toEqual([{ id: "sc-1", reason: "not_approved" }]);
  });

  it("skips an id missing from rows as not_found", () => {
    const result = partitionRevalidatable(["sc-missing"], []);
    expect(result.toRevalidate).toEqual([]);
    expect(result.skipped).toEqual([{ id: "sc-missing", reason: "not_found" }]);
  });

  it("handles a mixed set of ids", () => {
    const result = partitionRevalidatable(
      ["sc-approved", "sc-draft", "sc-missing"],
      [
        { id: "sc-approved", status: "APPROVED" },
        { id: "sc-draft", status: "DRAFT" },
      ]
    );
    expect(result.toRevalidate).toEqual(["sc-approved"]);
    expect(result.skipped).toEqual([
      { id: "sc-draft", reason: "not_approved" },
      { id: "sc-missing", reason: "not_found" },
    ]);
  });
});
