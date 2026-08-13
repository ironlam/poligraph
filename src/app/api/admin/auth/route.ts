import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, createSession, destroySession } from "@/lib/auth";
import { clearLoginRateLimit, reserveLoginAttempt } from "@/lib/rate-limit";
import { resolveTrustedClientIdentity } from "@/lib/trusted-client-identity";

export async function POST(request: NextRequest) {
  let identity: string;
  let rateLimit;
  try {
    identity = resolveTrustedClientIdentity(request);
    rateLimit = await reserveLoginAttempt(identity);
  } catch {
    return NextResponse.json({ error: "Service temporairement indisponible" }, { status: 503 });
  }

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Trop de tentatives. Réessayez plus tard.",
        retryAfter: rateLimit.retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfter),
        },
      }
    );
  }

  try {
    const { password } = await request.json();

    if (!password) {
      return NextResponse.json({ error: "Mot de passe requis" }, { status: 400 });
    }

    const isValid = await verifyPassword(password);

    if (!isValid) {
      return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
    }

    // A proven credential clears the shared failure state before a session can be emitted.
    try {
      await clearLoginRateLimit(identity);
    } catch {
      return NextResponse.json({ error: "Service temporairement indisponible" }, { status: 503 });
    }
    await createSession();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE() {
  await destroySession();
  return NextResponse.json({ success: true });
}
