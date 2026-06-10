/**
 * Orchestration service for generating AI citizen impact explanations for scrutins.
 */

import { db } from "@/lib/db";
import { generateCitizenImpact, type CitizenImpactInput } from "@/services/scrutin-citizen-impact";
import { fetchScrutinContext } from "@/services/scrutin-context-fetcher";
import { AI_RATE_LIMIT_MS, AI_429_BACKOFF_MS } from "@/config/rate-limits";

export interface ScrutinCitizenImpactsResult {
  processed: number;
  generated: number;
  skipped: number;
  contextHits: number;
  errors: string[];
}

export async function generateScrutinCitizenImpacts(options?: {
  limit?: number;
  force?: boolean;
  skipScrape?: boolean;
}): Promise<ScrutinCitizenImpactsResult> {
  const { limit, force = false, skipScrape = true } = options ?? {};

  const stats: ScrutinCitizenImpactsResult = {
    processed: 0,
    generated: 0,
    skipped: 0,
    contextHits: 0,
    errors: [],
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whereClause: any = {};
  if (!force) {
    whereClause.citizenImpact = null;
  }
  whereClause.summary = { not: null };

  let scrutins = await db.scrutin.findMany({
    where: whereClause,
    orderBy: { votingDate: "desc" },
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
    },
  });

  if (limit) {
    scrutins = scrutins.slice(0, limit);
  }

  console.log(`[citizen-impacts] Found ${scrutins.length} scrutins to process`);

  if (scrutins.length === 0) {
    return stats;
  }

  for (let i = 0; i < scrutins.length; i++) {
    const scrutin = scrutins[i]!;

    try {
      const context = await fetchScrutinContext(scrutin.title, scrutin.sourceUrl, db, {
        skipScrape,
        dossierLegislatifId: scrutin.dossierLegislatifId,
      });

      if (context.dossierTitle || context.sourcePageText) {
        stats.contextHits++;
      }

      const links: CitizenImpactInput["links"] = {
        dossierUrl: null,
        dossierLabel: null,
        relatedVotes: [],
        politicians: [],
      };

      if (context.dossierSlug) {
        links.dossierUrl = `/parlement/dossiers/${context.dossierSlug}`;
        links.dossierLabel = context.dossierTitle ?? "Dossier legislatif";
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
        where: {
          scrutinId: scrutin.id,
          position: { in: ["POUR", "CONTRE"] },
        },
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
        links,
      };

      const result = await generateCitizenImpact(input);

      if (result.confidence < 40) {
        stats.skipped++;
        stats.processed++;
        continue;
      }

      await db.scrutin.update({
        where: { id: scrutin.id },
        data: {
          citizenImpact: result.citizenImpact,
          citizenImpactDate: new Date(),
        },
      });

      stats.generated++;
      stats.processed++;

      if (i < scrutins.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, AI_RATE_LIMIT_MS));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      stats.errors.push(`${scrutin.title.slice(0, 50)}: ${errorMsg}`);
      stats.processed++;

      if (errorMsg.includes("429") || errorMsg.includes("rate")) {
        console.log("[citizen-impacts] Rate limited, waiting 30s...");
        await new Promise((resolve) => setTimeout(resolve, AI_429_BACKOFF_MS));
      }
    }
  }

  return stats;
}
