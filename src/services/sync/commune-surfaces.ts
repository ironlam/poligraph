import { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { USER_AGENT } from "@/config/site";

/**
 * Import of the commune surface (hectares) served by geo.api.gouv.fr into `Commune.surfaceHa`
 * (#1052). One request for every commune. Idempotent: a value already stored is not rewritten.
 * The provenance shown to readers is the API itself: the documentation does not name the
 * producer of `surface`, so no upstream institution is claimed.
 */

const ENDPOINT = "https://geo.api.gouv.fr/communes?fields=code,surface&limit=100000";

/** Beyond this, a surface is a data error rather than a commune (Maripasoula: about 18 000 km2). */
const MAX_PLAUSIBLE_HA = 3_000_000;

/** A new snapshot covering less than this share of the base is refused. */
const MIN_COVERAGE = 0.9;

export interface SurfaceRecord {
  code: string;
  hectares: number;
}

export interface SurfacePlan {
  /** Rows whose stored value differs from the source (including null to a value). */
  toWrite: SurfaceRecord[];
  unchanged: number;
  /** Source codes with no `Commune` row: skipped, never created. */
  unknownCodes: string[];
  /** Source rows with no usable surface (missing, zero, negative or implausible). */
  rejected: number;
  /** Communes of the base the source does not cover: their surface stays as is. */
  missingFromSource: number;
}

/** Pure: what to write, given the source rows and the stored surfaces. */
export function planSurfaces(
  source: Array<{ code?: unknown; surface?: unknown }>,
  stored: Map<string, number | null>
): SurfacePlan {
  const toWrite: SurfaceRecord[] = [];
  const unknownCodes: string[] = [];
  const seen = new Set<string>();
  let unchanged = 0;
  let rejected = 0;

  for (const row of source) {
    if (typeof row.code !== "string") continue;
    const hectares = row.surface;
    if (
      typeof hectares !== "number" ||
      !Number.isFinite(hectares) ||
      hectares <= 0 ||
      hectares > MAX_PLAUSIBLE_HA
    ) {
      rejected++;
      continue;
    }
    if (!stored.has(row.code)) {
      unknownCodes.push(row.code);
      continue;
    }
    seen.add(row.code);
    if (stored.get(row.code) === hectares) unchanged++;
    else toWrite.push({ code: row.code, hectares });
  }

  return {
    toWrite,
    unchanged,
    unknownCodes,
    rejected,
    missingFromSource: stored.size - seen.size,
  };
}

export interface SurfaceReport {
  dryRun: boolean;
  /** False until the manual SQL has added the column. */
  columnReady: boolean;
  sourceRows: number;
  communesInBase: number;
  plan: Omit<SurfacePlan, "toWrite"> & { toWrite: number };
  written: number;
}

export async function syncCommuneSurfaces(
  options: { dryRun?: boolean } = {}
): Promise<SurfaceReport> {
  const dryRun = options.dryRun ?? false;

  const response = await fetch(ENDPOINT, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`geo.api.gouv.fr : HTTP ${response.status}`);
  const source = (await response.json()) as Array<{ code?: unknown; surface?: unknown }>;
  if (!Array.isArray(source)) throw new Error("geo.api.gouv.fr : réponse inattendue");

  let columnReady = true;
  let rows: Array<{ id: string; surfaceHa: number | null }> = [];
  try {
    rows = await db.commune.findMany({ select: { id: true, surfaceHa: true } });
  } catch (error) {
    // Column not created yet (manual SQL not applied): compute the plan on an empty base.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
      columnReady = false;
      const ids = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Commune"`;
      rows = ids.map((r) => ({ id: r.id, surfaceHa: null }));
    } else {
      throw error;
    }
  }
  const stored = new Map(rows.map((r) => [r.id, r.surfaceHa]));
  const plan = planSurfaces(source, stored);

  const report: SurfaceReport = {
    dryRun,
    columnReady,
    sourceRows: source.length,
    communesInBase: stored.size,
    plan: { ...plan, toWrite: plan.toWrite.length },
    written: 0,
  };
  if (dryRun) return report;

  if (!columnReady) throw new Error('Colonne "surfaceHa" absente : appliquer le SQL manuel.');
  const covered = stored.size - plan.missingFromSource;
  if (stored.size > 0 && covered < stored.size * MIN_COVERAGE) {
    throw new Error(`Source trop partielle (${covered} communes sur ${stored.size}) : refusé.`);
  }

  for (let i = 0; i < plan.toWrite.length; i += 2000) {
    const batch = plan.toWrite.slice(i, i + 2000);
    const ids = batch.map((r) => r.code);
    const values = batch.map((r) => r.hectares);
    report.written += await db.$executeRaw`
      UPDATE "Commune" AS c
      SET "surfaceHa" = v.s
      FROM unnest(${ids}::text[], ${values}::float8[]) AS v(id, s)
      WHERE c.id = v.id`;
  }
  return report;
}
