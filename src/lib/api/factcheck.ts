/**
 * Google Fact Check Tools API client
 *
 * Uses the ClaimReview standard to search for fact-checks from recognized sources.
 * API docs: https://developers.google.com/fact-check/tools/api/reference/rest
 */

import type { FactCheckRating } from "@/generated/prisma";
import { FACTCHECK_RATE_LIMIT_MS } from "@/config/rate-limits";
import { HTTPClient } from "@/lib/api/http-client";

const client = new HTTPClient({ rateLimitMs: FACTCHECK_RATE_LIMIT_MS });
const scraperClient = new HTTPClient({
  rateLimitMs: 1000,
  timeout: 10_000,
});

const API_BASE = "https://factchecktools.googleapis.com/v1alpha1/claims:search";

export interface FactCheckClaim {
  text: string;
  claimant?: string;
  claimDate?: string;
  claimReview: FactCheckClaimReview[];
}

export interface FactCheckClaimReview {
  publisher: {
    name: string;
    site?: string;
  };
  url: string;
  title: string;
  reviewDate?: string;
  textualRating: string;
  languageCode?: string;
}

export interface FactCheckSearchResponse {
  claims?: FactCheckClaim[];
  nextPageToken?: string;
}

export interface SearchClaimsOptions {
  languageCode?: string;
  pageSize?: number;
  maxPages?: number;
}

/**
 * Search for fact-checked claims via Google Fact Check Tools API
 */
export async function searchClaims(
  query: string,
  options: SearchClaimsOptions = {}
): Promise<FactCheckClaim[]> {
  const apiKey = process.env.GOOGLE_FACTCHECK_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_FACTCHECK_API_KEY is not set");
  }

  const { languageCode = "fr", pageSize = 100, maxPages = 3 } = options;
  const allClaims: FactCheckClaim[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;

  while (pageCount < maxPages) {
    const params = new URLSearchParams({
      query,
      languageCode,
      pageSize: String(pageSize),
      key: apiKey,
    });
    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const url = `${API_BASE}?${params.toString()}`;
    const { data } = await client.get<FactCheckSearchResponse>(url);

    if (data.claims) {
      allClaims.push(...data.claims);
    }

    pageToken = data.nextPageToken;
    pageCount++;

    if (!pageToken) break;
  }

  return allClaims;
}

/**
 * Fetch the full page title from a fact-check article URL.
 * Falls back to the original title if the page can't be fetched.
 */
export async function fetchPageTitle(url: string, fallbackTitle: string): Promise<string> {
  try {
    const { data: html } = await scraperClient.getText(url, {
      headers: { Accept: "text/html" },
    });

    // Extract og:title and <title> with regex (avoids JSDOM dependency)
    const ogMatch =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

    const ogTitle = ogMatch?.[1];
    const htmlTitle = titleMatch?.[1];

    const fullTitle = ogTitle || htmlTitle;

    if (fullTitle && fullTitle.trim().length > fallbackTitle.replace(/\.{3}$/, "").trim().length) {
      return fullTitle.trim();
    }

    return fallbackTitle;
  } catch {
    return fallbackTitle;
  }
}

/**
 * Map a textual rating from fact-check sources to a normalized FactCheckRating.
 *
 * Sources use various formats: "Faux", "False", "Mostly False", "Plutôt vrai", etc.
 * This function handles French and English ratings.
 */
export function mapTextualRating(text: string): FactCheckRating {
  const lower = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  // FALSE
  if (
    lower === "faux" ||
    lower === "false" ||
    lower === "fake" ||
    lower === "infonde" ||
    lower === "inexact" ||
    lower === "non" ||
    lower === "totalement faux"
  ) {
    return "FALSE";
  }

  // MOSTLY_FALSE
  if (
    lower.includes("plutot faux") ||
    lower.includes("mostly false") ||
    lower.includes("en grande partie faux") ||
    lower.includes("largely false") ||
    lower === "exagere"
  ) {
    return "MOSTLY_FALSE";
  }

  // MISLEADING
  if (
    lower.includes("trompeur") ||
    lower.includes("misleading") ||
    lower.includes("manipule") ||
    lower.includes("detourne") ||
    lower.includes("deformé")
  ) {
    return "MISLEADING";
  }

  // OUT_OF_CONTEXT
  if (
    lower.includes("hors contexte") ||
    lower.includes("out of context") ||
    lower.includes("sorti de son contexte") ||
    lower.includes("contexte manquant")
  ) {
    return "OUT_OF_CONTEXT";
  }

  // HALF_TRUE
  if (
    lower.includes("partiellement vrai") ||
    lower.includes("half true") ||
    lower.includes("en partie vrai") ||
    lower.includes("partially true") ||
    lower.includes("mixture") ||
    lower.includes("a nuancer") ||
    lower === "imprecis" ||
    lower.includes("pas tout a fait")
  ) {
    return "HALF_TRUE";
  }

  // MOSTLY_TRUE
  if (
    lower.includes("plutot vrai") ||
    lower.includes("mostly true") ||
    lower.includes("en grande partie vrai") ||
    lower.includes("largely true")
  ) {
    return "MOSTLY_TRUE";
  }

  // TRUE
  if (
    lower === "vrai" ||
    lower === "true" ||
    lower === "correct" ||
    lower === "exact" ||
    lower === "oui" ||
    lower === "confirme"
  ) {
    return "TRUE";
  }

  // UNVERIFIABLE (default fallback)
  return "UNVERIFIABLE";
}
