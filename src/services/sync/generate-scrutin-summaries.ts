/**
 * Orchestration service for generating AI summaries for scrutins.
 * Uses Mistral Small for cost-efficient generation.
 *
 * An amendment vote is summarised from the amendment's official text only
 * (see amendment-vote-guard.ts). Its title alone names a number, not a measure.
 */

import { db } from "@/lib/db";
import type { Prisma, ScrutinType } from "@/generated/prisma";
import { callMistral, extractMistralText } from "@/lib/api/mistral";
import { AI_RATE_LIMIT_MS, AI_429_BACKOFF_MS } from "@/config/rate-limits";
import { buildSummaryPrompt, SYSTEM_PROMPT } from "@/services/scrutin-summary";
import { resolveSubstanceSources } from "@/services/scrutin-policy-title/substance-resolver";
import type { SubstanceTextBlock } from "@/services/scrutin-policy-title/types";
import {
  AMENDMENT_VOTE_LINKED_OR_OTHER_WHERE,
  canDescribeVotedMeasure,
  isAmendmentVote,
  isArticleVote,
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

  // `limit` budgets model calls, not rows read: a candidate refused for lack of
  // amendment text keeps its eligibility, so a row budget would select the same
  // refused rows on every run and never reach older summarisable ones. Keyset
  // pagination, because a generated row leaves the filter and would shift an
  // offset.
  const baseWhere: Prisma.ScrutinWhereInput = {
    ...(force ? {} : { summary: null }),
    votes: { some: {} },
    ...AMENDMENT_VOTE_LINKED_OR_OTHER_WHERE,
  };
  let modelCalls = 0;
  let cursor: { votingDate: Date; id: string } | null = null;

  while (modelCalls < limit) {
    const page: SummaryCandidate[] = await db.scrutin.findMany({
      where: cursor ? { AND: [baseWhere, after(cursor)] } : baseWhere,
      orderBy: [{ votingDate: "desc" }, { id: "asc" }],
      take: PAGE_SIZE,
      select: CANDIDATE_SELECT,
    });
    if (page.length === 0) break;
    const last = page[page.length - 1]!;
    cursor = { votingDate: last.votingDate, id: last.id };

    for (const s of page) {
      if (modelCalls >= limit) break;
      stats.processed++;
      if (await summariseOne(s, stats)) modelCalls++;
    }
  }

  return stats;
}

const PAGE_SIZE = 50;

const CANDIDATE_SELECT = {
  id: true,
  title: true,
  votingDate: true,
  result: true,
  votesFor: true,
  votesAgainst: true,
  votesAbstain: true,
  chamber: true,
  type: true,
} as const;

type SummaryCandidate = Prisma.ScrutinGetPayload<{ select: typeof CANDIDATE_SELECT }>;

/** Rows strictly after `cursor` in (votingDate desc, id asc) order. */
function after(cursor: { votingDate: Date; id: string }): Prisma.ScrutinWhereInput {
  return {
    OR: [
      { votingDate: { lt: cursor.votingDate } },
      { votingDate: cursor.votingDate, id: { gt: cursor.id } },
    ],
  };
}

/** Summarises one scrutin. Returns whether the model was called. */
async function summariseOne(s: SummaryCandidate, stats: ScrutinSummariesResult): Promise<boolean> {
  let calledModel = false;
  try {
    const amendmentBlocks = await loadAmendmentBlocks(s);
    if (amendmentBlocks === null) {
      stats.skippedNoSubstance++;
      return false;
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

    calledModel = true;
    const response = await callMistral([{ role: "user", content: prompt }], {
      model: "mistral-small-latest",
      system: SYSTEM_PROMPT,
      maxTokens: 300,
      temperature: 0.3,
    });

    const summary = extractMistralText(response).trim();
    if (!summary) {
      stats.skipped++;
    } else {
      await db.scrutin.update({ where: { id: s.id }, data: { summary } });
      stats.generated++;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    stats.errors.push(`${s.title.slice(0, 60)}: ${msg.slice(0, 100)}`);
    if (/429|rate.limit|quota/i.test(msg)) {
      console.error(`[scrutin-summaries] Rate limit hit, backing off ${AI_429_BACKOFF_MS}ms`);
      await new Promise((r) => setTimeout(r, AI_429_BACKOFF_MS));
    }
  }
  if (calledModel) await new Promise((r) => setTimeout(r, AI_RATE_LIMIT_MS));
  return calledModel;
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
  // An article vote has no text to ground on: it must not be summarised.
  if (isArticleVote(s)) return null;
  if (!isAmendmentVote(s)) return [];
  const resolved = await resolveSubstanceSources(s.id);
  if (!canDescribeVotedMeasure({ ...s, substanceDepth: resolved.substanceDepth })) return null;
  return amendmentLevelBlocks(resolved.blocks);
}
