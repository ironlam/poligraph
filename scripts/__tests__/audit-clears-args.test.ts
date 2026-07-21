import { describe, it, expect } from "vitest";
import { parseAuditArgs } from "../audit-clears-477";

describe("parseAuditArgs", () => {
  it("throws when --report= is missing", () => {
    expect(() => parseAuditArgs([])).toThrow(/--report=<path> is required/);
  });

  it("parses --report=<path>", () => {
    const a = parseAuditArgs(["--report=scripts/.local/backfill-477-report.json"]);
    expect(a.reportPath).toBe("scripts/.local/backfill-477-report.json");
  });

  it("defaults --out= when absent", () => {
    const a = parseAuditArgs(["--report=scripts/.local/backfill-477-report.json"]);
    expect(a.outPath).toBe("scripts/.local/clears-audit-477.enriched.json");
  });

  it("parses an explicit --out=<path>", () => {
    const a = parseAuditArgs([
      "--report=scripts/.local/backfill-477-report.json",
      "--out=scripts/.local/custom-audit.json",
    ]);
    expect(a.outPath).toBe("scripts/.local/custom-audit.json");
  });
});
