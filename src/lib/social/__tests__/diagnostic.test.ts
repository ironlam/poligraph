import { describe, expect, it } from "vitest";
import { XRPCError } from "@atproto/xrpc";
import { ApiRequestError, ApiResponseError } from "twitter-api-v2";
import { diagnoseBlueskyError, diagnoseXError, MissingSocialConfigError } from "../diagnostic";

function xResponseError(code: number, data: Record<string, unknown>, rateLimit?: object) {
  return new ApiResponseError(`Request failed with code ${code}`, {
    code,
    data: data as never,
    headers: {},
    rateLimit: rateLimit as never,
    request: {} as never,
    response: {} as never,
  });
}

describe("diagnoseXError", () => {
  it("reads a 401 as revoked or expired keys", () => {
    const diagnostic = diagnoseXError(xResponseError(401, { title: "Unauthorized" }));
    expect(diagnostic.code).toBe("INVALID_CREDENTIALS");
    expect(diagnostic.reessayable).toBe(false);
    expect(diagnostic.action).toContain("Régénérer");
  });

  it("reads a 402 credits-depleted problem as an empty pay-per-use balance", () => {
    const diagnostic = diagnoseXError(
      xResponseError(402, {
        title: "Payment Required",
        type: "https://api.x.com/2/problems/credits-depleted",
      })
    );
    expect(diagnostic.code).toBe("CREDITS_DEPLETED");
  });

  it("separates a duplicate post from a permission problem on 403", () => {
    expect(
      diagnoseXError(
        xResponseError(403, {
          detail: "You are not allowed to create a Tweet with duplicate content.",
        })
      ).code
    ).toBe("DUPLICATE_CONTENT");
    expect(
      diagnoseXError(
        xResponseError(403, {
          detail:
            "Your client app is not configured with the appropriate oauth1 app permissions for this endpoint.",
        })
      ).code
    ).toBe("INSUFFICIENT_PERMISSIONS");
  });

  it("reports the reset time of a rate limit and marks it retryable", () => {
    const diagnostic = diagnoseXError(
      xResponseError(429, { title: "Too Many Requests" }, { limit: 1, remaining: 0, reset: 1 })
    );
    expect(diagnostic.code).toBe("RATE_LIMITED");
    expect(diagnostic.reessayable).toBe(true);
    expect(diagnostic.message).toMatch(/jusqu'à/);
  });

  it("treats 5xx as a provider outage and transport failures as network errors", () => {
    expect(diagnoseXError(xResponseError(503, {})).code).toBe("PROVIDER_UNAVAILABLE");
    const transport = new ApiRequestError("Request failed", {
      request: {} as never,
      error: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }),
    });
    expect(diagnoseXError(transport).code).toBe("NETWORK_ERROR");
  });

  it("names the missing variables", () => {
    const diagnostic = diagnoseXError(new MissingSocialConfigError(["TWITTER_API_KEY"]));
    expect(diagnostic.code).toBe("MISSING_CONFIG");
    expect(diagnostic.detail).toContain("TWITTER_API_KEY");
  });

  it("keeps the raw detail short", () => {
    const diagnostic = diagnoseXError(xResponseError(400, { detail: "x".repeat(2000) }));
    expect(diagnostic.code).toBe("CONTENT_REJECTED");
    expect(diagnostic.detail!.length).toBeLessThanOrEqual(300);
  });
});

describe("diagnoseBlueskyError", () => {
  it("reads a rejected login as a revoked app password", () => {
    const diagnostic = diagnoseBlueskyError(
      new XRPCError(401, "AuthenticationRequired", "Invalid identifier or password")
    );
    expect(diagnostic.code).toBe("INVALID_CREDENTIALS");
    expect(diagnostic.action).toContain("mot de passe d'application");
  });

  it("recognises a takedown before the generic 400", () => {
    expect(diagnoseBlueskyError(new XRPCError(400, "AccountTakedown", "taken down")).code).toBe(
      "ACCOUNT_SUSPENDED"
    );
  });

  it("maps rate limits, rejected content and outages", () => {
    expect(diagnoseBlueskyError(new XRPCError(429, "RateLimitExceeded")).code).toBe("RATE_LIMITED");
    expect(diagnoseBlueskyError(new XRPCError(400, "InvalidRequest", "too long")).code).toBe(
      "CONTENT_REJECTED"
    );
    expect(diagnoseBlueskyError(new XRPCError(502, "UpstreamFailure")).code).toBe(
      "PROVIDER_UNAVAILABLE"
    );
  });

  it("reads a request that never got a response as a network error", () => {
    expect(diagnoseBlueskyError(new XRPCError(1)).code).toBe("NETWORK_ERROR");
  });
});
