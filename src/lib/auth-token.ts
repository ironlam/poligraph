import { createHmac, timingSafeEqual } from "crypto";

/**
 * The admin session token, signing and verification, with NO request context.
 *
 * Split out of `src/lib/auth.ts` for one reason: `src/proxy.ts` needs to verify the token, and
 * `auth.ts` imports `cookies` from `next/headers`, which does not belong in the proxy. Rewriting the
 * HMAC check there would mean two implementations of the only thing standing between the admin and
 * the public.
 *
 * Stateless on purpose: the signing key is ADMIN_PASSWORD, so a token can only be forged by someone
 * who already knows the password.
 */

export const ADMIN_COOKIE_NAME = "admin_session";

/** Seven days, in seconds. */
export const SESSION_DURATION = 60 * 60 * 24 * 7;

/** Format: "timestamp.hmac_signature". */
export function signSessionToken(timestamp: number): string {
  const secret = process.env.ADMIN_PASSWORD || "";
  const signature = createHmac("sha256", secret).update(String(timestamp)).digest("hex");
  return `${timestamp}.${signature}`;
}

/**
 * Whether the token is one we issued and has not expired.
 *
 * Checking the mere PRESENCE of the cookie is not enough, and that was the real hole behind issue
 * #647: `admin_session=1` passed the proxy, and every admin page without its own check then rendered.
 */
export function verifySessionToken(token: string): boolean {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return false;

  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return false;

  const timestamp = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  const expected = createHmac("sha256", secret).update(timestamp).digest("hex");
  if (expected.length !== signature.length) return false;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return false;

  const created = parseInt(timestamp, 10);
  if (isNaN(created)) return false;
  return (Date.now() - created) / 1000 < SESSION_DURATION;
}
