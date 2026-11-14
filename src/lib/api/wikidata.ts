/**
 * Unified Wikidata Service
 *
 * Provides typed access to Wikidata API with batching and rate limiting.
 */

import { HTTPClient } from "./http-client";
import { WIKIDATA_RATE_LIMIT_MS } from "@/config/rate-limits";
import { WD_ENTITIES, WD_POSITIONS } from "@/config/wikidata";

// ============================================================================
// Constants
// ============================================================================

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

/**
 * Wikidata property IDs
 */
export const WIKIDATA_PROPS = {
  INSTANCE_OF: "P31",
  NATIONALITY: "P27",
  BIRTH_DATE: "P569",
  DEATH_DATE: "P570",
  POSITION_HELD: "P39",
  POLITICAL_PARTY: "P102",
  IMAGE: "P18",
  SEX_OR_GENDER: "P21",
  OCCUPATION: "P106",
  START_TIME: "P580",
  END_TIME: "P582",
  PARLIAMENTARY_GROUP: "P4100",
  OF: "P642",
} as const;

/**
 * Wikidata entity IDs for filtering.
 * Re-exported from @/config/wikidata (single source of truth for Q-IDs).
 */
export const WIKIDATA_ENTITIES = WD_ENTITIES;

/**
 * Set of position IDs that indicate a French politician.
 * Built from WD_POSITIONS - handles both string and string[] values.
 */
export const POLITICAL_POSITIONS: Set<string> = new Set(
  Object.values(WD_POSITIONS).flatMap((v) => (Array.isArray(v) ? v : [v]))
);

// ============================================================================
// Types
// ============================================================================

export interface WikidataServiceOptions {
  rateLimitMs?: number;
  batchSize?: number;
}

export interface WikidataSearchResult {
  id: string;
  label: string;
  description?: string;
}

export interface WikidataEntity {
  id: string;
  labels: Record<string, string>;
  descriptions: Record<string, string>;
  claims: WikidataClaims;
}

export interface WikidataClaims {
  [property: string]: WikidataClaim[] | undefined;
}

export interface WikidataClaim {
  mainsnak: {
    datavalue?: {
      value: WikidataValue;
      type: string;
    };
  };
  qualifiers?: {
    [property: string]: Array<{
      datavalue?: {
        value: WikidataValue;
      };
    }>;
  };
}

export type WikidataValue =
  | { id: string } // Entity reference
  | { time: string; precision: number } // Time value
  | { amount: string; unit: string } // Quantity value (e.g., duration)
  | string; // String value

export interface WikidataPosition {
  positionId: string;
  positionLabel?: string;
  startDate?: Date;
  endDate?: Date;
  partyId?: string;
  ofEntityId?: string; // P642 "of" qualifier (e.g. which organization the position applies to)
}

export interface WikidataPartyAffiliation {
  partyWikidataId: string;
  startDate?: Date;
  endDate?: Date;
}

// ============================================================================
// Service
// ============================================================================

export class WikidataService {
  private client: HTTPClient;
  private batchSize: number;

  constructor(options: WikidataServiceOptions = {}) {
    this.client = new HTTPClient({
      rateLimitMs: options.rateLimitMs ?? WIKIDATA_RATE_LIMIT_MS,
      retries: 3,
      timeout: 30000,
    });
    this.batchSize = options.batchSize ?? 50;
  }

  // --------------------------------------------------------------------------
  // Search
  // --------------------------------------------------------------------------

  /**
   * Search Wikidata by name
   */
  async searchByName(
    name: string,
    options: { language?: string; limit?: number } = {}
  ): Promise<WikidataSearchResult[]> {
    const { language = "fr", limit = 5 } = options;

    const url = new URL(WIKIDATA_API);
    url.searchParams.set("action", "wbsearchentities");
    url.searchParams.set("search", name);
    url.searchParams.set("language", language);
    url.searchParams.set("type", "item");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("format", "json");

    const response = await this.client.get<{
      search: Array<{ id: string; label: string; description?: string }>;
    }>(url.toString());

    return (response.data.search || []).map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
    }));
  }

  // --------------------------------------------------------------------------
  // Entity Fetching
  // --------------------------------------------------------------------------

  /**
   * Fetch entities by IDs (handles batching)
   */
  async getEntities(
    ids: string[],
    props: string[] = ["labels", "claims"]
  ): Promise<Map<string, WikidataEntity>> {
    const results = new Map<string, WikidataEntity>();
    if (ids.length === 0) return results;

    // Process in batches
    for (let i = 0; i < ids.length; i += this.batchSize) {
      const batch = ids.slice(i, i + this.batchSize);
      const batchResults = await this.fetchEntityBatch(batch, props);

      batchResults.forEach((entity, id) => {
        results.set(id, entity);
      });
    }

    return results;
  }

  /**
   * Fetch a single batch of entities
   */
  private async fetchEntityBatch(
    ids: string[],
    props: string[]
  ): Promise<Map<string, WikidataEntity>> {
    const url = new URL(WIKIDATA_API);
    url.searchParams.set("action", "wbgetentities");
    url.searchParams.set("ids", ids.join("|"));
    url.searchParams.set("props", props.join("|"));
    url.searchParams.set("languages", "fr|en");
    url.searchParams.set("format", "json");

    const response = await this.client.get<{
      entities: Record<string, RawWikidataEntity>;
    }>(url.toString());

    const results = new Map<string, WikidataEntity>();

    for (const [id, raw] of Object.entries(response.data.entities || {})) {
      if (!raw || raw.missing !== undefined) continue;

      results.set(id, {
        id,
        labels: this.extractLabels(raw.labels),
        descriptions: this.extractLabels(raw.descriptions),
        claims: raw.claims || {},
      });
    }

    return results;
  }

  private extractLabels(
    labels: Record<string, { value: string }> | undefined
  ): Record<string, string> {
    if (!labels) return {};
    const result: Record<string, string> = {};
    for (const [lang, data] of Object.entries(labels)) {
      result[lang] = data.value;
    }
    return result;
  }

  // --------------------------------------------------------------------------
  // Typed Helpers
  // --------------------------------------------------------------------------

  /**
   * Get birth dates for multiple entities
   */
  async getBirthDates(entityIds: string[]): Promise<Map<string, Date | null>> {
    const entities = await this.getEntities(entityIds);
    const results = new Map<string, Date | null>();

    entities.forEach((entity, id) => {
      results.set(id, this.extractDate(entity.claims[WIKIDATA_PROPS.BIRTH_DATE]));
    });

    return results;
  }

  /**
   * Get death dates for multiple entities
   */
  async getDeathDates(entityIds: string[]): Promise<Map<string, Date | null>> {
    const entities = await this.getEntities(entityIds);
    const results = new Map<string, Date | null>();

    entities.forEach((entity, id) => {
      results.set(id, this.extractDate(entity.claims[WIKIDATA_PROPS.DEATH_DATE]));
    });

    return results;
  }

  /**
   * Get both birth and death dates
   */
  async getLifeDates(
    entityIds: string[]
  ): Promise<Map<string, { birthDate: Date | null; deathDate: Date | null }>> {
    const entities = await this.getEntities(entityIds);
    const results = new Map<string, { birthDate: Date | null; deathDate: Date | null }>();

    entities.forEach((entity, id) => {
      results.set(id, {
        birthDate: this.extractDate(entity.claims[WIKIDATA_PROPS.BIRTH_DATE]),
        deathDate: this.extractDate(entity.claims[WIKIDATA_PROPS.DEATH_DATE]),
      });
    });

    return results;
  }

  /**
   * Get positions held for multiple entities
   */
  async getPositions(entityIds: string[]): Promise<Map<string, WikidataPosition[]>> {
    const entities = await this.getEntities(entityIds);
    const results = new Map<string, WikidataPosition[]>();

    entities.forEach((entity, id) => {
      results.set(id, this.extractPositions(entity.claims[WIKIDATA_PROPS.POSITION_HELD]));
    });

    return results;
  }

  /**
   * Get political party affiliations (P102) for multiple entities
   */
  async getPoliticalParties(entityIds: string[]): Promise<Map<string, WikidataPartyAffiliation[]>> {
    const entities = await this.getEntities(entityIds);
    const results = new Map<string, WikidataPartyAffiliation[]>();

    entities.forEach((entity, id) => {
      results.set(id, this.extractPartyAffiliations(entity.claims[WIKIDATA_PROPS.POLITICAL_PARTY]));
    });

    return results;
  }

  /**
   * Check if entities are French politicians
   */
  async checkFrenchPoliticians(
    entityIds: string[]
  ): Promise<Map<string, { isFrench: boolean; isPolitician: boolean; birthDate: Date | null }>> {
    const entities = await this.getEntities(entityIds);
    const results = new Map<
      string,
      { isFrench: boolean; isPolitician: boolean; birthDate: Date | null }
    >();

    entities.forEach((entity, id) => {
      const isFrench = this.checkNationality(
        entity.claims[WIKIDATA_PROPS.NATIONALITY],
        WIKIDATA_ENTITIES.FRANCE
      );
      const isHuman = this.checkInstanceOf(
        entity.claims[WIKIDATA_PROPS.INSTANCE_OF],
        WIKIDATA_ENTITIES.HUMAN
      );
      const isPolitician =
        isHuman && this.checkPoliticalPositions(entity.claims[WIKIDATA_PROPS.POSITION_HELD]);
      const birthDate = this.extractDate(entity.claims[WIKIDATA_PROPS.BIRTH_DATE]);

      results.set(id, { isFrench, isPolitician, birthDate });
    });

    return results;
  }

  // --------------------------------------------------------------------------
  // Extraction Helpers
  // --------------------------------------------------------------------------

  /**
   * Extract a date from Wikidata claims
   */
  private extractDate(claims: WikidataClaim[] | undefined): Date | null {
    if (!claims || claims.length === 0) return null;

    const timeValue = claims[0]?.mainsnak?.datavalue?.value;
    if (!timeValue || typeof timeValue !== "object" || !("time" in timeValue)) {
      return null;
    }

    // Wikidata format: +1977-12-21T00:00:00Z
    const timeStr = timeValue.time.replace(/^\+/, "").split("T")[0];

    // Handle partial dates (1977-00-00 → January 1st)
    const parts = timeStr!.split("-");
    const year = parseInt(parts[0]!, 10);
    const month = parseInt(parts[1]!, 10) || 1;
    const day = parseInt(parts[2]!, 10) || 1;

    if (isNaN(year) || year < 1800 || year > 2100) return null;

    return new Date(year, month - 1, day);
  }

  /**
   * Extract positions from claims
   */
  private extractPositions(claims: WikidataClaim[] | undefined): WikidataPosition[] {
    if (!claims) return [];

    const positions: WikidataPosition[] = [];

    for (const claim of claims) {
      const positionValue = claim.mainsnak?.datavalue?.value;
      if (!positionValue || typeof positionValue !== "object" || !("id" in positionValue)) {
        continue;
      }

      const position: WikidataPosition = {
        positionId: positionValue.id,
      };

      // Extract qualifiers
      if (claim.qualifiers) {
        // Start date (P580)
        const startClaims = claim.qualifiers[WIKIDATA_PROPS.START_TIME];
        if (startClaims?.[0]?.datavalue?.value) {
          position.startDate = this.extractDateFromValue(startClaims[0].datavalue.value);
        }

        // End date (P582)
        const endClaims = claim.qualifiers[WIKIDATA_PROPS.END_TIME];
        if (endClaims?.[0]?.datavalue?.value) {
          position.endDate = this.extractDateFromValue(endClaims[0].datavalue.value);
        }

        // Party (P4100 or P102)
        const partyClaims =
          claim.qualifiers[WIKIDATA_PROPS.PARLIAMENTARY_GROUP] ||
          claim.qualifiers[WIKIDATA_PROPS.POLITICAL_PARTY];
        if (partyClaims?.[0]?.datavalue?.value) {
          const partyValue = partyClaims[0].datavalue.value;
          if (typeof partyValue === "object" && "id" in partyValue) {
            position.partyId = partyValue.id;
          }
        }

        // "Of" qualifier (P642) - indicates which organization the position applies to
        const ofClaims = claim.qualifiers[WIKIDATA_PROPS.OF];
        if (ofClaims?.[0]?.datavalue?.value) {
          const ofValue = ofClaims[0].datavalue.value;
          if (typeof ofValue === "object" && "id" in ofValue) {
            position.ofEntityId = ofValue.id;
          }
        }
      }

      positions.push(position);
    }

    return positions;
  }

  /**
   * Extract party affiliations from P102 claims
   */
  private extractPartyAffiliations(
    claims: WikidataClaim[] | undefined
  ): WikidataPartyAffiliation[] {
    if (!claims) return [];

    const affiliations: WikidataPartyAffiliation[] = [];

    for (const claim of claims) {
      const partyValue = claim.mainsnak?.datavalue?.value;
      if (!partyValue || typeof partyValue !== "object" || !("id" in partyValue)) {
        continue;
      }

      const affiliation: WikidataPartyAffiliation = {
        partyWikidataId: partyValue.id,
      };

      // Extract qualifiers
      if (claim.qualifiers) {
        // Start date (P580)
        const startClaims = claim.qualifiers[WIKIDATA_PROPS.START_TIME];
        if (startClaims?.[0]?.datavalue?.value) {
          affiliation.startDate = this.extractDateFromValue(startClaims[0].datavalue.value);
        }

        // End date (P582)
        const endClaims = claim.qualifiers[WIKIDATA_PROPS.END_TIME];
        if (endClaims?.[0]?.datavalue?.value) {
          affiliation.endDate = this.extractDateFromValue(endClaims[0].datavalue.value);
        }
      }

      affiliations.push(affiliation);
    }

    return affiliations;
  }

  private extractDateFromValue(value: WikidataValue): Date | undefined {
    if (typeof value !== "object" || !("time" in value)) return undefined;
    const date = this.extractDate([{ mainsnak: { datavalue: { value, type: "time" } } }]);
    return date ?? undefined;
  }

  /**
   * Check if entity has a specific nationality
   */
  private checkNationality(claims: WikidataClaim[] | undefined, countryId: string): boolean {
    if (!claims) return false;
    return claims.some((claim) => {
      const value = claim.mainsnak?.datavalue?.value;
      return typeof value === "object" && "id" in value && value.id === countryId;
    });
  }

  /**
   * Check if entity is an instance of something
   */
  private checkInstanceOf(claims: WikidataClaim[] | undefined, typeId: string): boolean {
    if (!claims) return false;
    return claims.some((claim) => {
      const value = claim.mainsnak?.datavalue?.value;
      return typeof value === "object" && "id" in value && value.id === typeId;
    });
  }

  /**
   * Check if entity has political positions.
   * First checks known positions from WD_POSITIONS, then falls back to
   * accepting any P39 claim (covers city-specific positions like
   * "maire de Paris" that are subclasses of generic positions).
   */
  private checkPoliticalPositions(claims: WikidataClaim[] | undefined): boolean {
    if (!claims || claims.length === 0) return false;
    const hasKnown = claims.some((claim) => {
      const value = claim.mainsnak?.datavalue?.value;
      return typeof value === "object" && "id" in value && POLITICAL_POSITIONS.has(value.id);
    });
    if (hasKnown) return true;
    // Any P39 claim on a French human is strong enough signal
    return claims.some((claim) => {
      const value = claim.mainsnak?.datavalue?.value;
      return typeof value === "object" && "id" in value;
    });
  }
}

// Raw response type
interface RawWikidataEntity {
  id: string;
  missing?: number;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  claims?: WikidataClaims;
}
