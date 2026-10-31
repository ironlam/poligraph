/**
 * Orchestration service for generating AI summaries for scrutins.
 * Uses Mistral Small for cost-efficient generation.
 *
 * An amendment vote is summarised from the amendment's official text only
 * (see amendment-vote-guard.ts). Its title alone names a number, not a measure.
 */

import { db } from "@/lib/db";
import type { ScrutinType } from "@/generated/prisma";
import { callMistral, extractMistralText } from "@/lib/api/mistral";
import { AI_RATE_LIMIT_MS, AI_429_BACKOFF_MS } from "@/config/rate-limits";
import { buildSummaryPrompt, SYSTEM_PROMPT } from "@/services/scrutin-summary";
import { resolveSubstanceSources } from "@/services/scrutin-policy-title/substance-resolver";
import type { SubstanceTextBlock } from "@/services/scrutin-policy-title/types";
import {
  AMENDMENT_VOTE_LINKED_OR_OTHER_WHERE,
  canDescribeVotedMeasure,
  isAmendmentVote,
} from "@/services/scrutin-substance/amendment-vote-guard";

export interface ScrutinSummariesResult {
  processed: number;
  generated: number;
  skipped: number;
  /** Amendment votes left without summary: no amendment-level official text. */
  skippedNoSubstance: number;
  errors: string[];
}

/** Blocks read from the voted amendment(s), never from the whole bill. */
function amendmentLevelBlocks(blocks: SubstanceTextBlock[]): SubstanceTextBlock[] {
  return blocks.filter((b) => b.sourceType !== "dossier");
}

export async function generateScrutinSummaries(options?: {
  limit?: number;
  force?: boolean;
}): Promise<ScrutinSummariesResult> {
  const { limit = 30, force = false } = options ?? {};

  const stats: ScrutinSummariesResult = {
    processed: 0,
    generated: 0,
    skipped: 0,
    skippedNoSubstance: 0,
    errors: [],
  };

  const scrutins = await db.scrutin.findMany({
    where: {
      ...(force ? {} : { summary: null }),
      votes: { some: {} },
      ...AMENDMENT_VOTE_LINKED_OR_OTHER_WHERE,
    },
    orderBy: { votingDate: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      result: true,
      votesFor: true,
      votesAgainst: true,
      votesAbstain: true,
      chamber: true,
      type: true,
    },
  });

  if (scrutins.length === 0) return stats;

  for (const s of scrutins) {
    stats.processed++;

    try {
      const amendmentBlocks = await loadAmendmentBlocks(s);
      if (amendmentBlocks === null) {
        stats.skippedNoSubstance++;
        continue;
      }

      const prompt = buildSummaryPrompt({
        title: s.title,
        result: s.result,
        votesFor: s.votesFor,
        votesAgainst: s.votesAgainst,
        votesAbstain: s.votesAbstain,
        chamber: s.chamber,
        amendmentBlocks,
      });

      const response = await callMistral([{ role: "user", content: prompt }], {
        model: "mistral-small-latest",
        system: SYSTEM_PROMPT,
        maxTokens: 300,
        temperature: 0.3,
      });

      const summary = extractMistralText(response).trim();
      if (!summary) {
        stats.skipped++;
        continue;
      }

      await db.scrutin.update({
        where: { id: s.id },
        data: { summary },
      });
      stats.generated++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const isRateLimit = /429|rate.limit|quota/i.test(msg);

      stats.errors.push(`${s.title.slice(0, 60)}: ${msg.slice(0, 100)}`);

      if (isRateLimit) {
        console.error(`[scrutin-summaries] Rate limit hit, backing off ${AI_429_BACKOFF_MS}ms`);
        await new Promise((r) => setTimeout(r, AI_429_BACKOFF_MS));
      }
    }

    await new Promise((r) => setTimeout(r, AI_RATE_LIMIT_MS));
  }

  return stats;
}

/**
 * Amendment-level official text for an amendment vote, an empty list for any
 * other vote, or null when the vote is an amendment whose text is not linked:
 * that vote must not be summarised.
 */
async function loadAmendmentBlocks(s: {
  id: string;
  title: string;
  type: ScrutinType | null;
}): Promise<SubstanceTextBlock[] | null> {
  if (!isAmendmentVote(s)) return [];
  const resolved = await resolveSubstanceSources(s.id);
  if (!canDescribeVotedMeasure({ ...s, substanceDepth: resolved.substanceDepth })) return null;
  return amendmentLevelBlocks(resolved.blocks);
}
