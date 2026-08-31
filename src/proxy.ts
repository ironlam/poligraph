import { NextRequest, NextResponse, type NextFetchEvent } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import * as Sentry from "@sentry/nextjs";
import {
  resolveRateLimitMode,
  degradedActionForTier,
  isProductionRuntime,
  shouldEmitDegradedAlert,
  type RateLimitMode,
} from "@/lib/ratelimit/degraded-mode";
import { getUpstashCredentials } from "@/lib/ratelimit/upstash-credentials";
import { buildVotesListingRedirect } from "@/lib/parlement-votes-redirect";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/auth-token";
import { getLegacyMeasureId } from "@/lib/presidentielle/measure-route";

// ─── Rate limit tiers ────────────────────────────────────────────

type RateLimitTier = "general" | "search" | "export" | "admin" | "subscribe";

const TIER_CONFIG: Record<RateLimitTier, { tokens: number; window: string }> = {
  general: { tokens: 60, window: "1m" },
  search: { tokens: 30, window: "1m" },
  export: { tokens: 5, window: "1m" },
  admin: { tokens: 30, window: "1m" },
  subscribe: { tokens: 8, window: "1m" },
};

// ─── Lazy-init rate limiters ─────────────────────────────────────

let redis: Redis | null = null;
const limiters = new Map<RateLimitTier, Ratelimit>();

function getRedis(): Redis | null {
  if (redis) return redis;

  // Integration vars (POLIGRAPH_API_KV_*) first, then manual UPSTASH_* aliases.
  const creds = getUpstashCredentials();
  if (!creds) return null;

  redis = new Redis({ url: creds.url, token: creds.token });
  return redis;
}

function getLimiter(tier: RateLimitTier): Ratelimit | null {
  if (limiters.has(tier)) return limiters.get(tier)!;

  const client = getRedis();
  if (!client) return null;

  const config = TIER_CONFIG[tier];
  const limiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(config.tokens, config.window as `${number}${"s" | "m" | "h"}`),
    prefix: `rl:${tier}`,
  });

  limiters.set(tier, limiter);
  return limiter;
}

// ─── Degraded-mode alerting (Lot 3A) ─────────────────────────────

const DEGRADED_ALERT_THROTTLE_MS = 5 * 60 * 1000; // 5 min
let lastDegradedAlertAt: number | null = null;
let lastUnconfiguredWarnAt: number | null = null;

/**
 * Surface that rate limiting is degraded by a RUNTIME outage (Upstash configured
 * but unreachable). Throttled so it fires at most once per window per instance.
 * In production: console error (Vercel logs) + Sentry warning, flushed via
 * `event.waitUntil`. Outside production: a single light log.
 */
function reportDegradedMode(
  mode: RateLimitMode,
  tier: RateLimitTier,
  pathname: string,
  event: NextFetchEvent
): void {
  if (mode === "enforced") return;
  const now = Date.now();
  if (!shouldEmitDegradedAlert(lastDegradedAlertAt, now, DEGRADED_ALERT_THROTTLE_MS)) {
    return;
  }
  lastDegradedAlertAt = now;

  const detail = `Upstash injoignable, limitation de débit dégradée (tier=${tier}, route=${pathname})`;
  if (mode === "degraded-prod") {
    // eslint-disable-next-line no-console -- deliberate ops signal (Vercel logs)
    console.error(`[ratelimit] PRODUCTION ${detail}`);
    Sentry.captureMessage(`Rate limiting dégradé : ${detail}`, "warning");
    event.waitUntil(Sentry.flush(2000));
  } else {
    // eslint-disable-next-line no-console -- deliberate ops signal (dev)
    console.warn(`[ratelimit] ${detail} (hors production, fallback autorisé)`);
  }
}

/**
 * Surface that Upstash is NOT configured at all (no credentials) — distinct from
 * a runtime outage. Rate limiting runs OFF in this case (open passthrough, never
 * fail-closed), so this throttled warn is the only signal. Static message (no
 * request data) to avoid any log injection.
 */
function reportUnconfigured(): void {
  const now = Date.now();
  if (!shouldEmitDegradedAlert(lastUnconfiguredWarnAt, now, DEGRADED_ALERT_THROTTLE_MS)) return;
  lastUnconfiguredWarnAt = now;
  // eslint-disable-next-line no-console -- deliberate ops signal
  console.warn("[ratelimit] Upstash non configuré — limitation de débit désactivée");
}

/**
 * Build the response for a RUNTIME outage (Upstash configured but unreachable):
 * throttled alert, then fail the export tier closed (503) in production while
 * letting everything else through. Only reached when a limiter exists but throws.
 */
function degradedResponse(
  tier: RateLimitTier,
  pathname: string,
  request: NextRequest,
  event: NextFetchEvent
): NextResponse {
  const mode = resolveRateLimitMode(false, isProductionRuntime(process.env));
  reportDegradedMode(mode, tier, pathname, event);

  if (degradedActionForTier(mode, tier) === "block") {
    const blocked = NextResponse.json(
      { error: "Limitation de débit indisponible. Réessayez plus tard." },
      {
        status: 503,
        headers: {
          "Retry-After": "60",
          ...(isV1Route(pathname) ? CORS_HEADERS : {}),
        },
      }
    );
    applySubscribeCors(request, blocked);
    return blocked;
  }

  return openPassthrough(request, pathname);
}

// ─── Route → tier mapping ────────────────────────────────────────

export function getRateLimitTier(pathname: string): RateLimitTier | null {
  // Excluded routes — handled by their own rate limiting or internal
  if (pathname.startsWith("/api/chat")) return null;
  if (pathname.startsWith("/api/cron")) return null;
  // Mailjet webhook is signed with HMAC; rate limit per-IP would punish bursty
  // legitimate batches from a small set of Mailjet IPs.
  if (pathname.startsWith("/api/newsletter/webhook")) return null;

  // Admin routes — separate tier (auth endpoint has its own stricter limiter too)
  if (pathname.startsWith("/api/admin")) return "admin";

  if (
    pathname.startsWith("/api/newsletter/subscribe") ||
    pathname.startsWith("/api/newsletter/forget")
  ) {
    return "subscribe";
  }
  if (pathname.startsWith("/api/export")) return "export";
  if (pathname.startsWith("/api/elections/presidentielle-2027/recherche")) {
    return "search";
  }
  if (pathname.startsWith("/api/search")) return "search";
  if (pathname.startsWith("/api/")) return "general";

  return null;
}

// ─── Client IP extraction ────────────────────────────────────────

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]!.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1"
  );
}

// ─── CORS for public v1 API ──────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function isV1Route(pathname: string): boolean {
  return pathname.startsWith("/api/v1/");
}

// ─── CORS for newsletter subscribe (boussole) ────────────────────

const SUBSCRIBE_CORS_ORIGINS = ["https://boussole.poligraph.fr", "http://localhost:8081"];

function applySubscribeCors(request: NextRequest, response: NextResponse): void {
  if (request.nextUrl.pathname !== "/api/newsletter/subscribe") return;
  const origin = request.headers.get("origin");
  if (!origin || !SUBSCRIBE_CORS_ORIGINS.includes(origin)) return;
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Vary", "Origin");
}

/** Pass the request through while preserving the API CORS headers. */
function openPassthrough(request: NextRequest, pathname: string): NextResponse {
  const response = NextResponse.next();
  if (isV1Route(pathname)) {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => response.headers.set(k, v));
  }
  applySubscribeCors(request, response);
  return response;
}

// ─── API rate limiting ───────────────────────────────────────────

/**
 * Per-IP rate limiting for /api routes (Upstash sliding window). Returns the
 * response to send (CORS preflight 204 / 429 / 503-on-outage / passthrough with
 * headers), or null when the path is not subject to limiting so the proxy
 * continues.
 *
 * Two non-enforced cases are kept deliberately distinct:
 * - Upstash NOT configured (no credentials): rate limiting is OFF — open
 *   passthrough for every tier, never 503 (so /api/export keeps working).
 * - Runtime outage (limiter exists but throws): prudent degraded policy, which
 *   fails the export tier closed (503) in production only.
 */
async function applyApiRateLimit(
  request: NextRequest,
  event: NextFetchEvent
): Promise<NextResponse | null> {
  const pathname = request.nextUrl.pathname;

  // CORS preflight for v1 API
  if (isV1Route(pathname) && request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  const tier = getRateLimitTier(pathname);
  if (!tier) return null;

  const limiter = getLimiter(tier);
  if (!limiter) {
    // Upstash not configured at all → rate limiting OFF (open, never fail-closed).
    reportUnconfigured();
    return openPassthrough(request, pathname);
  }

  const ip = getClientIp(request);
  let success: boolean;
  let limit: number;
  let remaining: number;
  let reset: number;
  try {
    ({ success, limit, remaining, reset } = await limiter.limit(ip));
  } catch {
    // Upstash configured but unreachable at runtime: prudent degraded policy.
    return degradedResponse(tier, pathname, request, event);
  }

  if (!success) {
    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    const headers: Record<string, string> = {
      "Retry-After": String(retryAfter),
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": String(reset),
      ...(isV1Route(pathname) ? CORS_HEADERS : {}),
    };
    const limited = NextResponse.json(
      { error: "Trop de requêtes. Réessayez plus tard." },
      { status: 429, headers }
    );
    applySubscribeCors(request, limited);
    return limited;
  }

  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(limit));
  response.headers.set("X-RateLimit-Remaining", String(remaining));
  response.headers.set("X-RateLimit-Reset", String(reset));
  if (isV1Route(pathname)) {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => response.headers.set(k, v));
  }
  applySubscribeCors(request, response);
  return response;
}

/**
 * Whether the request carries a session token WE issued, and that has not expired.
 *
 * `verifySessionToken` lives in `@/lib/auth-token`, which imports no `next/headers`: the proxy and
 * `isAuthenticated()` then share one implementation of the HMAC check instead of two that drift.
 */
export function hasValidAdminSession(request: NextRequest): boolean {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  return token !== undefined && verifySessionToken(token);
}

// ─── Proxy (Next 16 convention; the active middleware-like layer) ──

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const pathname = request.nextUrl.pathname;

  // Canonicalize the legacy /parlement?<filters> listing to /parlement/votes (HTTP 308).
  if (pathname === "/parlement") {
    const target = buildVotesListingRedirect(request.nextUrl.searchParams);
    if (target) {
      return NextResponse.redirect(new URL(target, request.url), 308);
    }
  }

  const vercelEnv = process.env.VERCEL_ENV;

  // Protect non-production environments (preview, staging) with Basic Auth
  if (vercelEnv && vercelEnv !== "production") {
    // Allow API routes (for MCP, webhooks, etc.)
    if (!pathname.startsWith("/api/")) {
      const auth = request.headers.get("authorization");

      if (auth) {
        const [scheme, encoded] = auth.split(" ");
        if (scheme === "Basic" && encoded) {
          const decoded = atob(encoded);
          const [, password] = decoded.split(":");
          if (password !== process.env.ADMIN_PASSWORD) {
            return new NextResponse("Accès restreint — staging", {
              status: 401,
              headers: { "WWW-Authenticate": 'Basic realm="Staging"' },
            });
          }
          // Auth OK, continue to admin check below
        }
      } else {
        return new NextResponse("Accès restreint — staging", {
          status: 401,
          headers: { "WWW-Authenticate": 'Basic realm="Staging"' },
        });
      }
    }
  }

  // Resolve legacy CUID measure URLs in a Node route handler after preview authentication. The
  // rewrite stays internal; that handler performs the lookup and returns a visible HTTP 308.
  const legacyMeasureId = getLegacyMeasureId(pathname);
  if (legacyMeasureId !== null) {
    const target = request.nextUrl.clone();
    target.pathname = `/elections/presidentielle-2027/mesures/par-id/${legacyMeasureId}`;
    return NextResponse.rewrite(target);
  }

  // Protect admin API routes (except auth endpoint).
  //
  // The token is VERIFIED, not merely present (issue #647). Checking `session?.value` let
  // `admin_session=1` through, and every admin page without its own isAuthenticated() call then
  // rendered: four pages out of thirty-seven had one.
  if (pathname.startsWith("/api/admin") && !pathname.startsWith("/api/admin/auth")) {
    if (!hasValidAdminSession(request)) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
  }

  // Protect admin pages.
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    if (!hasValidAdminSession(request)) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  // Per-IP rate limiting for /api routes.
  const rateLimited = await applyApiRateLimit(request, event);
  if (rateLimited) return rateLimited;

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|logo.svg).*)"],
};
