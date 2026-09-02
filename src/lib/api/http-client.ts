/**
 * HTTP Client with retry, backoff, and rate limiting
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Rate limiting between requests
 * - Timeout handling
 * - Batch requests with concurrency control
 */

import { USER_AGENT } from "@/config/site";

export interface HTTPClientOptions {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  rateLimitMs?: number;
  headers?: Record<string, string>;
  /** Enable response caching (default: false) */
  enableCache?: boolean;
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtlMs?: number;
  /** Source name for logging (e.g. "Wikidata SPARQL") */
  sourceName?: string;
}

export interface RequestOptions {
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
  /** Skip cache for this request */
  skipCache?: boolean;
}

export interface HTTPResponse<T> {
  data: T;
  status: number;
  ok: boolean;
  cached?: boolean;
}

interface CacheEntry<T> {
  data: T;
  status: number;
  expiresAt: number;
}

export class HTTPError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string
  ) {
    super(message);
    this.name = "HTTPError";
  }
}

/** Guard against a cyclic `cause` chain. */
const MAX_CAUSE_DEPTH = 5;

/** Guard against a cyclic or pathologically wide error graph. */
const MAX_FLATTENED_ERRORS = 20;

function errorLabel(error: Error): string {
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? `${error.message} [${code}]` : error.message;
}

function redactUrlForError(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "[redacted URL]";
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "[redacted URL]";
  }
}

/**
 * Flatten an error and its `cause` chain into a single readable line.
 *
 * Node's fetch reports every connection-level problem as the opaque message
 * "fetch failed" and hides the real reason (ENOTFOUND, ECONNREFUSED, a TLS
 * error…) in `cause` — sometimes wrapped one more level in an AggregateError
 * when several IPs were tried. Logging only `error.message` therefore discards
 * the one detail needed to triage the failure.
 *
 * Example: `fetch failed <- getaddrinfo ENOTFOUND example.fr [ENOTFOUND]`
 */
export function describeError(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (current === undefined || current === null || seen.has(current)) break;
    seen.add(current);

    if (!(current instanceof Error)) {
      parts.push(String(current));
      break;
    }

    parts.push(errorLabel(current));

    // undici groups per-IP connection failures into an AggregateError; the
    // individual attempts carry the real errno, so surface them.
    if (current instanceof AggregateError && current.errors?.length) {
      const inner = current.errors.filter((e): e is Error => e instanceof Error).map(errorLabel);
      const unique = [...new Set(inner)];
      if (unique.length > 0) {
        parts.push(unique.join(", "));
        break;
      }
    }

    current = current.cause;
  }

  return parts.join(" <- ");
}

/**
 * errno codes returned when the hostname itself has no DNS answer.
 *
 * `EAI_AGAIN` is deliberately absent: it is a resolver timeout, which a retry
 * does fix, whereas these three mean the name does not exist.
 */
const UNRESOLVABLE_HOST_CODES = new Set(["ENOTFOUND", "EAI_NODATA", "EAI_NONAME"]);

/** Flatten an error, its `cause` chain and any aggregated members. */
function flattenErrors(error: unknown): Error[] {
  const flattened: Error[] = [];
  const seen = new Set<unknown>();
  const queue: unknown[] = [error];

  while (queue.length > 0 && flattened.length < MAX_FLATTENED_ERRORS) {
    const current = queue.shift();
    if (!(current instanceof Error) || seen.has(current)) continue;
    seen.add(current);
    flattened.push(current);

    if (current instanceof AggregateError && current.errors?.length) {
      queue.push(...current.errors);
    }
    if (current.cause !== undefined) queue.push(current.cause);
  }

  return flattened;
}

/**
 * True when the failure is DNS answering "no such host".
 *
 * A decommissioned source answers this way for every request it is sent:
 * docparl.assemblee-nationale.fr disappeared from DNS in 2026 and turned each
 * daily sync into twenty identical `ENOTFOUND` lines. Retrying, or walking the
 * rest of a batch, only multiplies one permanent failure, so callers use this
 * to stop early and report the host once.
 */
export function isUnresolvableHostError(error: unknown): boolean {
  return flattenErrors(error).some((err) => {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && UNRESOLVABLE_HOST_CODES.has(code)) return true;
    return /\b(ENOTFOUND|EAI_NODATA|EAI_NONAME)\b/.test(err.message);
  });
}

const DEFAULT_OPTIONS: Required<HTTPClientOptions> = {
  baseUrl: "",
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
  rateLimitMs: 0,
  headers: {},
  enableCache: false,
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
  sourceName: "",
};

/**
 * Merge caller-controlled headers without allowing them to replace the crawler identity.
 * Headers normalizes names case-insensitively, so every User-Agent spelling is removed before
 * the canonical value is set.
 */
function mergeRequestHeaders(...sources: Array<HeadersInit | undefined>): Headers {
  const headers = new Headers();

  for (const source of sources) {
    if (!source) continue;
    new Headers(source).forEach((value, name) => {
      if (name.toLowerCase() !== "user-agent") headers.set(name, value);
    });
  }

  headers.set("User-Agent", USER_AGENT);
  return headers;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * HTTP Client class with built-in resilience
 */
export class HTTPClient {
  private options: Required<HTTPClientOptions>;
  private lastRequestTime = 0;
  private cache = new Map<string, CacheEntry<unknown>>();

  constructor(options: HTTPClientOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Get from cache if valid
   */
  private getFromCache<T>(url: string): HTTPResponse<T> | null {
    if (!this.options.enableCache) return null;

    const entry = this.cache.get(url) as CacheEntry<T> | undefined;
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(url);
      return null;
    }

    return { data: entry.data, status: entry.status, ok: true, cached: true };
  }

  /**
   * Store in cache
   */
  private setCache<T>(url: string, data: T, status: number): void {
    if (!this.options.enableCache) return;

    this.cache.set(url, {
      data,
      status,
      expiresAt: Date.now() + this.options.cacheTtlMs,
    });

    // Cleanup old entries periodically (keep cache size reasonable)
    if (this.cache.size > 1000) {
      this.cleanupCache();
    }
  }

  /**
   * Remove expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      if (now > entry.expiresAt) {
        toDelete.push(key);
      }
    });

    toDelete.forEach((key) => this.cache.delete(key));
  }

  /**
   * Clear all cache entries
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; enabled: boolean } {
    return {
      size: this.cache.size,
      enabled: this.options.enableCache,
    };
  }

  /**
   * Wait for rate limit if needed
   */
  private async waitForRateLimit(): Promise<void> {
    if (this.options.rateLimitMs <= 0) return;

    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.options.rateLimitMs) {
      await sleep(this.options.rateLimitMs - timeSinceLastRequest);
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Execute a fetch with retry logic
   */
  private async fetchWithRetry<T>(
    url: string,
    init: RequestInit,
    options: RequestOptions,
    parseAs: "json" | "text" | "arrayBuffer" | "head" = "json"
  ): Promise<HTTPResponse<T>> {
    const maxRetries = options.retries ?? this.options.retries;
    const timeout = options.timeout ?? this.options.timeout;
    const safeUrl = redactUrlForError(url);
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.waitForRateLimit();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
          headers: mergeRequestHeaders(this.options.headers, init.headers, options.headers),
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          // Don't retry on client errors (4xx) except 429 (rate limit)
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            throw new HTTPError(
              `HTTP ${response.status}: ${response.statusText}`,
              response.status,
              url
            );
          }

          // Log 429 with source name for observability
          if (response.status === 429) {
            const source = this.options.sourceName || safeUrl;
            console.warn(
              `[HTTPClient] 429 Too Many Requests from ${source} (attempt ${attempt + 1}/${maxRetries + 1})`
            );
          }

          // Retry on server errors (5xx) and rate limits (429)
          if (attempt < maxRetries) {
            const delay = this.options.retryDelay * Math.pow(2, attempt);
            await sleep(delay);
            continue;
          }

          throw new HTTPError(
            `HTTP ${response.status}: ${response.statusText}`,
            response.status,
            url
          );
        }

        let data: T;
        switch (parseAs) {
          case "text":
            data = (await response.text()) as T;
            break;
          case "arrayBuffer":
            data = Buffer.from(await response.arrayBuffer()) as T;
            break;
          case "head":
            data = null as T;
            break;
          default:
            data = (await response.json()) as T;
        }
        return { data, status: response.status, ok: true, cached: false };
      } catch (error) {
        lastError = error as Error;

        // Don't retry on HTTP client errors
        if (error instanceof HTTPError && error.status >= 400 && error.status < 500) {
          throw error;
        }

        // A host with no DNS answer fails identically on every attempt.
        if (isUnresolvableHostError(error)) break;

        // Retry on network errors and timeouts
        if (attempt < maxRetries) {
          const delay = this.options.retryDelay * Math.pow(2, attempt);
          await sleep(delay);
          continue;
        }
      }
    }

    if (!lastError) {
      throw new Error(`Failed to fetch ${safeUrl}`);
    }

    // HTTPError already carries a precise status; only opaque network errors
    // need their `cause` chain unwrapped into the message.
    if (lastError instanceof HTTPError) {
      throw lastError;
    }

    throw new Error(`${describeError(lastError)} (${safeUrl})`, { cause: lastError });
  }

  /**
   * GET request
   */
  async get<T>(url: string, options: RequestOptions = {}): Promise<HTTPResponse<T>> {
    const fullUrl = this.options.baseUrl ? `${this.options.baseUrl}${url}` : url;

    // Check cache first (unless skipCache is set)
    if (!options.skipCache) {
      const cached = this.getFromCache<T>(fullUrl);
      if (cached) return cached;
    }

    const response = await this.fetchWithRetry<T>(fullUrl, { method: "GET" }, options);

    // Store in cache on success
    if (response.ok && !options.skipCache) {
      this.setCache(fullUrl, response.data, response.status);
    }

    return response;
  }

  /**
   * GET request returning text content (HTML, XML, etc.)
   */
  async getText(url: string, options: RequestOptions = {}): Promise<HTTPResponse<string>> {
    const fullUrl = this.options.baseUrl ? `${this.options.baseUrl}${url}` : url;

    // Check cache first (unless skipCache is set)
    if (!options.skipCache) {
      const cached = this.getFromCache<string>(fullUrl);
      if (cached) return cached;
    }

    const response = await this.fetchWithRetry<string>(fullUrl, { method: "GET" }, options, "text");

    // Store in cache on success
    if (response.ok && !options.skipCache) {
      this.setCache(fullUrl, response.data, response.status);
    }

    return response;
  }

  /**
   * GET request returning a binary buffer (DOCX, images, etc.)
   */
  async getBuffer(url: string, options: RequestOptions = {}): Promise<HTTPResponse<Buffer>> {
    const fullUrl = this.options.baseUrl ? `${this.options.baseUrl}${url}` : url;
    return this.fetchWithRetry<Buffer>(fullUrl, { method: "GET" }, options, "arrayBuffer");
  }

  /**
   * HEAD request — checks URL validity without downloading the body
   */
  async head(url: string, options: RequestOptions = {}): Promise<HTTPResponse<null>> {
    const fullUrl = this.options.baseUrl ? `${this.options.baseUrl}${url}` : url;
    return this.fetchWithRetry<null>(fullUrl, { method: "HEAD" }, options, "head");
  }

  /**
   * POST request
   */
  async post<T>(
    url: string,
    body: unknown,
    options: RequestOptions = {}
  ): Promise<HTTPResponse<T>> {
    const fullUrl = this.options.baseUrl ? `${this.options.baseUrl}${url}` : url;
    return this.fetchWithRetry<T>(
      fullUrl,
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      },
      options
    );
  }

  /**
   * Batch GET requests with concurrency control
   */
  async batchGet<T>(
    urls: string[],
    options: RequestOptions & { concurrency?: number } = {}
  ): Promise<Array<HTTPResponse<T> | Error>> {
    const { concurrency = 5, ...requestOptions } = options;
    const results: Array<HTTPResponse<T> | Error> = [];

    // Process in chunks
    for (let i = 0; i < urls.length; i += concurrency) {
      const chunk = urls.slice(i, i + concurrency);
      const chunkResults = await Promise.allSettled(
        chunk.map((url) => this.get<T>(url, requestOptions))
      );

      for (const result of chunkResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          results.push(result.reason as Error);
        }
      }
    }

    return results;
  }
}

/**
 * Default HTTP client instance
 */
export const httpClient = new HTTPClient();
