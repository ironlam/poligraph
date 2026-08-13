import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  verifyPassword: vi.fn(async () => true),
  createSession: vi.fn(async () => undefined),
  destroySession: vi.fn(async () => undefined),
}));
const limiter = vi.hoisted(() => ({
  checkLoginRateLimit: vi.fn(async () => ({ allowed: true, remaining: 4, retryAfter: 0 })),
  recordLoginFailure: vi.fn(async () => ({ allowed: true, remaining: 3, retryAfter: 0 })),
  clearLoginRateLimit: vi.fn(async () => undefined),
  LoginRateLimitUnavailableError: class extends Error {},
}));
const identity = vi.hoisted(() => ({
  resolveTrustedClientIdentity: vi.fn(() => "trusted-test-client"),
  TrustedClientIdentityError: class extends Error {},
}));

vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/rate-limit", () => limiter);
vi.mock("@/lib/trusted-client-identity", () => identity);

import { POST } from "../route";

function request(password = "test-credential"): NextRequest {
  return new NextRequest("http://localhost/api/admin/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

describe("SEC-04 distributed login protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.verifyPassword.mockResolvedValue(true);
    limiter.checkLoginRateLimit.mockResolvedValue({ allowed: true, remaining: 4, retryAfter: 0 });
    identity.resolveTrustedClientIdentity.mockReturnValue("trusted-test-client");
  });

  it("allows a normal login and clears the distributed failure budget", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(limiter.checkLoginRateLimit).toHaveBeenCalledWith("trusted-test-client");
    expect(auth.createSession).toHaveBeenCalledOnce();
    expect(limiter.clearLoginRateLimit).toHaveBeenCalledWith("trusted-test-client");
    expect(limiter.clearLoginRateLimit.mock.invocationCallOrder[0]).toBeLessThan(
      auth.createSession.mock.invocationCallOrder[0]!
    );
  });

  it("returns a generic credential failure", async () => {
    auth.verifyPassword.mockResolvedValue(false);
    const response = await POST(request("wrong"));
    expect(response.status).toBe(401);
    expect(limiter.recordLoginFailure).toHaveBeenCalledWith("trusted-test-client");
    expect(auth.createSession).not.toHaveBeenCalled();
  });

  it("stops before credential validation when the distributed limit denies", async () => {
    limiter.checkLoginRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfter: 60 });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(auth.verifyPassword).not.toHaveBeenCalled();
    expect(auth.createSession).not.toHaveBeenCalled();
  });

  it("fails closed before authentication when limiter infrastructure is unavailable", async () => {
    limiter.checkLoginRateLimit.mockRejectedValue(new limiter.LoginRateLimitUnavailableError());
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(auth.verifyPassword).not.toHaveBeenCalled();
    expect(auth.createSession).not.toHaveBeenCalled();
  });

  it("does not emit a session when the successful-login reset is unavailable", async () => {
    limiter.clearLoginRateLimit.mockRejectedValueOnce(new Error("test outage"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(auth.verifyPassword).toHaveBeenCalledOnce();
    expect(auth.createSession).not.toHaveBeenCalled();
  });

  it("fails closed before the limiter when trusted identity is unavailable", async () => {
    identity.resolveTrustedClientIdentity.mockImplementation(() => {
      throw new identity.TrustedClientIdentityError();
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(limiter.checkLoginRateLimit).not.toHaveBeenCalled();
    expect(auth.verifyPassword).not.toHaveBeenCalled();
  });
});
