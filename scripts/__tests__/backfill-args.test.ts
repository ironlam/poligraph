import { describe, it, expect } from "vitest";
import { parseBackfillArgs } from "../backfill-scrutin-dossier-477";

describe("parseBackfillArgs", () => {
  it("defaults to dry-run", () => {
    expect(parseBackfillArgs([]).apply).toBe(false);
  });
  it("requires --confirm-production alongside --apply", () => {
    expect(() => parseBackfillArgs(["--apply"])).toThrow(/confirm-production/);
  });
  it("parses expectations and flags", () => {
    const a = parseBackfillArgs([
      "--apply",
      "--confirm-production",
      "--apply-clears",
      "--regenerate",
      "--expected-repoints=1080",
    ]);
    expect(a).toMatchObject({
      apply: true,
      applyClears: true,
      regenerate: true,
      expectedRepoints: 1080,
    });
  });
});
