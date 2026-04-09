import {
  PREFIX_TO_ENTITY,
  PUBLIC_ID_ENTITIES,
  type PublicIdEntityType,
  type PublicIdPrefix,
} from "./types";

const PUBLIC_ID_PATTERN = /^([A-Z]{2})-(\d{6,})$/;

export interface ParsedPublicId {
  publicId: string;
  prefix: PublicIdPrefix;
  entityType: PublicIdEntityType;
  sequence: number;
}

/**
 * Parse a poligraphId into its components. Returns null for invalid format or
 * unknown prefix. Accepts any sequence length of 6 or more digits.
 *
 * @example
 * parsePublicId("AF-000542") // { prefix: "AF", entityType: "affair", sequence: 542 }
 * parsePublicId("unknown")    // null
 * parsePublicId("XX-000001")  // null (unknown prefix)
 */
export function parsePublicId(value: string): ParsedPublicId | null {
  const match = value.match(PUBLIC_ID_PATTERN);
  if (!match) return null;

  const prefix = match[1] as PublicIdPrefix;
  const entityType = PREFIX_TO_ENTITY[prefix];
  if (!entityType) return null;

  return {
    publicId: value,
    prefix,
    entityType,
    sequence: parseInt(match[2]!, 10),
  };
}

/**
 * Format a sequence integer as a poligraphId with six-digit zero padding.
 * Sequences above 999999 extend naturally without padding loss.
 *
 * @example
 * formatPublicId("AF", 542)    // "AF-000542"
 * formatPublicId("PG", 1000000) // "PG-1000000"
 */
export function formatPublicId(prefix: PublicIdPrefix, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Sequence must be a positive integer, got ${sequence}`);
  }
  return `${prefix}-${String(sequence).padStart(6, "0")}`;
}

/**
 * Format a sequence integer as a poligraphId for a given entity type.
 */
export function formatPublicIdForEntity(entityType: PublicIdEntityType, sequence: number): string {
  return formatPublicId(PUBLIC_ID_ENTITIES[entityType].prefix, sequence);
}

/**
 * Return true if the string is a syntactically valid poligraphId with a
 * recognised prefix. Does not hit the database.
 */
export function isValidPublicId(value: string): boolean {
  return parsePublicId(value) !== null;
}
