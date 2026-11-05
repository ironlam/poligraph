import { safeJsonParseOrThrow } from "@/lib/api/safe-json";
import { createHash } from "node:crypto";
import { syncMetadata } from "@/lib/sync/sync-metadata";
import {
  DEBATE_PROMPT_VERSION,
  validateArgumentCitations,
} from "@/services/scrutin-substance/debate-discussion";
import { findUnsupportedSentences } from "@/services/scrutin-substance/argument-support";
import { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { callMistral, extractMistralText, parseMistralJSON } from "@/lib/api/mistral";
import { escapeXmlText } from "@/lib/text/escape-xml";
import {
  buildSelectionPrompt,
  buildWritingPrompt,
  parseSelection,
} from "@/services/scrutin-substance/argument-two-step";
import {
  resolveDebateContextForScrutin,
  type DebateTranscriptCache,
} from "@/services/scrutin-substance/debate-context-resolver";
import { resolveSubstanceSources } from "@/services/scrutin-policy-title/substance-resolver";
import { assessCoherence, type CoherenceVerdict } from "@/services/scrutin-substance/coherence";
import {
  AMENDMENT_VOTE_LINKED_OR_OTHER_WHERE,
  canDescribeVotedMeasure,
  isAmendmentVote,
} from "@/services/scrutin-substance/amendment-vote-guard";
import type { SubstanceTextBlock } from "@/services/scrutin-policy-title/types";
import type { AnalysisSourceType } from "@/generated/prisma";

const MISTRAL_MODEL = "mistral-large-latest";

interface AnalysisOutput {
  argumentsFor: string;
  argumentsAgainst: string;
}

const BANNED_ADJECTIVES = [
  "raisonnable",
  "courageux",
  "courageuse",
  "dangereux",
  "dangereuse",
  "irresponsable",
  "brillant",
  "brillante",
  "absurde",
  "ridicule",
  "exemplaire",
  "scandaleux",
  "scandaleuse",
  "admirable",
];

/** Official amendment substance as XML, one <source> per resolved block. */
export function buildSujetOfficielXml(blocks: SubstanceTextBlock[]): string {
  return blocks
    .map((b) => {
      const amd = b.meta?.amendmentNumber
        ? ` amendement="${escapeXmlText(b.meta.amendmentNumber)}"`
        : "";
      const art = b.meta?.articleRef ? ` article="${escapeXmlText(b.meta.articleRef)}"` : "";
      return `  <source role="${b.sourceType === "parentAmendment" ? "contexte" : "vote"}" type="${escapeXmlText(b.sourceType)}" field="${escapeXmlText(b.field)}" trust="${escapeXmlText(b.trust)}"${amd}${art}>${escapeXmlText(b.text)}</source>`;
    })
    .join("\n");
}

export function validateAnalysisOutput(output: AnalysisOutput): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const combined = `${output.argumentsFor} ${output.argumentsAgainst}`.toLowerCase();

  for (const adj of BANNED_ADJECTIVES) {
    if (combined.includes(adj)) {
      errors.push("neutrality");
      break;
    }
  }

  if (output.argumentsFor.length > 4000 || output.argumentsAgainst.length > 4000) {
    errors.push("conciseness");
  }

  if (!output.argumentsFor.trim() && !output.argumentsAgainst.trim()) {
    errors.push("completeness");
  }

  return { valid: errors.length === 0, errors };
}

export async function generateScrutinAnalysis(
  options: {
    limit?: number;
    force?: boolean;
    /** Never write to the DB (audit / preview mode). */
    dryRun?: boolean;
    /** Restrict processing to these scrutin ids (scoped first in the WHERE). */
    scrutinIds?: string[];
  } = {}
): Promise<{ generated: number; skipped: number; skippedIncoherent: number; errors: string[] }> {
  const { limit = 10, force = false, dryRun = false, scrutinIds } = options;
  const errors: string[] = [];

  const where: Prisma.ScrutinWhereInput = {
    importance: { isKeyVote: true },
    chamber: "AN",
    amendmentLinks: { some: { role: { in: ["PRINCIPAL", "SUB_AMENDMENT"] } } },
  };
  if (scrutinIds && scrutinIds.length > 0) where.id = { in: scrutinIds };
  if (!force) where.OR = [{ analysis: null }, { analysis: { is: { sourceUrl: null } } }];
  // Legacy analyses without traceable evidence are regenerated through this guard.
  where.AND = [AMENDMENT_VOTE_LINKED_OR_OTHER_WHERE];

  // A bounded scan plus a durable keyset cursor lets older usable debates pass
  // newer refusals without unbounded DB work or repeated model calls.
  const scanKey = `debate-analysis-scan:${DEBATE_PROMPT_VERSION}`;
  const persistCursor = !dryRun && !force && !scrutinIds?.length;
  const state = persistCursor ? await syncMetadata.get(scanKey) : null;
  let cursor: { id: string; date: string } | null = null;
  if (state?.cursor) {
    try {
      const c = safeJsonParseOrThrow<{ id: string; date: string }>(state.cursor);
      if (typeof c.id === "string" && typeof c.date === "string" && !isNaN(Date.parse(c.date)))
        cursor = c;
    } catch {
      /* reset an unreadable cursor */
    }
  }
  const scanLimit = Math.min(1000, Math.max(100, limit * 20));
  let scanned = 0;
  let modelCalls = 0;
  const transcriptCache: DebateTranscriptCache = new Map();
  let generated = 0;
  let skipped = 0;
  let skippedIncoherent = 0;

  while (scanned < scanLimit && modelCalls < limit) {
    const scrutins = await db.scrutin.findMany({
      where: cursor
        ? {
            AND: [
              where,
              {
                OR: [
                  { votingDate: { lt: new Date(cursor.date) } },
                  { votingDate: new Date(cursor.date), id: { gt: cursor.id } },
                ],
              },
            ],
          }
        : where,
      take: Math.min(50, scanLimit - scanned),
      orderBy: [{ votingDate: "desc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        votingDate: true,
        result: true,
        votesFor: true,
        votesAgainst: true,
        votesAbstain: true,
        chamber: true,
        legislature: true,
        type: true,

        dossierLegislatif: {
          select: { title: true },
        },
        amendmentLinks: { select: { amendmentId: true } },
        policyTitle: { select: { policyTitle: true, policySubtitle: true } },
      },
    });
    if (scrutins.length === 0) {
      cursor = null;
      break;
    }
    for (const s of scrutins) {
      if (modelCalls >= limit || scanned >= scanLimit) break;
      scanned++;
      cursor = { id: s.id, date: s.votingDate.toISOString() };
      try {
        if (s.amendmentLinks.length === 0) {
          skipped++;
          continue;
        }
        // Never use a legacy day-linked transcript. The resolver requires the
        // exact official séance and examined text before returning a discussion.
        const debate = await resolveDebateContextForScrutin(s.id, transcriptCache);
        if (
          !debate.usableForGeneration ||
          !debate.discussion ||
          !debate.sourceHash ||
          !debate.sourceUrl
        ) {
          skipped++;
          continue;
        }
        const discussion = debate.discussion;

        // Anchor the topic on the official amendment substance (what is voted).
        const resolved = await resolveSubstanceSources(s.id);
        if (!canDescribeVotedMeasure({ ...s, substanceDepth: resolved.substanceDepth })) {
          skipped++;
          continue;
        }

        const subjectBlocks = resolved.blocks.filter((b) => b.sourceType !== "dossier");
        if (
          subjectBlocks.some((b) => b.text.length > 8000) ||
          subjectBlocks.reduce((n, b) => n + b.text.length, 0) > 12000
        ) {
          skipped++;
          errors.push(`${s.id}: official subject exceeds input budget`);
          continue;
        }
        // Guard 2: the debate must be about the official measure. The reference is compared
        // with what was said on the target, not with the model's summary: a faithful summary
        // reports the speakers' words and rarely repeats the measure's own vocabulary.
        if ((s.amendmentLinks.length > 0 || isAmendmentVote(s)) && resolved.blocks.length > 0) {
          const verdict = assessCoherence({
            text: discussion.paragraphs
              .filter((p) => p.scope === "target" || p.scope === "shared")
              .map((p) => p.text)
              .join(" "),
            policyTitle: s.policyTitle?.policyTitle ?? null,
            policySubtitle: s.policyTitle?.policySubtitle ?? null,
            blocks: resolved.blocks,
          });
          if (!verdict.coherent) {
            skippedIncoherent++;
            console.warn(
              `[scrutin-analysis] debate not on the official measure for ${s.id} ` +
                `(coverage ${verdict.coverage.toFixed(2)}, ref=${verdict.referenceUsed}), no model call`
            );
            continue;
          }
        }

        // Step 1: the model only points at sentences; the code extracts the exact quotes.
        const selectionPrompt = buildSelectionPrompt({
          title: s.title,
          sujetXml: buildSujetOfficielXml(subjectBlocks),
          discussion,
        });
        modelCalls++;
        const selectionResponse = await callMistral([{ role: "user", content: selectionPrompt }], {
          model: MISTRAL_MODEL,
          maxTokens: 800,
          temperature: 0,
          responseFormat: { type: "json_object" },
        });
        const selection = parseSelection(
          parseMistralJSON<Record<string, unknown>>(extractMistralText(selectionResponse)),
          discussion
        );
        if (!selection) {
          skipped++;
          errors.push(`${s.id}: unreadable selection`);
          continue;
        }
        if (selection.for.length === 0 && selection.against.length === 0) {
          skipped++;
          continue;
        }

        // A speaker on both sides (e.g. the Government explaining its own proposal, then
        // asking for withdrawal) makes the classification ambiguous: refuse rather than guess.
        const speakerOf = new Map(
          discussion.paragraphs.map((p) => [p.id, p.actorRef ?? p.speaker])
        );
        const forSpeakers = new Set(selection.for.map((c) => speakerOf.get(c.paragraphId)));
        if (selection.against.some((c) => forSpeakers.has(speakerOf.get(c.paragraphId)))) {
          skipped++;
          errors.push(`${s.id}: a speaker appears on both sides`);
          continue;
        }

        // Step 2: the model writes each side from the selected quotes alone.
        const prompt = buildWritingPrompt({ selection, discussion });
        const response = await callMistral([{ role: "user", content: prompt }], {
          model: MISTRAL_MODEL,
          maxTokens: 1000,
          temperature: 0.2,
          responseFormat: { type: "json_object" },
        });
        const raw = parseMistralJSON<Record<string, unknown>>(extractMistralText(response));
        if (typeof raw.argumentsFor !== "string" || typeof raw.argumentsAgainst !== "string") {
          skipped++;
          errors.push(`${s.id}: argument fields must be strings`);
          continue;
        }
        const parsed: AnalysisOutput = {
          argumentsFor: raw.argumentsFor,
          argumentsAgainst: raw.argumentsAgainst,
        };

        const validation = validateAnalysisOutput(parsed);
        if (!validation.valid) {
          errors.push(`${s.id}: validation failed (${validation.errors.join(", ")})`);
          skipped++;
          continue;
        }

        const evidenceFor = validateArgumentCitations(
          parsed.argumentsFor,
          selection.for,
          discussion
        );
        const evidenceAgainst = validateArgumentCitations(
          parsed.argumentsAgainst,
          selection.against,
          discussion
        );
        if (!evidenceFor || !evidenceAgainst) {
          skipped++;
          errors.push(`${s.id}: missing or invalid paragraph citations`);
          continue;
        }
        // Every sentence must rest on the quotes cited for its side: no borrowing from the
        // amendment's statement of reasons, no claim the speaker did not make.
        const speakerById = new Map(discussion.paragraphs.map((p) => [p.id, p.speaker ?? ""]));
        const unsupported = [
          ...findUnsupportedSentences(parsed.argumentsFor, evidenceFor, speakerById),
          ...findUnsupportedSentences(parsed.argumentsAgainst, evidenceAgainst, speakerById),
        ];
        if (unsupported.length > 0) {
          skipped++;
          errors.push(`${s.id}: sentences not covered by their citations`);
          continue;
        }
        // A visible qualification survives even if the model omits it.
        if (evidenceFor.some((c) => c.scope === "shared"))
          parsed.argumentsFor = `Dans la discussion commune : ${parsed.argumentsFor}`;
        if (evidenceAgainst.some((c) => c.scope === "shared"))
          parsed.argumentsAgainst = `Dans la discussion commune : ${parsed.argumentsAgainst}`;
        const evidence = {
          version: DEBATE_PROMPT_VERSION,
          seanceRef: debate.transcriptSeanceRef,
          sourceUrl: debate.sourceUrl,
          sourceHash: debate.sourceHash,
          promptHash: createHash("sha256")
            .update(selectionPrompt + "\n---\n" + prompt)
            .digest("hex"),
          // Kept server-side for reproducibility; public data only reads sourceUrl.
          selectionPrompt,
          prompt,
          discussion,
          for: evidenceFor,
          against: evidenceAgainst,
        } as unknown as Prisma.InputJsonValue;
        if (!dryRun) {
          const saved = await db.$transaction(async (tx) => {
            // Lock this exact input snapshot. An ingestion correction either
            // precedes this check, or waits and invalidates the saved analysis.
            const sources = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
              SELECT "id" FROM "DebateTranscript"
              WHERE "seanceRef" = ${debate.transcriptSeanceRef}
                AND "sourceHash" = ${debate.sourceHash}
              FOR SHARE
            `);
            if (sources.length !== 1) return false;
            await tx.scrutinAnalysis.upsert({
              where: { scrutinId: s.id },
              create: {
                scrutinId: s.id,
                argumentsFor: parsed.argumentsFor,
                argumentsAgainst: parsed.argumentsAgainst,
                evidence,
                sourceUrl: debate.sourceUrl,
                commonDiscussion: discussion.common,
                sourceType: "DEBATE_TRANSCRIPT",
                modelVersion: MISTRAL_MODEL,
              },
              update: {
                argumentsFor: parsed.argumentsFor,
                argumentsAgainst: parsed.argumentsAgainst,
                evidence,
                sourceUrl: debate.sourceUrl,
                commonDiscussion: discussion.common,
                sourceType: "DEBATE_TRANSCRIPT",
                modelVersion: MISTRAL_MODEL,
              },
            });
            return true;
          });
          if (!saved) {
            skipped++;
            continue;
          }
        }

        generated++;
      } catch (e) {
        errors.push(`${s.id}: ${e instanceof Error ? e.message : String(e)}`);
        skipped++;
      }
    }
  }
  if (persistCursor)
    await syncMetadata.markCompleted(scanKey, { cursor: cursor ? JSON.stringify(cursor) : null });
  return { generated, skipped, skippedIncoherent, errors: errors.slice(0, 20) };
}

// ============================================
// COHERENCE AUDIT (read-only report, no model, no writes)
// ============================================

export interface ScrutinAnalysisAuditRow {
  scrutinId: string;
  slug: string | null;
  title: string;
  sourceType: AnalysisSourceType;
  hasDebate: boolean;
  coverage: number;
  referenceUsed: CoherenceVerdict["referenceUsed"];
  policyTitle: string | null;
  argumentsForExcerpt: string;
}

export interface ScrutinAnalysisAudit {
  scanned: number;
  atRisk: ScrutinAnalysisAuditRow[];
}

/**
 * Read-only report over amendment-linked analyses. Flags rows that are at risk
 * of describing a different measure: STRUCTURED_DATA (no real debate), missing
 * debate transcript, or low lexical coverage with the official substance. No
 * model call, no write. Backs the scoping of a future regeneration.
 */
export async function auditScrutinAnalysisCoherence(options?: {
  limit?: number;
}): Promise<ScrutinAnalysisAudit> {
  const rows = await db.scrutinAnalysis.findMany({
    where: { scrutin: { amendmentLinks: { some: {} } } },
    orderBy: { scrutin: { votingDate: "desc" } },
    select: {
      argumentsFor: true,
      argumentsAgainst: true,
      sourceType: true,
      sourceUrl: true,
      scrutin: {
        select: {
          id: true,
          slug: true,
          title: true,
          policyTitle: { select: { policyTitle: true, policySubtitle: true } },
          _count: { select: { debateTranscripts: true } },
        },
      },
    },
    ...(options?.limit ? { take: options.limit } : {}),
  });

  const atRisk: ScrutinAnalysisAuditRow[] = [];

  for (const r of rows) {
    const resolved = await resolveSubstanceSources(r.scrutin.id);
    const verdict = assessCoherence({
      text: `${r.argumentsFor} ${r.argumentsAgainst}`,
      policyTitle: r.scrutin.policyTitle?.policyTitle ?? null,
      policySubtitle: r.scrutin.policyTitle?.policySubtitle ?? null,
      blocks: resolved.blocks,
    });
    const hasDebate = Boolean(r.sourceUrl);
    const risky = r.sourceType === "STRUCTURED_DATA" || !hasDebate || !verdict.coherent;
    if (risky) {
      atRisk.push({
        scrutinId: r.scrutin.id,
        slug: r.scrutin.slug,
        title: r.scrutin.title,
        sourceType: r.sourceType,
        hasDebate,
        coverage: verdict.coverage,
        referenceUsed: verdict.referenceUsed,
        policyTitle: r.scrutin.policyTitle?.policyTitle ?? null,
        argumentsForExcerpt: r.argumentsFor.slice(0, 160),
      });
    }
  }

  return { scanned: rows.length, atRisk };
}
