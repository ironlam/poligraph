import { describe, it, expect, vi } from "vitest";

vi.mock("../../client", () => ({ inngest: { createFunction: vi.fn(() => ({})) } }));

import { readPerRun } from "../regenerate-legacy-impacts";

describe("readPerRun", () => {
  it("defaults to 50 when the variable is unset or empty", () => {
    expect(readPerRun(undefined)).toBe(50);
    expect(readPerRun("")).toBe(50);
    expect(readPerRun("  ")).toBe(50);
  });

  it("reads a number, and 0 switches the job off", () => {
    expect(readPerRun("100")).toBe(100);
    expect(readPerRun("0")).toBe(0);
  });

  it("falls back to the default on a value it cannot read", () => {
    expect(readPerRun("beaucoup")).toBe(50);
    expect(readPerRun("-5")).toBe(50);
    expect(readPerRun("12.5")).toBe(50);
  });
});
