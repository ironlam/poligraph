import { describe, expect, it } from "vitest";
import { safeJsonParse } from "./safe-json";

describe("safeJsonParse", () => {
  it("returns parsed data for valid JSON", () => {
    expect(safeJsonParse<{ ok: boolean }>('{"ok":true}')).toEqual({
      success: true,
      data: { ok: true },
    });
  });

  it("returns a failure result for invalid JSON", () => {
    expect(safeJsonParse("{")).toEqual({ success: false });
  });
});
