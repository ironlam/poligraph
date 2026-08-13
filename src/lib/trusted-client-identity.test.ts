import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveTrustedClientIdentity,
  TrustedClientIdentityError,
} from "@/lib/trusted-client-identity";

describe("resolveTrustedClientIdentity", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the explicit Vercel identity contract in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const request = new Request("https://example.test", {
      headers: {
        "x-vercel-forwarded-for": "192.0.2.10",
        "x-forwarded-for": "198.51.100.20",
      },
    });
    expect(resolveTrustedClientIdentity(request)).toBe("192.0.2.10");
  });

  it("fails closed without the Vercel identity in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => resolveTrustedClientIdentity(new Request("https://example.test"))).toThrow(
      TrustedClientIdentityError
    );
  });

  it("uses an explicit non-network local identity outside production", () => {
    vi.stubEnv("VERCEL_ENV", "development");
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "untrusted-value" },
    });
    expect(resolveTrustedClientIdentity(request)).toBe("local-development");
  });
});
