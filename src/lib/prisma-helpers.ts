/**
 * Standard include for politician with current party
 */
export const POLITICIAN_WITH_PARTY_INCLUDE = {
  currentParty: true,
} as const;
// ============================================================================
// Sync Helpers
// ============================================================================

import { db } from "./db";
import { DataSource } from "../generated/prisma";

/**
 * Build a map of external IDs to politician IDs for fast lookup
 */
export async function buildExternalIdMap(source: DataSource): Promise<Map<string, string>> {
  const externalIds = await db.externalId.findMany({
    where: {
      source,
      politicianId: { not: null },
    },
    select: {
      externalId: true,
      politicianId: true,
    },
  });

  const map = new Map<string, string>();
  for (const ext of externalIds) {
    if (ext.politicianId) {
      map.set(ext.externalId, ext.politicianId);
    }
  }

  return map;
}

/**
 * Upsert an external ID for a politician
 */
export async function upsertPoliticianExternalId(
  politicianId: string,
  source: DataSource,
  externalId: string,
  url?: string
): Promise<void> {
  await db.externalId.upsert({
    where: {
      source_externalId: {
        source,
        externalId,
      },
    },
    create: {
      politicianId,
      source,
      externalId,
      url,
    },
    update: {
      politicianId,
      url,
    },
  });
}

/**
 * Find a politician by external ID
 */
export async function findPoliticianByExternalId(
  source: DataSource,
  externalId: string
): Promise<string | null> {
  const ext = await db.externalId.findUnique({
    where: {
      source_externalId: {
        source,
        externalId,
      },
    },
    select: {
      politicianId: true,
    },
  });

  return ext?.politicianId ?? null;
}
