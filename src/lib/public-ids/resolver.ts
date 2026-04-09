import { db } from "@/lib/db";
import { parsePublicId } from "./format";
import { type PublicIdEntityType } from "./types";

const MAX_REDIRECT_HOPS = 5;

export interface ResolvedPublicId {
  publicId: string;
  entityType: PublicIdEntityType;
  canonicalPath: string;
  isRedirect: boolean;
  redirectedFrom?: string;
}

/**
 * Resolve a poligraphId to its canonical application path.
 *
 * Returns null when:
 * - the format is invalid or the prefix is unknown
 * - no entity currently owns this identifier and no redirect exists
 * - a redirect chain exceeds MAX_REDIRECT_HOPS (cycle protection)
 *
 * Follows PublicIdRedirect entries when the original ID was retired, so a
 * merged affair still resolves to its canonical survivor. The chain is
 * bounded to protect against accidental cycles.
 */
export async function resolvePublicId(
  publicId: string,
  hopsRemaining: number = MAX_REDIRECT_HOPS
): Promise<ResolvedPublicId | null> {
  if (hopsRemaining <= 0) return null;

  const parsed = parsePublicId(publicId);
  if (!parsed) return null;

  const direct = await lookupByPublicId(parsed.entityType, publicId);
  if (direct) {
    return {
      publicId,
      entityType: parsed.entityType,
      canonicalPath: direct.canonicalPath,
      isRedirect: false,
    };
  }

  const redirect = await db.publicIdRedirect.findUnique({
    where: { fromPublicId: publicId },
  });
  if (!redirect) return null;

  const target = await resolvePublicId(redirect.toPublicId, hopsRemaining - 1);
  if (!target) return null;

  return {
    ...target,
    isRedirect: true,
    redirectedFrom: publicId,
  };
}

/**
 * Per-entity lookup. Each case knows how to compute its canonical path,
 * including context-dependent ones (mandates live under politician pages,
 * electoral lists live under commune pages).
 */
async function lookupByPublicId(
  entityType: PublicIdEntityType,
  publicId: string
): Promise<{ canonicalPath: string } | null> {
  switch (entityType) {
    case "politician": {
      const row = await db.politician.findUnique({
        where: { publicId },
        select: { slug: true },
      });
      return row ? { canonicalPath: `/politiques/${row.slug}` } : null;
    }
    case "affair": {
      const row = await db.affair.findUnique({
        where: { publicId },
        select: { slug: true },
      });
      return row ? { canonicalPath: `/affaires/${row.slug}` } : null;
    }
    case "factcheck": {
      const row = await db.factCheck.findUnique({
        where: { publicId },
        select: { slug: true },
      });
      if (!row) return null;
      // Factcheck slug is nullable in the schema; fall back to the listing
      // page when a specific slug cannot be formed.
      return { canonicalPath: row.slug ? `/factchecks/${row.slug}` : "/factchecks" };
    }
    case "scrutin": {
      const row = await db.scrutin.findUnique({
        where: { publicId },
        select: { slug: true },
      });
      if (!row) return null;
      return {
        canonicalPath: row.slug ? `/parlement/votes/${row.slug}` : "/parlement/votes",
      };
    }
    case "party": {
      const row = await db.party.findUnique({
        where: { publicId },
        select: { slug: true },
      });
      if (!row) return null;
      return { canonicalPath: row.slug ? `/partis/${row.slug}` : "/partis" };
    }
    case "election": {
      const row = await db.election.findUnique({
        where: { publicId },
        select: { slug: true },
      });
      return row ? { canonicalPath: `/elections/${row.slug}` } : null;
    }
    case "mandate": {
      const row = await db.mandate.findUnique({
        where: { publicId },
        select: { politician: { select: { slug: true } } },
      });
      return row ? { canonicalPath: `/politiques/${row.politician.slug}#mandats` } : null;
    }
    case "dossier": {
      const row = await db.legislativeDossier.findUnique({
        where: { publicId },
        select: { slug: true },
      });
      if (!row) return null;
      return {
        canonicalPath: row.slug ? `/parlement/dossiers/${row.slug}` : "/parlement/dossiers",
      };
    }
    case "group": {
      const row = await db.parliamentaryGroup.findUnique({
        where: { publicId },
        select: { slug: true },
      });
      if (!row) return null;
      return {
        canonicalPath: row.slug ? `/parlement/groupes/${row.slug}` : "/parlement/groupes",
      };
    }
    case "electoralList": {
      const row = await db.electoralList.findUnique({
        where: { publicId },
        select: {
          commune: { select: { id: true } },
          election: { select: { slug: true } },
        },
      });
      return row
        ? {
            canonicalPath: `/elections/${row.election.slug}/communes/${row.commune.id}`,
          }
        : null;
    }
    default: {
      const exhaustive: never = entityType;
      throw new Error(`Unknown entity type: ${String(exhaustive)}`);
    }
  }
}
