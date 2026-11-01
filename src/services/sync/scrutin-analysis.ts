import { db } from "@/lib/db";
import { callMistral, extractMistralText, parseMistralJSON } from "@/lib/api/mistral";
import { escapeXmlText } from "@/lib/text/escape-xml";
import { isGroupAttributionReliable } from "@/lib/votes/group-attribution";
import { resolveDebateContextForScrutin } from "@/services/scrutin-substance/debate-context-resolver";
import { resolveSubstanceSources } from "@/services/scrutin-policy-title/substance-resolver";
import { assessCoherence, type CoherenceVerdict } from "@/services/scrutin-substance/coherence";
import {
  canDescribeVotedMeasure,
  isAmendmentVote,
} from "@/services/scrutin-substance/amendment-vote-guard";
import type { SubstanceTextBlock } from "@/services/scrutin-policy-title/types";
import type { AnalysisSourceType } from "@/generated/prisma";

const MISTRAL_MODEL = "mistral-large-latest";

interface GroupPositionInput {
  groupName: string;
  position: string;
  forCount: number;
  againstCount: number;
  abstainCount: number;
}

interface PromptInput {
  title: string;
  result: string;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  groupPositions: GroupPositionInput[];
  /** Official amendment substance (resolveSubstanceSources) = what is voted. */
  substanceBlocks: SubstanceTextBlock[];
  /** Debate transcript = the ONLY source of for/against arguments. */
  debateExcerpt: string | null;
  /** Dossier title = general context only, never defines the measure. */
  dossierContext: string | null;
}

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

/**
 * Extract text from Mistral JSON values.
 * Handles: string, array of strings, or {groupName: argument} objects.
 * When Mistral returns per-group arguments, formats as "**Group**: argument" lines.
 */
function flattenToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flattenToString).filter(Boolean).join("\n\n");
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    // Per-group format: {"EPR": "argument", "LFI": "argument"}
    if (entries.every(([, v]) => typeof v === "string")) {
      return entries.map(([group, text]) => `**${group}** : ${text}`).join("\n\n");
    }
    return entries
      .map(([, v]) => flattenToString(v))
      .filter(Boolean)
      .join("\n\n");
  }
  return String(value);
}

/** Official amendment substance as XML, one <source> per resolved block. */
function buildSujetOfficielXml(blocks: SubstanceTextBlock[]): string {
  return blocks
    .map((b) => {
      const amd = b.meta?.amendmentNumber
        ? ` amendement="${escapeXmlText(b.meta.amendmentNumber)}"`
        : "";
      const art = b.meta?.articleRef ? ` article="${escapeXmlText(b.meta.articleRef)}"` : "";
      return `  <source type="${escapeXmlText(b.sourceType)}" field="${escapeXmlText(b.field)}" trust="${escapeXmlText(b.trust)}"${amd}${art}>${escapeXmlText(b.text)}</source>`;
    })
    .join("\n");
}

export function buildAnalysisPrompt(input: PromptInput): string {
  // All free text inserted into XML-like tags is entity-escaped (incl. the raw
  // debate transcript) so its content can never inject or close a tag.
  const esc = (s: string, max = 500) => escapeXmlText(s, max);
  const hasSubstance = input.substanceBlocks.length > 0;

  const groupLines = input.groupPositions
    .map(
      (g) =>
        `- ${esc(g.groupName, 200)}: ${g.position} (${g.forCount} pour, ${g.againstCount} contre, ${g.abstainCount} abstentions)`
    )
    .join("\n");

  const sujet = hasSubstance
    ? `\n<sujet-officiel>\n${buildSujetOfficielXml(input.substanceBlocks)}\n</sujet-officiel>\n`
    : "";
  const contexte = input.dossierContext
    ? `\n<contexte role="informational-only">\n<dossier>${esc(input.dossierContext)}</dossier>\n</contexte>\n`
    : "";
  const debat = input.debateExcerpt
    ? `\n<débat>\n${esc(input.debateExcerpt, 3000)}\n</débat>\n`
    : "";

  // Rule 1 adapts to whether an official amendment subject is present.
  const mesureRule = hasSubstance
    ? `1. La mesure votée est définie UNIQUEMENT par <sujet-officiel> (le texte exact de l'amendement). <contexte> et <titre-procedural> posent le décor de la loi : ils ne définissent JAMAIS la mesure et ne doivent pas servir à décrire ce qui est voté.`
    : `1. Aucun texte d'amendement officiel n'est fourni pour ce vote : la mesure votée et les arguments doivent être identifiés UNIQUEMENT à partir du <débat>. <contexte> et <titre-procedural> restent du décor, ils ne définissent JAMAIS la mesure. Si le <débat> ne permet pas d'identifier clairement la mesure, renvoie des champs vides.`;

  return `<données>
<scrutin>
<titre-procedural>${esc(input.title)}</titre-procedural>
<résultat>${input.result}</résultat>
<votes>Pour: ${input.votesFor}, Contre: ${input.votesAgainst}, Abstention: ${input.votesAbstain}</votes>
</scrutin>
${sujet}${contexte}
<positions_groupes>
${groupLines}
</positions_groupes>
${debat}</données>

Analyse ce scrutin parlementaire. Produis un JSON avec deux champs :
- "argumentsFor": les arguments des groupes ayant voté POUR (2-3 phrases max)
- "argumentsAgainst": les arguments des groupes ayant voté CONTRE (2-3 phrases max)

Règles strictes :
${mesureRule}
2. Les arguments POUR/CONTRE viennent UNIQUEMENT de <débat>. <positions_groupes> indique QUI a voté, pas POURQUOI : il est interdit d'inventer des arguments à partir des compteurs de vote.
3. Si <débat> ne contient pas d'arguments exploitables, renvoie des champs vides plutôt que d'inventer.
4. Neutralité absolue : présente chaque camp avec un poids égal, aucun qualificatif de valeur.
5. Vulgarisation : explique en français simple, sans jargon non expliqué.
6. Concision : 2-3 phrases maximum par camp. Pas de statistiques (l'interface affiche les chiffres).

Réponds UNIQUEMENT avec le JSON, sans markdown.`;
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

  if (!output.argumentsFor.trim() || !output.argumentsAgainst.trim()) {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { importance: { isKeyVote: true } };
  if (scrutinIds && scrutinIds.length > 0) where.id = { in: scrutinIds };
  if (!force) where.analysis = null;

  const scrutins = await db.scrutin.findMany({
    where,
    take: limit,
    orderBy: { votingDate: "desc" },
    select: {
      id: true,
      title: true,
      result: true,
      votesFor: true,
      votesAgainst: true,
      votesAbstain: true,
      chamber: true,
      legislature: true,
      type: true,
      groupPositions: {
        include: {
          group: { select: { name: true, code: true, chamber: true, legislature: true } },
        },
      },
      debateTranscripts: {
        take: 1,
        orderBy: { date: "desc" },
        select: { content: true },
      },
      dossierLegislatif: {
        select: { title: true },
      },
      amendmentLinks: { select: { amendmentId: true } },
      policyTitle: { select: { policyTitle: true, policySubtitle: true } },
    },
  });

  let generated = 0;
  let skipped = 0;
  let skippedIncoherent = 0;

  for (const s of scrutins) {
    try {
      // Guard 1: arguments need a real debate. No usable transcript → never
      // invent (no resolver, no model call, no write). See scrutin 2084.
      //
      // An amendment vote takes the passage on THAT amendment, never the start of a
      // whole séance: only an explicit, corroborated, unambiguous match qualifies.
      // Other votes keep the transcript linked to the scrutin.
      let debateExcerpt: string | undefined;
      if (s.amendmentLinks.length > 0 || isAmendmentVote(s)) {
        const debate = await resolveDebateContextForScrutin(s.id);
        debateExcerpt =
          debate.usableForGeneration && debate.reinforced
            ? (debate.context?.trim() ?? undefined)
            : undefined;
      } else {
        debateExcerpt = s.debateTranscripts[0]?.content?.trim();
      }
      if (!debateExcerpt) {
        skipped++;
        continue;
      }

      // Anchor the topic on the official amendment substance (what is voted).
      const resolved = await resolveSubstanceSources(s.id);
      if (!canDescribeVotedMeasure({ ...s, substanceDepth: resolved.substanceDepth })) {
        skipped++;
        continue;
      }

      const prompt = buildAnalysisPrompt({
        title: s.title,
        result: s.result,
        votesFor: s.votesFor,
        votesAgainst: s.votesAgainst,
        votesAbstain: s.votesAbstain,
        // Positions de groupe : uniquement celles dont le groupe est celui de la législature
        // du scrutin, sinon le modèle commente un vote de la 16e avec des groupes de la 17e.
        groupPositions: s.groupPositions
          .filter((gp) => isGroupAttributionReliable(s, gp.group))
          .map((gp) => ({
            groupName: gp.group.name,
            position: gp.position,
            forCount: gp.forCount,
            againstCount: gp.againstCount,
            abstainCount: gp.abstainCount,
          })),
        substanceBlocks: resolved.blocks,
        debateExcerpt,
        dossierContext: s.dossierLegislatif?.title ?? null,
      });

      const response = await callMistral([{ role: "user", content: prompt }], {
        model: MISTRAL_MODEL,
        maxTokens: 1500,
        temperature: 0.3,
        responseFormat: { type: "json_object" },
      });

      const text = extractMistralText(response);
      const raw = parseMistralJSON<Record<string, unknown>>(text);
      const parsed: AnalysisOutput = {
        argumentsFor: flattenToString(raw.argumentsFor),
        argumentsAgainst: flattenToString(raw.argumentsAgainst),
      };

      const validation = validateAnalysisOutput(parsed);
      if (!validation.valid) {
        errors.push(`${s.id}: validation failed (${validation.errors.join(", ")})`);
        skipped++;
        continue;
      }

      // Guard 2: arguments must echo the official measure (amendment), not drift
      // onto a different measure from the broad séance debate.
      if ((s.amendmentLinks.length > 0 || isAmendmentVote(s)) && resolved.blocks.length > 0) {
        const verdict = assessCoherence({
          text: `${parsed.argumentsFor} ${parsed.argumentsAgainst}`,
          policyTitle: s.policyTitle?.policyTitle ?? null,
          policySubtitle: s.policyTitle?.policySubtitle ?? null,
          blocks: resolved.blocks,
        });
        if (!verdict.coherent) {
          skippedIncoherent++;
          console.warn(
            `[scrutin-analysis] INCOHERENT analysis for ${s.id} ` +
              `(coverage ${verdict.coverage.toFixed(2)}, ref=${verdict.referenceUsed}) — not persisted`
          );
          continue;
        }
      }

      if (!dryRun) {
        await db.scrutinAnalysis.upsert({
          where: { scrutinId: s.id },
          create: {
            scrutinId: s.id,
            argumentsFor: parsed.argumentsFor,
            argumentsAgainst: parsed.argumentsAgainst,
            sourceType: "DEBATE_TRANSCRIPT",
            modelVersion: MISTRAL_MODEL,
          },
          update: {
            argumentsFor: parsed.argumentsFor,
            argumentsAgainst: parsed.argumentsAgainst,
            sourceType: "DEBATE_TRANSCRIPT",
            modelVersion: MISTRAL_MODEL,
          },
        });
      }

      generated++;
    } catch (e) {
      errors.push(`${s.id}: ${e instanceof Error ? e.message : String(e)}`);
      skipped++;
    }
  }

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
    const hasDebate = r.scrutin._count.debateTranscripts > 0;
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
