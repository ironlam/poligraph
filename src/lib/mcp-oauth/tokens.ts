import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { safeJsonParse } from "@/lib/api/safe-json";

/**
 * Stateless access tokens: `mcp1.<payload>.<signature>`, HMAC-SHA256 over the base64url payload.
 * Verification needs no storage, which keeps every MCP call off Redis.
 */

const PREFIX = "mcp1";

export interface AccessTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  clientId: string;
  scope: string;
  epoch: number;
  iat: number;
  exp: number;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signAccessToken(claims: AccessTokenClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${PREFIX}.${payload}.${sign(`${PREFIX}.${payload}`, secret)}`;
}

export function verifyAccessToken(
  token: string,
  expected: { secret: string; issuer: string; audience: string; epoch: number; now?: number }
): AccessTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX || !parts[1] || !parts[2]) return null;
  const signature = Buffer.from(parts[2]);
  const expectedSignature = Buffer.from(sign(`${PREFIX}.${parts[1]}`, expected.secret));
  if (
    signature.length !== expectedSignature.length ||
    !timingSafeEqual(signature, expectedSignature)
  ) {
    return null;
  }

  const parsed = safeJsonParse<Partial<AccessTokenClaims>>(
    Buffer.from(parts[1], "base64url").toString("utf8")
  );
  if (!parsed.success || !parsed.data || typeof parsed.data !== "object") return null;
  const claims = parsed.data;
  const nowSeconds = Math.floor((expected.now ?? Date.now()) / 1000);
  if (
    claims.iss !== expected.issuer ||
    claims.aud !== expected.audience ||
    claims.epoch !== expected.epoch ||
    typeof claims.sub !== "string" ||
    typeof claims.clientId !== "string" ||
    typeof claims.scope !== "string" ||
    !Number.isSafeInteger(claims.iat) ||
    !Number.isSafeInteger(claims.exp) ||
    claims.exp! <= nowSeconds
  ) {
    return null;
  }
  return claims as AccessTokenClaims;
}

/** Opaque random secret for codes and refresh tokens. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Codes and refresh tokens are stored by digest so a Redis dump does not hand out live tokens. */
export function digestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE_PATTERN = /^[A-Za-z0-9\-_]{43}$/;

export function isValidCodeChallenge(challenge: string): boolean {
  return CHALLENGE_PATTERN.test(challenge);
}

/** PKCE S256 (RFC 7636 §4.6), the only method advertised. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!VERIFIER_PATTERN.test(verifier)) return false;
  const computed = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const stored = Buffer.from(challenge);
  return computed.length === stored.length && timingSafeEqual(computed, stored);
}
