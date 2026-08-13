import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));

import {
  ADMIN_COOKIE_NAME,
  SESSION_DURATION,
  getSessionAssurance,
  resetSessionEpochHighWaterForTests,
  signSessionToken,
  validateSessionToken,
  verifySessionToken,
} from "@/lib/auth-token";
import { createSession } from "@/lib/auth";

const CURRENT_SECRET = "current-session-secret-for-sec-04-tests-only";
const NOW = Date.parse("2026-08-13T08:00:00.000Z");

function configureSession(epoch = 7): void {
  process.env.ADMIN_SESSION_SECRET = CURRENT_SECRET;
  process.env.ADMIN_SESSION_KEY_ID = "current-test-key";
  process.env.ADMIN_SESSION_EPOCH = String(epoch);
}

function clearSessionEnvironment(): void {
  for (const name of [
    "ADMIN_PASSWORD",
    "ADMIN_SESSION_SECRET",
    "ADMIN_SESSION_KEY_ID",
    "ADMIN_SESSION_EPOCH",
    "ADMIN_SESSION_PREVIOUS_SECRET",
    "ADMIN_SESSION_PREVIOUS_KEY_ID",
    "ADMIN_SESSION_PREVIOUS_ISSUED_BEFORE",
  ]) {
    delete process.env[name];
  }
}

describe("SEC-04 admin session policy", () => {
  beforeEach(() => {
    clearSessionEnvironment();
    resetSessionEpochHighWaterForTests();
    configureSession();
    process.env.ADMIN_PASSWORD = "independent-primary-credential";
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    cookieStore.set.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearSessionEnvironment();
  });

  it("fails closed when session configuration is absent or invalid", async () => {
    delete process.env.ADMIN_SESSION_SECRET;
    expect(() => signSessionToken()).toThrow();
    await expect(createSession()).rejects.toThrow();
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(verifySessionToken("opaque-invalid-token")).toBe(false);
  });

  it("keeps the session secret independent from the primary credential", () => {
    const token = signSessionToken();
    process.env.ADMIN_PASSWORD = "rotated-primary-credential";
    expect(verifySessionToken(token)).toBe(true);
  });

  it.each([
    [SESSION_DURATION * 1000 - 1, true],
    [SESSION_DURATION * 1000, false],
    [SESSION_DURATION * 1000 + 1, false],
  ])("enforces the exact fixed lifetime at age %i", (age, expected) => {
    const token = signSessionToken(NOW - age);
    expect(verifySessionToken(token)).toBe(expected);
  });

  it("rejects future and internally inconsistent timestamps", () => {
    expect(verifySessionToken(signSessionToken(NOW + 1))).toBe(false);
    const token = signSessionToken();
    const [encodedClaims, signature] = token.split(".");
    const claims = JSON.parse(Buffer.from(encodedClaims!, "base64url").toString("utf8"));
    claims.expiresAt += 1;
    const altered = Buffer.from(JSON.stringify(claims)).toString("base64url");
    expect(verifySessionToken(`${altered}.${signature}`)).toBe(false);
  });

  it("accepts only the current epoch and detects an in-process rollback", () => {
    const token = signSessionToken();
    process.env.ADMIN_SESSION_EPOCH = "8";
    expect(verifySessionToken(token)).toBe(false);
    process.env.ADMIN_SESSION_EPOCH = "7";
    expect(verifySessionToken(token)).toBe(false);
  });

  it("supports a bounded previous-key transition and then retirement", () => {
    const historical = signSessionToken(NOW - 1);
    process.env.ADMIN_SESSION_SECRET = "new-current-session-secret-for-tests-only";
    process.env.ADMIN_SESSION_KEY_ID = "new-current-key";
    process.env.ADMIN_SESSION_PREVIOUS_SECRET = CURRENT_SECRET;
    process.env.ADMIN_SESSION_PREVIOUS_KEY_ID = "current-test-key";
    process.env.ADMIN_SESSION_PREVIOUS_ISSUED_BEFORE = new Date(NOW).toISOString();

    expect(verifySessionToken(historical)).toBe(true);
    const newlyIssuedWithOldKey = (() => {
      process.env.ADMIN_SESSION_SECRET = CURRENT_SECRET;
      process.env.ADMIN_SESSION_KEY_ID = "current-test-key";
      delete process.env.ADMIN_SESSION_PREVIOUS_SECRET;
      delete process.env.ADMIN_SESSION_PREVIOUS_KEY_ID;
      delete process.env.ADMIN_SESSION_PREVIOUS_ISSUED_BEFORE;
      return signSessionToken(NOW);
    })();
    process.env.ADMIN_SESSION_SECRET = "new-current-session-secret-for-tests-only";
    process.env.ADMIN_SESSION_KEY_ID = "new-current-key";
    process.env.ADMIN_SESSION_PREVIOUS_SECRET = CURRENT_SECRET;
    process.env.ADMIN_SESSION_PREVIOUS_KEY_ID = "current-test-key";
    process.env.ADMIN_SESSION_PREVIOUS_ISSUED_BEFORE = new Date(NOW).toISOString();
    expect(verifySessionToken(newlyIssuedWithOldKey)).toBe(false);

    delete process.env.ADMIN_SESSION_PREVIOUS_SECRET;
    delete process.env.ADMIN_SESSION_PREVIOUS_KEY_ID;
    delete process.env.ADMIN_SESSION_PREVIOUS_ISSUED_BEFORE;
    expect(verifySessionToken(historical)).toBe(false);
  });

  it("fails closed on an incomplete rotation configuration", () => {
    const token = signSessionToken();
    process.env.ADMIN_SESSION_PREVIOUS_SECRET = "incomplete-previous-session-secret-for-tests-only";
    expect(() => signSessionToken()).toThrow();
    expect(verifySessionToken(token)).toBe(false);
  });

  it("requires full assurance while exposing the future MFA states", () => {
    const primary = signSessionToken(NOW, "primary_authenticated");
    const full = signSessionToken(NOW, "fully_authenticated");
    expect(getSessionAssurance("invalid")).toBe("unauthenticated");
    expect(getSessionAssurance(primary)).toBe("primary_authenticated");
    expect(verifySessionToken(primary)).toBe(false);
    expect(verifySessionToken(full)).toBe(true);
  });

  it("does not extend a session during repeated validation", () => {
    const token = signSessionToken();
    const claims = validateSessionToken(token)!;
    vi.setSystemTime(NOW + 60_000);
    expect(validateSessionToken(token)).toEqual(claims);
  });

  it("sets a cookie aligned with the server lifetime", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await createSession();
    expect(cookieStore.set).toHaveBeenCalledWith(
      ADMIN_COOKIE_NAME,
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_DURATION,
      })
    );
    vi.unstubAllEnvs();
  });
});
