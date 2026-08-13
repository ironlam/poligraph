import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";
import {
  ADMIN_COOKIE_NAME,
  SESSION_DURATION,
  signSessionToken,
  verifySessionToken,
} from "@/lib/auth-token";

// La signature et la vérification vivent dans @/lib/auth-token, sans next/headers, pour que
// src/proxy.ts puisse vérifier le jeton sans réécrire le HMAC.
export { verifySessionToken } from "@/lib/auth-token";

/**
 * Simple admin authentication using ADMIN_PASSWORD env var
 * Uses timing-safe comparison to prevent timing attacks
 */
export async function verifyPassword(password: string): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error("ADMIN_PASSWORD not set in environment");
    return false;
  }

  const a = Buffer.from(password);
  const b = Buffer.from(adminPassword);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Create admin session with HMAC-signed cookie (stateless)
 */
export async function createSession(): Promise<void> {
  const token = signSessionToken(Date.now());
  const cookieStore = await cookies();

  cookieStore.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION,
    path: "/",
  });
}

/**
 * Check if user is authenticated (verifies HMAC signature + expiry)
 */
export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_COOKIE_NAME);
  if (!session?.value) return false;
  return verifySessionToken(session.value);
}

/**
 * Destroy admin session
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
}
