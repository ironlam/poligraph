import type { Redis } from "@upstash/redis";

/**
 * Client buckets, based on self-declared User-Agent headers.
 * These are not verified facts, only labels. An attacker can forge
 * any User-Agent, so treat these metrics as indicators, not proofs.
 */
export type ClientKind = "companion" | "bot" | "script" | "browser" | "other";

const RETENTION_SECONDS = 90 * 24 * 60 * 60;

/**
 * Public API routes, as the counter labels them. Anything outside this list is
 * bucketed as "other": the key is a Redis hash field, and an attacker-controlled
 * path would otherwise grow it without bound.
 */
const STATIC_PATHS = new Set([
  "/api/activity/batch",
  "/api/affaires",
  "/api/affaires/neighbors",
  "/api/carte",
  "/api/chat",
  "/api/compare/search-index",
  "/api/compare/suggestions",
  "/api/deputies/by-commune",
  "/api/deputies/by-department",
  "/api/docs",
  "/api/elections",
  "/api/elections/calendar",
  "/api/elections/municipales-2014/communes",
  "/api/elections/municipales-2020/communes",
  "/api/elections/municipales-2026/communes",
  "/api/elections/presidentielle-2027/recherche",
  "/api/elections/senatoriales-2026/commune",
  "/api/export/affaires",
  "/api/export/factchecks",
  "/api/export/politiques",
  "/api/export/votes",
  "/api/factchecks",
  "/api/factchecks/stats",
  "/api/mandats",
  "/api/newsletter/subscribe",
  "/api/partis",
  "/api/politiques",
  "/api/reconcile",
  "/api/rss/affaires.xml",
  "/api/rss/factchecks.xml",
  "/api/rss/votes.xml",
  "/api/search/advanced",
  "/api/search/filters",
  "/api/search/global",
  "/api/search/parties",
  "/api/search/politicians",
  "/api/search/watchlist",
  "/api/stats",
  "/api/stats/departments",
  "/api/v1/elus",
  "/api/v1/elus/search",
  "/api/votes",
  "/api/votes/stats",
]);

/** Dynamic routes, collapsed onto a fixed label so the hash stays bounded. */
const DYNAMIC_PATTERNS: Array<{ re: RegExp; toLabel: (match: RegExpExecArray) => string }> = [
  {
    re: /^\/api\/politiques\/[^/]+\/(votes|affaires|relations|factchecks)$/,
    toLabel: (m) => `/api/politiques/[slug]/${m[1]}`,
  },
  { re: /^\/api\/politiques\/[^/]+$/, toLabel: () => "/api/politiques/[slug]" },
  { re: /^\/api\/partis\/[^/]+$/, toLabel: () => "/api/partis/[slug]" },
  {
    re: /^\/api\/elections\/[^/]+\/(candidacies|measures)$/,
    toLabel: (m) => `/api/elections/[slug]/${m[1]}`,
  },
  { re: /^\/api\/elections\/[^/]+$/, toLabel: () => "/api/elections/[slug]" },
  { re: /^\/api\/dossiers\/[^/]+\/amendments$/, toLabel: () => "/api/dossiers/[id]/amendments" },
  { re: /^\/api\/v1\/elus\/[^/]+$/, toLabel: () => "/api/v1/elus/[id]" },
  { re: /^\/api\/v1\/communes\/[^/]+$/, toLabel: () => "/api/v1/communes/[codeInsee]" },
  { re: /^\/api\/images\/[^/]+$/, toLabel: () => "/api/images/[id]" },
];

export function normalizeApiPath(pathname: string): string {
  if (STATIC_PATHS.has(pathname)) return pathname;

  for (const { re, toLabel } of DYNAMIC_PATTERNS) {
    const match = re.exec(pathname);
    if (match) return toLabel(match);
  }

  return "other";
}

export function classifyClient(
  userAgent: string | null,
  _searchParams: URLSearchParams
): ClientKind {
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
