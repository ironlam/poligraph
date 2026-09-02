import { z } from "zod";
import type { MeasureSubtopicDefinition } from "@/config/measure-subtopics";
import { callMistral, extractMistralText, parseMistralJSON } from "@/lib/api/mistral";
import {
  findDeltaLexicalMatches,
  type DeltaSelectedMeasure,
} from "@/lib/measures/subtopic-delta-selection";

const MODEL = "mistral-small-latest";
/** Version du contrat de décision, indépendante du nom de modèle résolu. */
export const SUBTOPIC_DELTA_CLASSIFIER_VERSION = "subtopic-delta-v1";

const decisionSchema = z
  .object({
    decision: z.enum(["APPLIES", "DOES_NOT_APPLY", "UNCERTAIN"]),
    confidence: z.number().min(0).max(1),
    justification: z.string().trim().min(10).max(500),
    evidenceExcerpt: z.string().trim().min(2).max(300),
  })
  .strict();

export type SubtopicDeltaDecision = z.infer<typeof decisionSchema> & {
  classifierVersion: string;
};

function sanitizePromptText(value: string, maximum: number): string {
  return value
    .replace(/[<>"\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function normalizeEvidence(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function assertEvidenceComesFromMeasure(evidence: string, source: string): void {
  const normalizedEvidence = normalizeEvidence(evidence);
  if (normalizedEvidence.length < 2 || !normalizeEvidence(source).includes(normalizedEvidence)) {
    throw new Error("L’extrait probant ne provient pas du texte de la mesure");
  }
}

function relevantPassages(value: string, lexicalTerms: string[]): string[] {
  if (value.trim() === "") return [];
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += 160) {
    chunks.push(value.slice(offset, offset + 200));
  }
  const matched = chunks.filter(
    (chunk) =>
      lexicalTerms.length > 0 &&
      findDeltaLexicalMatches(
        { text: chunk, details: null },
        { label: lexicalTerms[0]!, aliases: lexicalTerms.slice(1) }
      ).length > 0
  );
  const distributed =
    lexicalTerms.length > 0 || chunks.length <= 6
      ? chunks
      : Array.from(
          { length: 6 },
          (_, index) => chunks[Math.round(((chunks.length - 1) * index) / 5)]!
        );
  const selected = lexicalTerms.length > 0 ? [chunks[0]!, ...matched] : distributed;
  return [...new Set(selected.map((chunk) => sanitizePromptText(chunk, 200)))]
    .filter(Boolean)
    .slice(0, 6);
}

export async function classifyMeasureForSubtopicDelta(input: {
  measure: DeltaSelectedMeasure;
  subtopic: MeasureSubtopicDefinition;
}): Promise<SubtopicDeltaDecision> {
  const lexicalTerms = input.measure.selectionReasons
    .filter((reason) => reason.signal === "LEXICAL")
    .flatMap((reason) => reason.values);
  const textPassages = relevantPassages(input.measure.text, lexicalTerms);
  const detailPassages = relevantPassages(input.measure.details ?? "", lexicalTerms);
  const sourcePassages = [...textPassages, ...detailPassages];
  const reasons = input.measure.selectionReasons
    .map((reason) => `${reason.signal}: ${reason.values.join(", ")}`)
    .join(" ; ");
  const prompt = `Décide uniquement si la mesure relève du sous-thème fourni. N'infère ni intention, ni fait absent du texte. Une proximité générale ne suffit pas. UNCERTAIN signifie que le texte ne permet pas de trancher. L'extrait probant doit recopier un passage exact de la formulation ou du contexte.

<sous_theme>
slug: ${sanitizePromptText(input.subtopic.slug, 100)}
libellé: ${sanitizePromptText(input.subtopic.label, 150)}
description: ${sanitizePromptText(input.subtopic.description, 600)}
alias: ${input.subtopic.aliases.map((alias) => sanitizePromptText(alias, 100)).join(", ")}
périmètre: ${sanitizePromptText(input.subtopic.classifierGuidance ?? "", 800)}
</sous_theme>

<raison_selection>${sanitizePromptText(reasons, 200)}</raison_selection>
<formulation>${textPassages.map((passage) => `<passage>${passage}</passage>`).join("")}</formulation>
<contexte>${detailPassages.map((passage) => `<passage>${passage}</passage>`).join("")}</contexte>

Réponds uniquement en JSON :
{"decision":"APPLIES|DOES_NOT_APPLY|UNCERTAIN","confidence":0.0,"justification":"raison concise","evidenceExcerpt":"extrait exact"}`;

  const response = await callMistral([{ role: "user", content: prompt }], {
    model: MODEL,
    maxTokens: 350,
    temperature: 0,
    responseFormat: { type: "json_object" },
  });
  const parsed = decisionSchema.parse(parseMistralJSON<unknown>(extractMistralText(response)));
  assertEvidenceComesFromMeasure(parsed.evidenceExcerpt, sourcePassages.join(" "));

  return {
    ...parsed,
    classifierVersion: `${response.model?.trim() || MODEL}:${SUBTOPIC_DELTA_CLASSIFIER_VERSION}`,
  };
}
