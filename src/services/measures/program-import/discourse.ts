import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { callMistral, extractMistralText, parseMistralJSON } from "@/lib/api/mistral";
import type { ExtractorRetryEvent } from "./extractor";
import type { DocumentUnit, ProgramDocumentType } from "./types";
import { DISCOURSE_EXTRACTOR_VERSION, PROGRAM_DOCUMENT_PARSER_VERSION } from "./versions";

export { DISCOURSE_EXTRACTOR_VERSION } from "./versions";

export const DISCOURSE_SPEAKERS = [
  "DOCUMENT_AUTHOR",
  "QUOTED_THIRD_PARTY",
  "LEGAL_OR_INSTITUTIONAL_SOURCE",
  "HISTORICAL_ACTOR",
  "UNRESOLVED",
] as const;

export const DISCOURSE_ROLES = [
  "COMMITMENT",
  "OBJECTIVE",
  "EXPLICIT_ENDORSEMENT",
  "DIAGNOSIS",
  "EXISTING_POLICY",
  "TESTIMONY",
  "LEGAL_REFERENCE",
  "HISTORICAL_REFERENCE",
  "EXAMPLE",
  "VALUE",
  "GENERAL_INTENT",
  "DETAIL",
  "OTHER",
] as const;

export const discourseSpeakerSchema = z.enum(DISCOURSE_SPEAKERS);
export const discourseRoleSchema = z.enum(DISCOURSE_ROLES);

export type DiscourseSpeaker = z.infer<typeof discourseSpeakerSchema>;
export type DiscourseRole = z.infer<typeof discourseRoleSchema>;

export type DiscourseAnnotation = {
  unitId: string;
  speaker: DiscourseSpeaker;
  discourseRole: DiscourseRole;
  confidence: number;
  reason: string;
};

export type AnnotatedDocument = {
  units: DocumentUnit[];
  discourseAnnotations: DiscourseAnnotation[];
  cacheKey: string;
  fromCache: boolean;
  modelCalls: number;
};

type DiscourseCache = {
  schemaVersion: "program-discourse-cache/v1";
  cacheKey: string;
  documentHash: string;
  parserVersion: string;
  discourseExtractorVersion: string;
  annotations: DiscourseAnnotation[];
};

const annotationSchema = z.object({
  unitId: z.string().min(1).max(160),
  speaker: discourseSpeakerSchema,
  discourseRole: discourseRoleSchema,
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(300),
});

const responseSchema = z.object({ annotations: z.array(z.unknown()) });
const cacheSchema = z.object({
  schemaVersion: z.literal("program-discourse-cache/v1"),
  cacheKey: z.string().regex(/^[a-f0-9]{64}$/),
  documentHash: z.string().regex(/^[a-f0-9]{64}$/),
  parserVersion: z.string().min(1),
  discourseExtractorVersion: z.string().min(1),
  annotations: z.array(annotationSchema),
});

export const DISCOURSE_SYSTEM_PROMPT = `Tu qualifies des unités documentaires déjà créées par un parser.

Ta seule mission est d'identifier la voix et le rôle discursif de chaque unité demandée. Tu ne génères aucune mesure, ne reformules aucun texte, ne choisis aucun thème et ne crées aucun ID.

Speaker :
- DOCUMENT_AUTHOR : voix éditoriale du document de candidature. Une formulation à l'infinitif, un titre d'action ou un objectif peut relever de cette voix sans employer « nous » ou « je ».
- QUOTED_THIRD_PARTY : témoignage, entretien, citation ou proposition attribuée à une personne extérieure. Les mots « nous devons », « il faut » ou « je propose » restent la voix du tiers lorsqu'ils sont cités.
- LEGAL_OR_INSTITUTIONAL_SOURCE : constitution, loi, décision, rapport ou institution citée comme source.
- HISTORICAL_ACTOR : action ou parole d'un acteur historique.
- UNRESOLVED : la voix ne peut pas être établie.

Rôle :
- COMMITMENT : action que le document adopte comme proposition, avec un moyen ou un instrument identifiable.
- OBJECTIVE : résultat ou cible que le document fixe, sans moyen suffisamment identifié. Un infinitif comme « mieux payer » peut être un objectif lorsque le passage ne dit pas comment.
- EXPLICIT_ENDORSEMENT : acte explicite par lequel le document fait sienne, étend, généralise ou reprend une action ou politique décrite dans une unité voisine. Une citation seule, une référence à des recommandations, un voisinage favorable ou le silence après une citation ne suffisent pas. Une action nouvelle annoncée « conformément à » une source reste COMMITMENT.
- DIAGNOSIS : constat, problème, question rhétorique ou conséquence décrite.
- EXISTING_POLICY : droit, outil ou pratique explicitement déjà en vigueur, y compris un exemple local décrit avec « applique déjà ».
- TESTIMONY : expérience ou demande exprimée dans un témoignage.
- LEGAL_REFERENCE : contenu juridique cité ou décrit.
- HISTORICAL_REFERENCE : action, doctrine ou contexte passé.
- EXAMPLE : illustration factuelle qui n'est ni une politique existante décrite comme telle, ni adoptée comme proposition.
- VALUE : principe ou jugement.
- GENERAL_INTENT : orientation générale non vérifiable comme action ou cible.
- DETAIL : modalité qui précise une proposition voisine sans établir seule l'engagement.
- OTHER : fonction non couverte.

Un même document peut contenir des diagnostics, des citations et des politiques existantes dans sa propre voix. DOCUMENT_AUTHOR ne signifie donc jamais COMMITMENT automatiquement. Utilise le kind QUOTATION et le contexte voisin pour respecter les changements de voix.`;

export const DISCOURSE_OUTPUT_FORMAT = `Réponds uniquement avec cet objet JSON :
{"annotations":[{"unitId":"pdf-1-1-u001","speaker":"DOCUMENT_AUTHOR|QUOTED_THIRD_PARTY|LEGAL_OR_INSTITUTIONAL_SOURCE|HISTORICAL_ACTOR|UNRESOLVED","discourseRole":"COMMITMENT|OBJECTIVE|EXPLICIT_ENDORSEMENT|DIAGNOSIS|EXISTING_POLICY|TESTIMONY|LEGAL_REFERENCE|HISTORICAL_REFERENCE|EXAMPLE|VALUE|GENERAL_INTENT|DETAIL|OTHER","confidence":0.0,"reason":"justification documentaire courte"}]}
Retourne exactement une annotation pour chaque unité marquée focus="true", dans le même ordre. N'annote pas les unités de contexte.`;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function escapePromptText(value: string, maxLength: number): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .slice(0, maxLength);
}

export function getDiscourseCacheKey(input: {
  documentHash: string;
  units: DocumentUnit[];
  parserVersion?: string;
  discourseExtractorVersion?: string;
}): string {
  return sha256(
    JSON.stringify({
      documentHash: input.documentHash,
      parserVersion: input.parserVersion ?? PROGRAM_DOCUMENT_PARSER_VERSION,
      discourseExtractorVersion: input.discourseExtractorVersion ?? DISCOURSE_EXTRACTOR_VERSION,
      units: input.units.map((unit) => [unit.id, sha256(unit.text), unit.kind]),
    })
  );
}

function unresolved(unitId: string, reason: string): DiscourseAnnotation {
  return { unitId, speaker: "UNRESOLVED", discourseRole: "OTHER", confidence: 0, reason };
}

/** Invalid, duplicate, missing and invented annotations all fail closed at unit level. */
export function parseDiscoursePayload(payload: unknown, focusUnits: DocumentUnit[]) {
  const parsed = responseSchema.parse(payload);
  const allowed = new Set(focusUnits.map((unit) => unit.id));
  const grouped = new Map<string, DiscourseAnnotation[]>();
  for (const candidate of parsed.annotations) {
    const annotation = annotationSchema.safeParse(candidate);
    if (!annotation.success || !allowed.has(annotation.data.unitId)) continue;
    const values = grouped.get(annotation.data.unitId) ?? [];
    values.push(annotation.data);
    grouped.set(annotation.data.unitId, values);
  }
  return focusUnits.map((unit) => {
    const values = grouped.get(unit.id) ?? [];
    if (values.length === 0) return unresolved(unit.id, "Annotation absente ou mal formée.");
    if (values.length > 1) return unresolved(unit.id, "Annotations dupliquées.");
    return values[0]!;
  });
}

function renderUnit(unit: DocumentUnit, focus: boolean): string {
  return `<unit id="${escapePromptText(unit.id, 140)}" block-id="${escapePromptText(unit.blockId, 120)}" page="${unit.page ?? "HTML"}" kind="${unit.kind}" focus="${focus}">${escapePromptText(unit.text, 3_000)}</unit>`;
}

function isRateLimitError(error: unknown): boolean {
  return error instanceof Error && /Mistral API error 429|rate limit/i.test(error.message);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function callWithRetry(
  messages: Parameters<typeof callMistral>[0],
  options: Parameters<typeof callMistral>[1],
  onRetry?: (event: ExtractorRetryEvent) => void
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await callMistral(messages, options);
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === 4) throw error;
      const delayMs = 2 ** attempt * 2_000;
      onRetry?.({ attempt: attempt + 2, maxAttempts: 5, delayMs });
      await wait(delayMs);
    }
  }
  throw lastError;
}

type DiscourseBatch = {
  focus: DocumentUnit[];
  contextBefore: DocumentUnit[];
  contextAfter: DocumentUnit[];
};

export function buildDiscourseBatches(units: DocumentUnit[]): DiscourseBatch[] {
  const batches: DiscourseBatch[] = [];
  let start = 0;
  while (start < units.length) {
    let end = start;
    let characters = 0;
    while (end < units.length && end - start < 40) {
      const length = Math.min(units[end]!.text.length, 3_000) + 180;
      if (end > start && characters + length > 16_000) break;
      characters += length;
      end += 1;
    }
    if (end === start) end += 1;
    batches.push({
      focus: units.slice(start, end),
      contextBefore: units.slice(Math.max(0, start - 3), start),
      contextAfter: units.slice(end, Math.min(units.length, end + 3)),
    });
    start = end;
  }
  return batches;
}

async function analyzeBatch(
  batch: DiscourseBatch,
  context: { documentLabel: string; documentType: ProgramDocumentType },
  onRetry?: (event: ExtractorRetryEvent) => void
): Promise<DiscourseAnnotation[]> {
  const rendered = [
    ...batch.contextBefore.map((unit) => renderUnit(unit, false)),
    ...batch.focus.map((unit) => renderUnit(unit, true)),
    ...batch.contextAfter.map((unit) => renderUnit(unit, false)),
  ].join("\n");
  const response = await callWithRetry(
    [
      {
        role: "user",
        content: `${DISCOURSE_OUTPUT_FORMAT}\n\n<document-context><document-type>${escapePromptText(context.documentType, 100)}</document-type><document-label>${escapePromptText(context.documentLabel, 200)}</document-label></document-context>\n<document-units>\n${rendered}\n</document-units>`,
      },
    ],
    {
      system: DISCOURSE_SYSTEM_PROMPT,
      model: "mistral-large-latest",
      maxTokens: 5_000,
      temperature: 0,
      responseFormat: { type: "json_object" },
    },
    onRetry
  );
  return parseDiscoursePayload(parseMistralJSON(extractMistralText(response)), batch.focus);
}

export async function analyzeDocumentDiscourse(
  units: DocumentUnit[],
  context: {
    documentHash: string;
    documentLabel: string;
    documentType: ProgramDocumentType;
    cacheDir?: string;
    onRetry?: (event: ExtractorRetryEvent) => void;
  }
): Promise<AnnotatedDocument> {
  const cacheKey = getDiscourseCacheKey({ documentHash: context.documentHash, units });
  const cacheDir = context.cacheDir ?? ".tmp/program-import/discourse";
  const cachePath = path.join(cacheDir, `${cacheKey}.json`);
  try {
    const cached = cacheSchema.parse(JSON.parse(await readFile(cachePath, "utf8")));
    const expectedIds = units.map((unit) => unit.id).join("\u0000");
    if (
      cached.cacheKey === cacheKey &&
      cached.annotations.map((annotation) => annotation.unitId).join("\u0000") === expectedIds
    ) {
      return {
        units,
        discourseAnnotations: cached.annotations,
        cacheKey,
        fromCache: true,
        modelCalls: 0,
      };
    }
  } catch {
    // Missing, partial or stale caches are recomputed from the parser-owned units.
  }

  const batches = buildDiscourseBatches(units);
  const annotations: DiscourseAnnotation[] = [];
  for (const batch of batches) {
    annotations.push(
      ...(await analyzeBatch(
        batch,
        { documentLabel: context.documentLabel, documentType: context.documentType },
        context.onRetry
      ))
    );
  }
  const cache: DiscourseCache = {
    schemaVersion: "program-discourse-cache/v1",
    cacheKey,
    documentHash: context.documentHash,
    parserVersion: PROGRAM_DOCUMENT_PARSER_VERSION,
    discourseExtractorVersion: DISCOURSE_EXTRACTOR_VERSION,
    annotations,
  };
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cachePath, JSON.stringify(cache, null, 2));
  return {
    units,
    discourseAnnotations: annotations,
    cacheKey,
    fromCache: false,
    modelCalls: batches.length,
  };
}

export function getDiscourseAnnotationIndex(annotations: DiscourseAnnotation[]) {
  const index = new Map<string, DiscourseAnnotation>();
  for (const annotation of annotations) {
    if (index.has(annotation.unitId)) continue;
    index.set(annotation.unitId, annotation);
  }
  return index;
}
