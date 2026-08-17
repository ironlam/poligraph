/**
 * RSS Feed Client
 *
 * Fetches and parses RSS feeds from news sources.
 * Uses fast-xml-parser for XML parsing and HTTPClient for HTTP requests.
 */

import { XMLParser } from "fast-xml-parser";
import { HTTPClient, HTTPError } from "./http-client";
import { RSS_RATE_LIMIT_MS } from "@/config/rate-limits";

// ============================================
// TYPES
// ============================================

export interface RSSFeedConfig {
  id: string; // "lemonde", "politico", "mediapart"
  name: string;
  url: string;
  priority: number;
}

export interface RSSItem {
  title: string;
  description?: string;
  link: string;
  guid: string;
  pubDate: Date;
  imageUrl?: string;
}

export interface RSSFeed {
  source: string;
  title: string;
  items: RSSItem[];
}

// ============================================
// FEED CONFIGURATION
// ============================================

export const RSS_FEEDS: RSSFeedConfig[] = [
  // ── Priority 1: Major national outlets ──
  {
    id: "lemonde",
    name: "Le Monde Politique",
    url: "https://www.lemonde.fr/politique/rss_full.xml",
    priority: 1,
  },
  {
    id: "lefigaro",
    name: "Le Figaro Politique",
    url: "https://www.lefigaro.fr/rss/figaro_politique.xml",
    priority: 1,
  },
  {
    id: "franceinfo",
    name: "Franceinfo Politique",
    url: "https://www.francetvinfo.fr/politique.rss",
    priority: 1,
  },
  {
    id: "liberation",
    name: "Libération Politique",
    url: "https://www.liberation.fr/arc/outboundfeeds/rss-all/category/politique/?outputType=xml",
    priority: 1,
  },
  {
    id: "bfmtv-politique",
    name: "BFM TV Politique",
    url: "https://www.bfmtv.com/rss/politique/",
    priority: 1,
  },

  // ── Priority 2: Specialized / EU ──
  {
    id: "politico",
    name: "Politico.eu",
    url: "https://www.politico.eu/feed/",
    priority: 2,
  },
  {
    id: "mediapart",
    name: "Mediapart",
    url: "https://www.mediapart.fr/articles/feed",
    priority: 2,
  },
  {
    id: "publicsenat",
    name: "Public Sénat",
    url: "https://www.publicsenat.fr/feed",
    priority: 2,
  },
  {
    id: "lcp",
    name: "LCP Assemblée nationale",
    url: "https://lcp.fr/rss.xml",
    priority: 2,
  },
  {
    id: "reporterre",
    name: "Reporterre (écologie, justice)",
    url: "https://reporterre.net/spip.php?page=backend",
    priority: 2,
  },
  {
    id: "mediacites",
    name: "Mediacités (investigations locales)",
    url: "https://www.mediacites.fr/feed/",
    priority: 2,
  },

  // ── Priority 2: Presse régionale ──
  {
    id: "ouestfrance",
    name: "Ouest-France",
    url: "https://www.ouest-france.fr/rss/france",
    priority: 2,
  },
  {
    id: "sudouest",
    name: "Sud Ouest",
    url: "https://www.sudouest.fr/politique/rss.xml",
    priority: 2,
  },
  {
    id: "ladepeche",
    name: "La Dépêche du Midi",
    url: "https://www.ladepeche.fr/rss.xml",
    priority: 2,
  },
  {
    id: "ledauphine",
    name: "Le Dauphiné Libéré",
    url: "https://www.ledauphine.com/rss",
    priority: 2,
  },
  {
    id: "dna",
    name: "Dernières Nouvelles d'Alsace",
    url: "https://www.dna.fr/rss",
    priority: 2,
  },

  // ── Priority 2: Agrégateur ──
  {
    id: "googlenews",
    name: "Google News FR (Politique/Justice)",
    url: "https://news.google.com/rss/search?q=politique+france+justice&hl=fr&gl=FR&ceid=FR:fr",
    priority: 2,
  },
];

// ============================================
// RSS CLIENT
// ============================================

export interface RSSClientOptions {
  timeout?: number;
  retries?: number;
  rateLimitMs?: number;
}

const DEFAULT_OPTIONS: Required<RSSClientOptions> = {
  timeout: 30000,
  retries: 3,
  rateLimitMs: RSS_RATE_LIMIT_MS,
};

/**
 * Decode HTML entities in a string
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
    "&eacute;": "é",
    "&egrave;": "è",
    "&ecirc;": "ê",
    "&agrave;": "à",
    "&acirc;": "â",
    "&ocirc;": "ô",
    "&ucirc;": "û",
    "&icirc;": "î",
    "&ccedil;": "ç",
    "&ugrave;": "ù",
    "&euml;": "ë",
    "&iuml;": "ï",
    "&ouml;": "ö",
    "&uuml;": "ü",
    "&Eacute;": "É",
    "&Egrave;": "È",
    "&Agrave;": "À",
    "&Ccedil;": "Ç",
    "&rsquo;": "\u2019",
    "&lsquo;": "\u2018",
    "&rdquo;": "\u201D",
    "&ldquo;": "\u201C",
    "&ndash;": "\u2013",
    "&mdash;": "\u2014",
    "&hellip;": "\u2026",
    "&euro;": "\u20AC",
  };

  let result = text;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, "g"), char);
  }

  // Handle numeric entities (&#123; or &#x7B;)
  result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 16))
  );

  return result;
}

/**
 * Strip HTML tags from a string
 */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/**
 * Extract image URL from various RSS formats
 */
function extractImageUrl(item: Record<string, unknown>): string | undefined {
  // Try media:content
  const mediaContent = item["media:content"] as Record<string, unknown> | undefined;
  if (mediaContent?.["@_url"]) {
    return mediaContent["@_url"] as string;
  }

  // Try media:thumbnail
  const mediaThumbnail = item["media:thumbnail"] as Record<string, unknown> | undefined;
  if (mediaThumbnail?.["@_url"]) {
    return mediaThumbnail["@_url"] as string;
  }

  // Try enclosure
  const enclosure = item.enclosure as Record<string, unknown> | undefined;
  if (enclosure?.["@_url"] && (enclosure["@_type"] as string)?.startsWith("image/")) {
    return enclosure["@_url"] as string;
  }

  // Try to extract from content or description
  const content = (item["content:encoded"] || item.description || "") as string;
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) {
    return imgMatch[1];
  }

  return undefined;
}

/**
 * Parse RSS date string to Date object
 */
function parseRSSDate(dateStr: string): Date {
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? new Date() : date;
}

/**
 * RSS Feed Client class
 */
export class RSSClient {
  private http: HTTPClient;
  private parser: XMLParser;
  private options: Required<RSSClientOptions>;

  constructor(options: RSSClientOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.http = new HTTPClient({
      timeout: this.options.timeout,
      retries: this.options.retries,
      rateLimitMs: this.options.rateLimitMs,
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });

    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });
  }

  /**
   * Fetch and parse a single RSS feed
   */
  async fetchFeed(config: RSSFeedConfig): Promise<RSSFeed> {
    try {
      // Fetch raw XML
      const response = await this.http.getText(config.url, { timeout: this.options.timeout });
      const xml = response.data;
      const parsed = this.parser.parse(xml);

      // Handle RSS 2.0 format
      const channel = parsed.rss?.channel || parsed.feed;
      if (!channel) {
        throw new Error(`Invalid RSS format for ${config.name}`);
      }

      // Normalize items (RSS 2.0 uses "item", Atom uses "entry")
      const rawItems = channel.item || channel.entry || [];
      const itemsArray = Array.isArray(rawItems) ? rawItems : [rawItems];

      const items: RSSItem[] = itemsArray.map((item: Record<string, unknown>) => {
        // Get GUID (RSS) or ID (Atom)
        let guid = item.guid || item.id || "";
        if (typeof guid === "object" && guid !== null) {
          guid =
            (guid as Record<string, unknown>)["#text"] ||
            (guid as Record<string, unknown>)["@_isPermaLink"] ||
            "";
        }

        // Get link (handle various formats)
        let link = item.link || "";
        if (typeof link === "object" && link !== null) {
          link =
            (link as Record<string, unknown>)["@_href"] ||
            (link as Record<string, unknown>)["#text"] ||
            "";
        }

        // Get title
        const title = decodeHtmlEntities(stripHtmlTags(String(item.title || "")));

        // Get description
        const rawDesc = item.description || item.summary || item["content:encoded"] || "";
        const description = decodeHtmlEntities(stripHtmlTags(String(rawDesc))).slice(0, 1000);

        // Get publication date
        const pubDateStr = item.pubDate || item.published || item.updated || item["dc:date"] || "";
        const pubDate = parseRSSDate(String(pubDateStr));

        // Get image
        const imageUrl = extractImageUrl(item);

        return {
          title,
          description: description || undefined,
          link: String(link),
          guid: String(guid) || String(link), // Use link as fallback GUID
          pubDate,
          imageUrl,
        };
      });

      return {
        source: config.id,
        title: channel.title || config.name,
        items: items.filter((item) => item.title && item.link), // Filter invalid items
      };
    } catch (error) {
      if (error instanceof HTTPError) {
        throw error;
      }
      throw new Error(`Failed to fetch RSS feed ${config.name}: ${error}`);
    }
  }

  /**
   * Fetch all configured RSS feeds
   */
  async fetchAllFeeds(feedIds?: string[]): Promise<Map<string, RSSFeed>> {
    const feeds = feedIds ? RSS_FEEDS.filter((f) => feedIds.includes(f.id)) : RSS_FEEDS;

    const results = new Map<string, RSSFeed>();

    for (const config of feeds) {
      try {
        const feed = await this.fetchFeed(config);
        results.set(config.id, feed);
      } catch (error) {
        console.error(`Error fetching ${config.name}: ${error}`);
        // Continue with other feeds
      }
    }

    return results;
  }

  /**
   * Get feed configuration by ID
   */
  static getFeedConfig(id: string): RSSFeedConfig | undefined {
    return RSS_FEEDS.find((f) => f.id === id);
  }

  /**
   * Get all feed configurations
   */
  static getAllFeedConfigs(): RSSFeedConfig[] {
    return [...RSS_FEEDS];
  }
}

/**
 * Default RSS client instance
 */
export const rssClient = new RSSClient();
