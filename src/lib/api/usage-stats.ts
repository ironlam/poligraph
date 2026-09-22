import type { Redis } from "@upstash/redis";

export type ClientKind = "companion" | "bot" | "script" | "browser" | "other";

const RETENTION_SECONDS = 90 * 24 * 60 * 60;

/**
 * Public API routes, as the counter labels them. Anything outside this list is
 * bucketed as "other": the key is a Redis hash field, and an attacker-controlled
 * path would otherwise grow it without bound.
 */
const STATIC_PATHS = new Set([
  "/api/affaires",
  "/api/politiques",
  "/api/partis",
  "/api/mandats",
  "/api/votes",
  "/api/factchecks",
  "/api/stats",
  "/api/export/affaires",
  "/api/export/politiques",
  "/api/export/factchecks",
  "/api/export/votes",
  "/api/search/global",
  "/api/search/advanced",
  "/api/rss/affaires.xml",
  "/api/rss/votes.xml",
  "/api/rss/factchecks.xml",
]);

/** `/api/<collection>/<slug>` and `/api/politiques/<slug>/<sub>` patterns we keep. */
const DYNAMIC_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /^\/api\/politiques\/[^/]+\/(votes|affaires|relations|factchecks)$/, label: "" },
  { re: /^\/api\/politiques\/[^/]+$/, label: "/api/politiques/[slug]" },
  { re: /^\/api\/partis\/[^/]+$/, label: "/api/partis/[slug]" },
  { re: /^\/api\/v1\/elus\/[^/]+$/, label: "/api/v1/elus/[id]" },
];

export function normalizeApiPath(pathname: string): string {
  if (STATIC_PATHS.has(pathname)) return pathname;

  for (const { re, label } of DYNAMIC_PATTERNS) {
    const match = re.exec(pathname);
    if (!match) continue;
    // The first pattern keeps its sub-resource, so it builds its label from the match.
    return label || `/api/politiques/[slug]/${match[1]}`;
  }

  return "other";
}

export function classifyClient(
  userAgent: string | null,
  searchParams: URLSearchParams
): ClientKind {
  if (searchParams.get("client") === "companion") return "companion";
  if (!userAgent) return "other";

  if (userAgent.includes("PoligraphCompanion")) return "companion";
  if (/bot|crawler|spider|slurp/i.test(userAgent)) return "bot";
  if (/^(curl|wget|python-requests|node-fetch|axios|got|httpie)/i.test(userAgent)) return "script";
  if (userAgent.startsWith("Mozilla/")) return "browser";

  return "other";
}

/**
 * Fire-and-forget usage counter. Called from the proxy under `waitUntil`, so it runs
 * after the response: it must never throw and never be awaited on the hot path.
 */
export async function recordApiCall(
  redis: Redis,
  pathname: string,
  userAgent: string | null,
  searchParams: URLSearchParams
): Promise<void> {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const routeKey = `apistats:${day}`;
    const clientKey = `apistats:client:${day}`;

    await Promise.all([
      redis.hincrby(routeKey, normalizeApiPath(pathname), 1),
      redis.hincrby(clientKey, classifyClient(userAgent, searchParams), 1),
    ]);
    await Promise.all([
      redis.expire(routeKey, RETENTION_SECONDS),
      redis.expire(clientKey, RETENTION_SECONDS),
    ]);
  } catch {
    // A counter is never worth a failed request. Swallowed on purpose.
  }
}
