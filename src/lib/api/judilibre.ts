/**
 * Judilibre API Client (Cour de cassation via PISTE)
 *
 * OAuth 2.0 client credentials flow for searching criminal decisions.
 * Uses HTTPClient for API calls with retry and rate limiting.
 */

import { HTTPClient, HTTPError } from "./http-client";
import { foldJudicialReference } from "@/lib/affairs/judicial-reference";
import { JUDILIBRE_RATE_LIMIT_MS } from "@/config/rate-limits";

// ============================================
// TYPES
// ============================================

export interface JudilibreSearchResult {
  results: JudilibreDecisionSummary[];
  total: number;
  page: number;
  page_size: number;
  next_page?: string;
  previous_page?: string;
}

export interface JudilibreDecisionSummary {
  id: string;
  /**
   * Absent on historical decisions: ECLI was introduced in France around 2012, and
   * the API omits the field entirely rather than returning an empty string. Verified
   * against a 1997 decision (no `ecli` key) and a 2026 one (`ECLI:FR:CCASS:2026:…`).
   */
  ecli?: string;
  number: string; // N° pourvoi principal
  numbers: string[]; // Tous les n° pourvoi
  decision_date: string; // YYYY-MM-DD
  /** Taxonomy code, e.g. "cc" for Cour de cassation. */
  jurisdiction: string;
  chamber: string; // Taxonomy code, e.g. "cr"
  solution: string; // Taxonomy code: "rejet", "cassation", "irrecevabilite"...
  type: string; // Taxonomy code: "arret", "avis"...
  themes: string[];
  summary: string;
}

/**
 * A full decision record.
 *
 * Field list taken from an actual response, not from the documentation: the API
 * returns `jurisdiction`, `type`, `publication`, `timeline`, `visa`, `nac`,
 * `portalis` and others that were previously undeclared, and returns no `zones`.
 * Extra keys are kept accessible so the raw payload can be stored verbatim.
 */
export interface JudilibreDecision extends JudilibreDecisionSummary {
  text: string; // Texte intégral
  publication?: string[];
  source?: string;
  update_date?: string;
  [key: string]: unknown;
}

/** A taxonomy maps an API code to its official French label. */
export type JudilibreTaxonomy = Record<string, string>;

export type JudilibreTaxonomyId = "jurisdiction" | "chamber" | "solution" | "type";

/**
 * Public URL of a decision on the Cour de cassation site.
 *
 * The API returns no URL field, so it is built from the decision id. Verified to
 * answer 200 for both a 1997 and a 2026 decision.
 */
export function buildJudilibreDecisionUrl(judilibreId: string): string {
  return `https://www.courdecassation.fr/decision/${encodeURIComponent(judilibreId)}`;
}

interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface JudilibreSearchFilters {
  chamber?: string; // "cr" for criminelle
  date_start?: string; // YYYY-MM-DD
  date_end?: string;
  solution?: string;
  page?: number;
  page_size?: number;
}

// ============================================
// CLIENT
// ============================================

/** Token refresh buffer — renew 60s before expiry */
const TOKEN_BUFFER_MS = 60_000;

export class JudilibreClient {
  private httpClient: HTTPClient;
  private oauthUrl: string;
  private clientId: string;
  private clientSecret: string;
  private apiKey: string;

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private taxonomyCache = new Map<JudilibreTaxonomyId, JudilibreTaxonomy>();

  constructor() {
    const baseUrl = process.env.JUDILIBRE_BASE_URL;
    const oauthUrl = process.env.JUDILIBRE_OAUTH_URL;
    const clientId = process.env.JUDILIBRE_CLIENT_ID;
    const clientSecret = process.env.JUDILIBRE_CLIENT_SECRET;
    const apiKey = process.env.JUDILIBRE_API_KEY;

    if (!baseUrl || !oauthUrl || !clientId || !clientSecret || !apiKey) {
      throw new Error(
        "Missing Judilibre config. Set JUDILIBRE_BASE_URL, JUDILIBRE_OAUTH_URL, JUDILIBRE_CLIENT_ID, JUDILIBRE_CLIENT_SECRET, JUDILIBRE_API_KEY"
      );
    }

    this.oauthUrl = oauthUrl;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.apiKey = apiKey;

    this.httpClient = new HTTPClient({
      baseUrl,
      rateLimitMs: JUDILIBRE_RATE_LIMIT_MS,
      retries: 2,
      retryDelay: 2000,
      timeout: 30_000,
    });
  }

  /**
   * Authenticate via OAuth 2.0 client credentials.
   * Auto-refreshes when token is about to expire.
   */
  private async ensureAuthenticated(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - TOKEN_BUFFER_MS) {
      return;
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: "openid",
    });

    const response = await fetch(this.oauthUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Judilibre OAuth failed (${response.status}): ${text}`);
    }

    const data: OAuthTokenResponse = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
  }

  /**
   * Get authorization headers for API requests
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    await this.ensureAuthenticated();
    return {
      Authorization: `Bearer ${this.accessToken}`,
      KeyId: this.apiKey,
    };
  }

  /**
   * Search criminal decisions by query string
   */
  async searchDecisions(
    query: string,
    filters: JudilibreSearchFilters = {}
  ): Promise<JudilibreSearchResult> {
    const headers = await this.getAuthHeaders();

    const params = new URLSearchParams({ query });
    if (filters.chamber) params.set("chamber", filters.chamber);
    if (filters.date_start) params.set("date_start", filters.date_start);
    if (filters.date_end) params.set("date_end", filters.date_end);
    if (filters.solution) params.set("solution", filters.solution);
    if (filters.page) params.set("page", String(filters.page));
    if (filters.page_size) params.set("page_size", String(filters.page_size));

    try {
      const response = await this.httpClient.get<JudilibreSearchResult>(
        `/search?${params.toString()}`,
        { headers }
      );
      return response.data;
    } catch (error) {
      if (error instanceof HTTPError && error.status === 404) {
        // No results
        return { results: [], total: 0, page: 0, page_size: 10 };
      }
      throw error;
    }
  }

  /**
   * Get full decision text by ID
   */
  async getDecision(id: string): Promise<JudilibreDecision> {
    const headers = await this.getAuthHeaders();
    const response = await this.httpClient.get<JudilibreDecision>(`/decision?id=${id}`, {
      headers,
    });
    return response.data;
  }

  /**
   * Official label table for a taxonomy, e.g. `chamber` → `{ cr: "Chambre criminelle" }`.
   *
   * Fetched rather than hardcoded so the labels shown to readers are the ones the
   * Cour de cassation publishes. Cached for the client's lifetime: the taxonomies
   * change on the scale of institutional reform, not of a sync run.
   */
  async getTaxonomy(id: JudilibreTaxonomyId): Promise<JudilibreTaxonomy> {
    const cached = this.taxonomyCache.get(id);
    if (cached) return cached;

    const headers = await this.getAuthHeaders();
    const response = await this.httpClient.get<{ result?: JudilibreTaxonomy }>(
      `/taxonomy?id=${encodeURIComponent(id)}`,
      { headers }
    );
    const taxonomy = response.data?.result ?? {};
    this.taxonomyCache.set(id, taxonomy);
    return taxonomy;
  }

  /**
   * Decisions carrying exactly this pourvoi number.
   *
   * `/search` is full-text, so its hits are candidates, not answers: the results are
   * filtered down to those whose own `numbers` contain the requested reference, after
   * normalisation. Without that filter a near-miss would be handed back as a match.
   *
   * Returns a list because a pourvoi is not unique — it can produce a rejection, a
   * partial cassation and a remand. Deciding between them is the caller's job.
   */
  async findDecisionsByPourvoiNumber(pourvoiNumber: string): Promise<JudilibreDecisionSummary[]> {
    const wanted = foldJudicialReference(pourvoiNumber);
    if (!wanted) return [];

    const { results } = await this.searchDecisions(pourvoiNumber);
    return results.filter((decision) => {
      const numbers = decision.numbers?.length ? decision.numbers : [decision.number];
      return numbers.some((n) => n && foldJudicialReference(n) === wanted);
    });
  }

  /**
   * The decision carrying exactly this ECLI, or null.
   *
   * An ECLI identifies one decision, so a single result is expected; anything that
   * does not match exactly is discarded rather than returned as a near miss.
   */
  async findDecisionByEcli(ecli: string): Promise<JudilibreDecisionSummary | null> {
    const wanted = foldJudicialReference(ecli);
    if (!wanted) return null;

    const { results } = await this.searchDecisions(ecli);
    return (
      results.find((decision) => foldJudicialReference(decision.ecli ?? "") === wanted) ?? null
    );
  }

  /**
   * Health check
   */
  async healthcheck(): Promise<boolean> {
    try {
      const headers = await this.getAuthHeaders();
      await this.httpClient.get("/healthcheck", { headers });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a new Judilibre client instance.
 * Returns null if env vars are not configured.
 */
export function createJudilibreClient(): JudilibreClient | null {
  if (
    !process.env.JUDILIBRE_CLIENT_ID ||
    !process.env.JUDILIBRE_CLIENT_SECRET ||
    !process.env.JUDILIBRE_API_KEY
  ) {
    return null;
  }
  return new JudilibreClient();
}
