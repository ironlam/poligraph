import { describe, it, expect } from "vitest";
import {
  isProductionRuntime,
  resolveRateLimitMode,
  degradedActionForTier,
  shouldEmitDegradedAlert,
} from "./degraded-mode";

/**
 * Lot 3A: the rate-limit middleware used to fall back silently when Upstash was
 * unconfigured. These tests lock in the explicit degraded-mode decision logic:
 * dev allows through quietly, production allows through with a throttled alert,
 * and the export tier fails closed in production only.
 */
describe("isProductionRuntime", () => {
  it("trusts VERCEL_ENV when present", () => {
    expect(isProductionRuntime({ VERCEL_ENV: "production" })).toBe(true);
    expect(isProductionRuntime({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isProductionRuntime({ VERCEL_ENV: "development" })).toBe(false);
  });

  it("falls back to NODE_ENV only when VERCEL_ENV is absent", () => {
    expect(isProductionRuntime({ NODE_ENV: "production" })).toBe(true);
    expect(isProductionRuntime({ NODE_ENV: "development" })).toBe(false);
    expect(isProductionRuntime({})).toBe(false);
  });

  it("a preview build (NODE_ENV=production, VERCEL_ENV=preview) is not production", () => {
    expect(isProductionRuntime({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(false);
  });
});

describe("resolveRateLimitMode", () => {
  it("enforces when a limiter is available, regardless of environment", () => {
    expect(resolveRateLimitMode(true, true)).toBe("enforced");
    expect(resolveRateLimitMode(true, false)).toBe("enforced");
  });

  it("degrades to prod mode when the limiter is missing in production", () => {
    expect(resolveRateLimitMode(false, true)).toBe("degraded-prod");
  });

  it("degrades to dev mode when the limiter is missing outside production", () => {
    expect(resolveRateLimitMode(false, false)).toBe("degraded-dev");
  });
});

describe("degradedActionForTier", () => {
  it("fails the export tier closed in production (heavy abuse vector)", () => {
    expect(degradedActionForTier("degraded-prod", "export")).toBe("block");
  });

  it("fails the anonymous feedback form closed in production (public write endpoint)", () => {
    expect(degradedActionForTier("degraded-prod", "feedback")).toBe("block");
    expect(degradedActionForTier("degraded-dev", "feedback")).toBe("allow");
  });

  it("never locks operators out of admin, nor breaks public search", () => {
    expect(degradedActionForTier("degraded-prod", "admin")).toBe("allow");
    expect(degradedActionForTier("degraded-prod", "search")).toBe("allow");
    expect(degradedActionForTier("degraded-prod", "general")).toBe("allow");
    expect(degradedActionForTier("degraded-prod", "subscribe")).toBe("allow");
  });

  it("never fails closed outside production (dev keeps working)", () => {
    expect(degradedActionForTier("degraded-dev", "export")).toBe("allow");
  });

  it("allows through when enforcing (the limiter handles it)", () => {
    expect(degradedActionForTier("enforced", "export")).toBe("allow");
  });
});

describe("shouldEmitDegradedAlert (throttle, no per-request spam)", () => {
  const THROTTLE = 5 * 60 * 1000;

  it("always emits the very first alert", () => {
    expect(shouldEmitDegradedAlert(null, 1_000, THROTTLE)).toBe(true);
  });

  it("suppresses alerts inside the throttle window", () => {
    expect(shouldEmitDegradedAlert(1_000, 1_000 + THROTTLE - 1, THROTTLE)).toBe(false);
  });

  it("emits again once the throttle window has elapsed", () => {
    expect(shouldEmitDegradedAlert(1_000, 1_000 + THROTTLE, THROTTLE)).toBe(true);
  });
});
