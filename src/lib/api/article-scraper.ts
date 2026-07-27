/**
 * Article Scraper
 *
 * Extracts article text from freely accessible press URLs using
 * @mozilla/readability.
 *
 * Accès anonyme uniquement, sur les sources en accès libre. Les sources
 * payantes ne sont pas scrapées : press-analysis les analyse sur titre +
 * description RSS.
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

/**
 * Sources scrapables : articles lisibles sans abonnement ni compte.
 * Toute autre source est analysée sur titre + description RSS.
 */
const SCRAPABLE_SOURCES = new Set([
  "franceinfo",
  "liberation",
  "publicsenat",
  "lcp",
  "politico",
  // Regional press (free access)
  "ouestfrance",
  "sudouest",
  "ladepeche",
  "ledauphine",
  "dna",
  // Specialized / investigative + national TV (free access)
  "reporterre",
  "bfmtv-politique",
  // googlenews links to external articles, don't scrape
]);

/**
 * Article scraper limited to freely accessible sources.
 */
export class ArticleScraper {
  private httpClient: HTTPClient;

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
   * Check if a source supports article scraping. Otherwise the orchestrator
   * falls back to analyzing title+description RSS.
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
      const html = await this.fetchAnonymously(url, feedSource);
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
   * Fetch HTML anonymously, under the HTTPClient User-Agent. Une réponse
   * partielle est un résultat acceptable : press-analysis retombe alors sur
   * le titre + la description RSS.
   */
  private async fetchAnonymously(url: string, feedSource: string): Promise<string | null> {
    try {
      const response = await this.httpClient.getText(url);
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
