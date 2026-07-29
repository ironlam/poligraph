/**
 * Orchestration service for generating AI citizen impact explanations for scrutins.
 *
 * Data contract: the voted measure described in "Ce qui était proposé" must come
 * from the OFFICIAL amendment substance (`resolveSubstanceSources`, the same
 * resolver the policy-title pipeline uses), NOT from the broad dossier summary.
 * A coherence guard rejects any generated impact whose vocabulary does not
 * overlap the official reference (the scrutin-2084 import-ban failure mode).
 */

import { db } from "@/lib/db";
import { generateCitizenImpact, type CitizenImpactInput } from "@/services/scrutin-citizen-impact";
import { assessCoherence, type CoherenceVerdict } from "@/services/scrutin-substance/coherence";
import { resolveSubstanceSources } from "@/services/scrutin-policy-title/substance-resolver";
import type { SubstanceDepth } from "@/services/scrutin-policy-title/types";
import { fetchScrutinContext } from "@/services/scrutin-context-fetcher";
import { AI_RATE_LIMIT_MS, AI_429_BACKOFF_MS } from "@/config/rate-limits";

export interface ScrutinCitizenImpactsResult {
  processed: number;
  generated: number;
  skipped: number;
  skippedIncoherent: number;
  contextHits: number;
  errors: string[];
}

export interface PreparedCitizenImpact {
  scrutinId: string;
  slug: string | null;
  title: string;
  hasLinkedAmendment: boolean;
  substanceDepth: SubstanceDepth | null;
  policyTitle: { policyTitle: string | null; policySubtitle: string | null } | null;
  contextHit: boolean;
  input: CitizenImpactInput;
}

/**
 * Builds the EXACT generator input for one scrutin: resolves the official
 * amendment substance, fetches dossier context, and assembles links. Shared by
 * the batch loop and the debug script so the model always sees the same input.
 * Returns null when the scrutin does not exist.
 */
export async function prepareCitizenImpactInput(
  scrutinId: string,
  opts?: { skipScrape?: boolean }
): Promise<PreparedCitizenImpact | null> {
  const skipScrape = opts?.skipScrape ?? true;

  const scrutin = await db.scrutin.findUnique({
    where: { id: scrutinId },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      theme: true,
      result: true,
      votesFor: true,
      votesAgainst: true,
      votesAbstain: true,
      chamber: true,
      votingDate: true,
      sourceUrl: true,
      dossierLegislatifId: true,
      policyTitle: { select: { policyTitle: true, policySubtitle: true } },
      amendmentLinks: { select: { amendmentId: true } },
    },
  });

  if (!scrutin) return null;

  // OFFICIAL substance — the only measure-bearing source when present.
  const resolved = await resolveSubstanceSources(scrutinId);

  const context = await fetchScrutinContext(scrutin.title, scrutin.sourceUrl, db, {
    skipScrape,
    dossierLegislatifId: scrutin.dossierLegislatifId,
  });
  const contextHit = Boolean(context.dossierTitle || context.sourcePageText);

  const links: CitizenImpactInput["links"] = {
    dossierUrl: null,
    dossierLabel: null,
    relatedVotes: [],
    politicians: [],
  };

  if (context.dossierSlug) {
    links.dossierUrl = `/parlement/dossiers/${context.dossierSlug}`;
    links.dossierLabel = context.dossierTitle ?? "Dossier législatif";
  }

  if (scrutin.dossierLegislatifId) {
    const relatedScrutins = await db.scrutin.findMany({
      where: {
        dossierLegislatifId: scrutin.dossierLegislatifId,
        id: { not: scrutin.id },
        slug: { not: null },
      },
      select: { slug: true, title: true },
      orderBy: { votingDate: "desc" },
      take: 3,
    });
    for (const related of relatedScrutins) {
      links.relatedVotes.push({
        url: `/parlement/votes/${related.slug}`,
        label: related.title.slice(0, 80),
      });
    }
  }

  const notableVoters = await db.vote.findMany({
    where: { scrutinId: scrutin.id, position: { in: ["POUR", "CONTRE"] } },
    include: {
      politician: {
        select: { slug: true, firstName: true, lastName: true, prominenceScore: true },
      },
    },
    orderBy: { politician: { prominenceScore: "desc" } },
    take: 6,
  });
  const pourVoters = notableVoters
    .filter(
      (v: { position: string; politician: { slug: string | null } }) =>
        v.position === "POUR" && v.politician.slug
    )
    .slice(0, 2);
  const contreVoters = notableVoters
    .filter(
      (v: { position: string; politician: { slug: string | null } }) =>
        v.position === "CONTRE" && v.politician.slug
    )
    .slice(0, 2);
  for (const v of [...pourVoters, ...contreVoters]) {
    links.politicians.push({
      url: `/politiques/${v.politician.slug}`,
      label: `${v.politician.firstName} ${v.politician.lastName}`,
      position: v.position === "POUR" ? "pour" : "contre",
    });
  }

  const input: CitizenImpactInput = {
    title: scrutin.title,
    summary: scrutin.summary,
    theme: scrutin.theme,
    result: scrutin.result as "ADOPTED" | "REJECTED",
    votesFor: scrutin.votesFor,
    votesAgainst: scrutin.votesAgainst,
    votesAbstain: scrutin.votesAbstain,
    chamber: scrutin.chamber as "AN" | "SENAT",
    votingDate: scrutin.votingDate.toISOString().split("T")[0]!,
    dossierTitle: context.dossierTitle,
    dossierSummary: context.dossierSummary,
    sourcePageText: context.sourcePageText,
    substanceBlocks: resolved.blocks,
    substanceDepth: resolved.substanceDepth,
    hasLinkedAmendment: scrutin.amendmentLinks.length > 0,
    links,
  };

  return {
    scrutinId: scrutin.id,
    slug: scrutin.slug,
    title: scrutin.title,
    hasLinkedAmendment: input.hasLinkedAmendment,
    substanceDepth: resolved.substanceDepth,
    policyTitle: scrutin.policyTitle,
    contextHit,
    input,
  };
}

export async function generateScrutinCitizenImpacts(options?: {
  limit?: number;
  force?: boolean;
  skipScrape?: boolean;
  /** Never write to the DB (audit / report mode). */
  dryRun?: boolean;
  /** Restrict processing to these scrutin ids. ALWAYS scoped first in the
   *  WHERE, so a targeted run can never touch the rest of the table. */
  scrutinIds?: string[];
}): Promise<ScrutinCitizenImpactsResult> {
  const { limit, force = false, skipScrape = true, dryRun = false, scrutinIds } = options ?? {};

  const stats: ScrutinCitizenImpactsResult = {
    processed: 0,
    generated: 0,
    skipped: 0,
    skippedIncoherent: 0,
    contextHits: 0,
    errors: [],
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whereClause: any = {};
  if (scrutinIds && scrutinIds.length > 0) {
    whereClause.id = { in: scrutinIds };
  }
  if (!force) {
    whereClause.citizenImpact = null;
  }
  whereClause.summary = { not: null };

  let scrutins = await db.scrutin.findMany({
    where: whereClause,
    orderBy: { votingDate: "desc" },
    select: { id: true },
  });

  if (limit) {
    scrutins = scrutins.slice(0, limit);
  }

  console.log(
    `[citizen-impacts] Found ${scrutins.length} scrutins to process${dryRun ? " (dry-run)" : ""}`
  );

  if (scrutins.length === 0) {
    return stats;
  }

  for (let i = 0; i < scrutins.length; i++) {
    const id = scrutins[i]!.id;

    try {
      const prepared = await prepareCitizenImpactInput(id, { skipScrape });
      if (!prepared) {
        stats.skipped++;
        stats.processed++;
        continue;
      }
      if (prepared.contextHit) stats.contextHits++;

      const result = await generateCitizenImpact(prepared.input);
      stats.processed++;

      if (result.confidence < 40) {
        stats.skipped++;
        continue;
      }

      // Coherence guard: for amendment-linked scrutins, the generated impact must
      // echo the official reference (approved policy title, else resolved amendment
      // substance). Runs whenever the scrutin is amendment-linked — NOT only when
      // substance resolved: assessCoherence can check against the policy title even
      // with empty blocks, and when NO reference exists at all (substance not yet
      // resolved AND no policy title) we cannot tell whether the model described
      // THIS amendment or drifted onto the broad dossier — so we refuse to persist.
      // Better an empty "en bref" than a confident wrong one; a later run
      // regenerates once a reference exists, since the row stays null.
      if (prepared.hasLinkedAmendment) {
        const verdict = assessCoherence({
          text: result.citizenImpact,
          policyTitle: prepared.policyTitle?.policyTitle ?? null,
          policySubtitle: prepared.policyTitle?.policySubtitle ?? null,
          blocks: prepared.input.substanceBlocks,
        });
        if (verdict.referenceUsed === "none" || !verdict.coherent) {
          stats.skippedIncoherent++;
          console.warn(
            `[citizen-impacts] NOT PERSISTED for ${prepared.slug ?? id} ` +
              `(coverage ${verdict.coverage.toFixed(2)}, ref=${verdict.referenceUsed})`
          );
          continue;
        }
      }

      if (!dryRun) {
        await db.scrutin.update({
          where: { id },
          data: { citizenImpact: result.citizenImpact, citizenImpactDate: new Date() },
        });
      }

      stats.generated++;

      if (i < scrutins.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, AI_RATE_LIMIT_MS));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      stats.errors.push(`${id}: ${errorMsg}`);
      stats.processed++;

      if (errorMsg.includes("429") || errorMsg.includes("rate")) {
        console.log("[citizen-impacts] Rate limited, waiting 30s...");
        await new Promise((resolve) => setTimeout(resolve, AI_429_BACKOFF_MS));
      }
    }
  }

  return stats;
}

// ============================================
// COHERENCE AUDIT (read-only report, no LLM, no writes)
// ============================================

export interface CitizenImpactCoherenceAuditRow {
  scrutinId: string;
  slug: string | null;
  title: string;
  coverage: number;
  referenceUsed: CoherenceVerdict["referenceUsed"];
  policyTitle: string | null;
}

export interface CitizenImpactCoherenceAudit {
  scanned: number;
  incoherent: CitizenImpactCoherenceAuditRow[];
}

/**
 * Read-only report: scans amendment-linked scrutins that already have a citizen
 * impact and flags the ones whose EXISTING impact is incoherent with the
 * official reference. No model call, no write. Backing for the dry-run report
 * that scopes a future backfill.
 */
export async function auditCitizenImpactCoherence(options?: {
  limit?: number;
}): Promise<CitizenImpactCoherenceAudit> {
  const scrutins = await db.scrutin.findMany({
    where: { citizenImpact: { not: null }, amendmentLinks: { some: {} } },
    orderBy: { votingDate: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      citizenImpact: true,
      policyTitle: { select: { policyTitle: true, policySubtitle: true } },
    },
    ...(options?.limit ? { take: options.limit } : {}),
  });

  const incoherent: CitizenImpactCoherenceAuditRow[] = [];

  for (const s of scrutins) {
    const resolved = await resolveSubstanceSources(s.id);
    const verdict = assessCoherence({
      text: s.citizenImpact!,
      policyTitle: s.policyTitle?.policyTitle ?? null,
      policySubtitle: s.policyTitle?.policySubtitle ?? null,
      blocks: resolved.blocks,
    });
    if (!verdict.coherent) {
      incoherent.push({
        scrutinId: s.id,
        slug: s.slug,
        title: s.title,
        coverage: verdict.coverage,
        referenceUsed: verdict.referenceUsed,
        policyTitle: s.policyTitle?.policyTitle ?? null,
      });
    }
  }

  return { scanned: scrutins.length, incoherent };
}
