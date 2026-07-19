/**
 * Article Scraper
 *
 * Extracts full article text from press URLs using @mozilla/readability.
 *
 * Scraping strategy by source:
 * - Mediapart: login automatique (POST /login_check)
 * - Gratuits (franceinfo, liberation, LCP, Public Sénat, Politico): scrape direct
 * - Paywall (Le Monde, Le Figaro): pas de scrape → fallback titre+description RSS
 *
 * Content is fetched → extracted → returned for AI analysis → NOT stored (copyright).
 */

import { createSilentJSDOM } from "@/lib/parsing/jsdom-silent";
import { Readability } from "@mozilla/readability";
import { HTTPClient } from "./http-client";
import { decodeHtmlEntities, removeSidebarElements } from "@/lib/parsing/html-utils";

const MAX_CONTENT_LENGTH = 16_000; // Truncate to 16k chars (sufficient for AI analysis)
const SCRAPE_RATE_LIMIT_MS = 2000; // Be polite: 2s between scrapes

export interface ArticleContent {
  title: string;
  textContent: string;
  excerpt: string;
  byline: string | null;
  length: number;
}

/** Sources where we can scrape the full article */
const SCRAPABLE_SOURCES = new Set([
  "franceinfo",
  "liberation",
  "publicsenat",
  "lcp",
  "politico",
  "mediapart",
  // Regional press (free access)
  "ouestfrance",
  "sudouest",
  "ladepeche",
  "ledauphine",
  "dna",
  // Specialized / investigative + national TV (free access)
  "reporterre",
  "bfmtv-politique",
  // mediacites: paywalled, RSS-only intentional (press-analysis falls back to RSS title+description)
  // googlenews links to external articles, don't scrape
]);

interface AuthSession {
  cookies: string;
  expiresAt: number;
}

/**
 * Article scraper with per-source authentication strategies
 */
export class ArticleScraper {
  private httpClient: HTTPClient;
  private mediapartSession: AuthSession | null = null;

  constructor() {
    this.httpClient = new HTTPClient({
      rateLimitMs: SCRAPE_RATE_LIMIT_MS,
      // Tight budget on purpose: press analysis has an RSS title+description
      // fallback for every scrapable source, so a slow/hanging fetch should
      // fail fast rather than burn the daily-sync 10 min per-step timeout.
      // Worst case per slow source drops from 30s×3 to 12s×2.
      timeout: 12_000,
      retries: 1,
      headers: {
        Accept: "text/html,application/xhtml+xml",
      },
    });
  }

  /**
   * Check if a source supports full article scraping.
   * Paywalled sources (lemonde, lefigaro) return false — the orchestrator
   * will fall back to analyzing title+description RSS instead.
   */
  canScrape(feedSource: string): boolean {
    return SCRAPABLE_SOURCES.has(feedSource);
  }

  /**
   * Extract article content from a URL.
   * Only call this for sources where canScrape() returns true.
   */
  async extractArticle(url: string, feedSource: string): Promise<ArticleContent | null> {
    if (!this.canScrape(feedSource)) {
      return null;
    }

    try {
      const html = await this.fetchWithAuth(url, feedSource);
      if (!html) return null;

      return this.parseWithReadability(html, url);
    } catch (error) {
      console.error(
        `  ✗ Scrape failed for ${url}:`,
        error instanceof Error ? error.message : error
      );
      return null;
    }
  }

  /**
   * Fetch HTML with source-specific authentication
   */
  private async fetchWithAuth(url: string, feedSource: string): Promise<string | null> {
    const headers: Record<string, string> = {};

    if (feedSource === "mediapart") {
      const cookies = await this.getMediapartCookies();
      if (cookies) {
        headers["Cookie"] = cookies;
      }
    }

    try {
      const response = await this.httpClient.getText(url, { headers });
      return response.data;
    } catch (error) {
      console.error(
        `  ✗ Fetch failed for ${feedSource} (${url}):`,
        error instanceof Error ? error.message : error
      );
      return null;
    }
  }

  /**
   * Authenticate to Mediapart via login form.
   * Returns session cookie, cached for 1 hour.
   */
  private async getMediapartCookies(): Promise<string | null> {
    // Return cached session if still valid
    if (this.mediapartSession && Date.now() < this.mediapartSession.expiresAt) {
      return this.mediapartSession.cookies;
    }

    const email = process.env.MEDIAPART_EMAIL;
    const password = process.env.MEDIAPART_PASSWORD;

    if (!email || !password) {
      return null;
    }

    try {
      const response = await fetch("https://www.mediapart.fr/login_check", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
        body: new URLSearchParams({
          email,
          password,
        }).toString(),
        redirect: "manual", // Don't follow redirect, we want the Set-Cookie
      });

      // Detect invalid credentials (distinct from other failures)
      if (response.headers.get("x-http-auth-error") === "true") {
        console.error("  ✗ Mediapart auth: invalid credentials");
        return null;
      }

      const setCookies = response.headers.getSetCookie?.() ?? [];
      if (setCookies.length === 0) {
        console.warn("  ⚠ Mediapart auth: no cookies returned");
        return null;
      }

      // Extract cookie key=value pairs
      const cookieParts = setCookies.map((c) => c.split(";")[0]).filter(Boolean);

      const cookies = cookieParts.join("; ");

      // Cache for 1 hour
      this.mediapartSession = {
        cookies,
        expiresAt: Date.now() + 60 * 60 * 1000,
      };

      return cookies;
    } catch (error) {
      console.error("  ✗ Mediapart auth failed:", error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Parse HTML with Readability to extract clean article text
   */
  private parseWithReadability(html: string, url: string): ArticleContent | null {
    try {
      const dom = createSilentJSDOM(decodeHtmlEntities(html), { url });
      removeSidebarElements(dom.window.document);
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article || !article.textContent || article.textContent.trim().length < 100) {
        return null;
      }

      // Clean and truncate
      const textContent = article.textContent
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_CONTENT_LENGTH);

      return {
        title: article.title || "",
        textContent,
        excerpt: article.excerpt || textContent.slice(0, 300),
        byline: article.byline || null,
        length: textContent.length,
      };
    } catch (error) {
      console.error(
        `  ✗ Readability parse failed for ${url}:`,
        error instanceof Error ? error.message : error
      );
      return null;
    }
  }
}

/**
 * Singleton scraper instance
 */
let scraperInstance: ArticleScraper | null = null;

export function getArticleScraper(): ArticleScraper {
  if (!scraperInstance) {
    scraperInstance = new ArticleScraper();
  }
  return scraperInstance;
}
