import { describe, expect, it } from "vitest";
import { isFailure, type ProbeResult } from "../audit-source-urls";

const source = {
  url: "https://example.com/source.csv",
  service: "sync:example",
  kind: "csv" as const,
};

function result(overrides: Partial<ProbeResult>): ProbeResult {
  return {
    ...source,
    status: 200,
    method: "HEAD",
    bytes: 1024,
    redirected: false,
    location: null,
    error: null,
    skipped: false,
    ...overrides,
  };
}

describe("isFailure", () => {
  it("detects a dead 404 response with a tiny body", () => {
    expect(isFailure(result({ status: 404, bytes: 146 }))).toBe(true);
  });

  it("detects redirects even when the provider answers with a 3xx", () => {
    expect(isFailure(result({ status: 302, redirected: true }))).toBe(true);
  });

  it("does not fail a skipped secret-backed API locally", () => {
    expect(isFailure(result({ status: null, skipped: true, method: "SKIP" }))).toBe(false);
  });
});
