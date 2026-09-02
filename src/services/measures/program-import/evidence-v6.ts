import { createHash } from "node:crypto";
import { z } from "zod";
import { ThemeCategory } from "@/generated/prisma";
import { callMistral, extractMistralText, parseMistralJSON } from "@/lib/api/mistral";
import { THEMES_IN_ORDER } from "@/lib/presidentielle/themes";
import type { DiscourseAnnotation, DiscourseRole } from "./discourse";
import { getDiscourseAnnotationIndex } from "./discourse";
import type { ExtractorRetryEvent } from "./extractor";
import { evaluateTextualSufficiency } from "./policy";
import type { AcceptanceGuard } from "./policy";
import type { DocumentUnit, ProgramDocumentType } from "./types";
import {
  DISCOURSE_EXTRACTOR_VERSION,
  EVIDENCE_SCHEMA_VERSION,
  MEASURE_EXTRACTOR_VERSION,
  PROGRAM_DOCUMENT_PARSER_VERSION,
} from "./versions";

export { MEASURE_EXTRACTOR_VERSION, PROGRAM_DOCUMENT_PARSER_VERSION } from "./versions";

export const EVIDENCE_BUNDLE_MAX_UNITS = 8;
export const EVIDENCE_BUNDLE_MAX_ORDER_SPAN = 12;
export const EVIDENCE_BUNDLE_MAX_GAP = 3;
export const EVIDENCE_BUNDLE_MAX_PAGE_SPAN = 1;

export const evidenceClassificationSchema = z.enum([
  "MEASURE",
  "OBJECTIVE",
  "VALUE",
  "DIAGNOSIS",
  "GENERAL_INTENT",
  "AMBIGUOUS",
]);

export const ATTRIBUTION_BASES = [
  "CANDIDATE_COMMITMENT",
  "CANDIDATE_OBJECTIVE",
  "EXPLICIT_ENDORSEMENT",
  "THIRD_PARTY",
  "HISTORICAL",
  "EXISTING_POLICY",
  "DIAGNOSIS",
  "UNCLEAR",
] as const;

export const attributionBasisSchema = z.enum(ATTRIBUTION_BASES);
export type AttributionBasis = z.infer<typeof attributionBasisSchema>;

export type EvidenceOutputGuard =
  | "MALFORMED_CANDIDATE"
  | "INVALID_EVIDENCE_BLOCK_IDS"
  | "INVALID_COMMITMENT_ANCHOR_IDS"
  | "INVALID_SUPPORTING_BLOCK_IDS"
  | "INVALID_CLASSIFICATION"
  | "INVALID_NORMALIZED_TEXT"
  | "INVALID_THEME"
  | "INVALID_CONFIDENCE"
  | "INVALID_RATIONALE"
  | "INVALID_ATTRIBUTION_BASIS";

export type EvidenceExtraction = {
  evidenceUnitIds: string[];
  commitmentAnchorIds: string[];
  supportingIds: string[];
  normalizedText: string | null;
  classification: z.infer<typeof evidenceClassificationSchema>;
  theme: ThemeCategory | null;
  confidence: number;
  rationale: string;
  attributionBasis: AttributionBasis;
  outputGuards: EvidenceOutputGuard[];
  rawProposalIndex: number;
};

const evidencePayloadSchema = z.object({ proposals: z.array(z.unknown()) });
const blockIdSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const blockIdsSchema = z.array(blockIdSchema);
const normalizedTextSchema = z.string().min(1).nullable();
const themeSchema = z.enum(THEMES_IN_ORDER).nullable();
const confidenceSchema = z.number().min(0).max(1);
const rationaleSchema = z.string().min(1).max(500);

function parseBlockIds(
  value: unknown,
  guard: EvidenceOutputGuard,
  guards: EvidenceOutputGuard[]
): string[] {
  const parsed = blockIdsSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  guards.push(guard);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => blockIdSchema.safeParse(item).success);
}

function parseEvidenceCandidate(value: unknown, rawProposalIndex: number): EvidenceExtraction {
  const guards: EvidenceOutputGuard[] = [];
  const candidate =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!candidate) guards.push("MALFORMED_CANDIDATE");

  const evidenceUnitIds = parseBlockIds(
    candidate?.evidenceUnitIds,
    "INVALID_EVIDENCE_BLOCK_IDS",
    guards
  );
  const commitmentAnchorIds = parseBlockIds(
    candidate?.commitmentAnchorIds,
    "INVALID_COMMITMENT_ANCHOR_IDS",
    guards
  );
  const supportingIds = parseBlockIds(
    candidate?.supportingIds,
    "INVALID_SUPPORTING_BLOCK_IDS",
    guards
  );
  const normalizedText = normalizedTextSchema.safeParse(candidate?.normalizedText);
  const classification = evidenceClassificationSchema.safeParse(candidate?.classification);
  const theme = themeSchema.safeParse(candidate?.theme);
  const confidence = confidenceSchema.safeParse(candidate?.confidence);
  const rationale = rationaleSchema.safeParse(candidate?.rationale);
  const attributionBasis = attributionBasisSchema.safeParse(candidate?.attributionBasis);
  if (!normalizedText.success) guards.push("INVALID_NORMALIZED_TEXT");
  if (!classification.success) guards.push("INVALID_CLASSIFICATION");
  if (!theme.success) guards.push("INVALID_THEME");
  if (!confidence.success) guards.push("INVALID_CONFIDENCE");
  if (!rationale.success) guards.push("INVALID_RATIONALE");
  if (!attributionBasis.success) guards.push("INVALID_ATTRIBUTION_BASIS");

  return {
    evidenceUnitIds,
    commitmentAnchorIds,
    supportingIds,
    normalizedText: normalizedText.success ? normalizedText.data : null,
    classification: classification.success ? classification.data : "AMBIGUOUS",
    theme: theme.success ? theme.data : null,
    confidence: confidence.success ? confidence.data : 0,
    rationale: rationale.success
      ? rationale.data
      : "Sortie modèle mal formée, proposition conservée comme rejet isolé.",
    attributionBasis: attributionBasis.success ? attributionBasis.data : "UNCLEAR",
    outputGuards: [...new Set(guards)],
    rawProposalIndex,
  };
}

/** Parse the root once, then isolate every malformed proposal from its valid siblings. */
export function parseEvidenceExtractionPayload(payload: unknown): EvidenceExtraction[] {
  const parsed = evidencePayloadSchema.parse(payload);
  return parsed.proposals.map(parseEvidenceCandidate);
}

export type EvidenceDocumentContext = {
  programEditionId: string;
  documentUrl: string;
  documentLabel: string;
  documentType: ProgramDocumentType;
};

export type ValidatedEvidence = EvidenceDocumentContext & {
  units: DocumentUnit[];
  discourseAnnotations: DiscourseAnnotation[];
  pages: number[];
  exactText: string;
  relation: "LOCAL" | "HEADING_SCOPE";
};

export type EvidenceSnapshotUnit = {
  unitId: string;
  blockId: string;
  page: number | null;
  order: number;
  blockOrder: number;
  kind: DocumentUnit["kind"];
  role: "COMMITMENT_ANCHOR" | "SUPPORTING_CONTEXT";
  rawExactText: string;
  canonicalText: string;
  rawTextHash: string;
  canonicalTextHash: string;
  provenanceStatus: DocumentUnit["provenance"]["status"];
  provenanceReason: DocumentUnit["provenance"]["reason"];
  speaker: DiscourseAnnotation["speaker"];
  discourseRole: DiscourseAnnotation["discourseRole"];
  discourseConfidence: number;
  discourseReason: string;
  numbers: DocumentUnit["numbers"];
};

/**
 * Historical proof captured at extraction time. IDs remain useful run addresses, while the
 * exact text, hashes and versions keep the proof auditable after parser changes.
 */
export type EvidenceSnapshot = {
  schemaVersion: "evidence-snapshot/v3";
  programEditionId: string;
  documentUrl: string;
  documentHash: string;
  pages: number[];
  relation: ValidatedEvidence["relation"];
  units: EvidenceSnapshotUnit[];
  discourseAnnotations: DiscourseAnnotation[];
  commitmentAnchorIds: string[];
  supportingIds: string[];
  attributionBasis: AttributionBasis;
  canonicalEvidenceHash: string;
  parserVersion: string;
  discourseExtractorVersion: string;
  measureExtractorVersion: string;
};

export type EvidenceValidationGuard =
  | "EMPTY_EVIDENCE"
  | "TOO_MANY_BLOCKS"
  | "DUPLICATE_DOCUMENT_BLOCK_ID"
  | "DUPLICATE_EVIDENCE_BLOCK_ID"
  | "UNKNOWN_BLOCK_ID"
  | "BLOCKED_PROVENANCE"
  | "INCOHERENT_BLOCK_ORDER"
  | "NON_LOCAL_EVIDENCE"
  | "CROSSES_HEADING_SCOPE"
  | "COMMITMENT_ANCHOR_OUTSIDE_EVIDENCE"
  | "SUPPORTING_BLOCK_OUTSIDE_EVIDENCE"
  | "DUPLICATE_EVIDENCE_ROLE_ID"
  | "INCOHERENT_EVIDENCE_ROLE_ORDER"
  | "OVERLAPPING_EVIDENCE_ROLES"
  | "UNMAPPED_EVIDENCE_BLOCK"
  | "MISSING_DISCOURSE_ANNOTATION"
  | "INVALID_COMMITMENT_ANCHOR_ROLE";

export type EvidenceValidationResult =
  | { ok: true; evidence: ValidatedEvidence }
  | { ok: false; guard: EvidenceValidationGuard; detail: string };

export type EditorialFormulationGuard =
  | "EMPTY_FORMULATION"
  | "NUMBER_ADDED"
  | "PERCENTAGE_ADDED"
  | "CURRENCY_ADDED"
  | "DATE_OR_DURATION_ADDED"
  | "PROPER_NAME_ADDED"
  | "SENSITIVE_TERM_ADDED";

export type EvidencePolicyGuard =
  | "MALFORMED_MODEL_CANDIDATE"
  | "NON_ACTION_CLASSIFICATION"
  | "MISSING_THEME"
  | "MISSING_NORMALIZED_TEXT"
  | "HISTORICAL_REFERENCE"
  | "THIRD_PARTY_ATTRIBUTION"
  | "MISSING_COMMITMENT_ANCHOR"
  | "ACTION_NOT_SUPPORTED_BY_COMMITMENT"
  | "ATTRIBUTION_BASIS_MISMATCH"
  | "INSUFFICIENT_EVIDENCE"
  | AcceptanceGuard;

export type EvaluatedEvidenceProposal = {
  extraction: EvidenceExtraction;
  evidence: ValidatedEvidence | null;
  evidenceGuard: EvidenceValidationGuard | null;
  formulationGuard: EditorialFormulationGuard | null;
  policyGuard: EvidencePolicyGuard | null;
  outputGuards: EvidenceOutputGuard[];
  lexicalDivergence: string[];
  formulationDivergence: "SAFE_LEXICAL_REFORMULATION" | "SUBSTANTIVE_UNSUPPORTED_CONTENT";
  accepted: boolean;
};

export type ReviewReadiness = "READY_FOR_REVIEW" | "REVIEW_WITH_WARNING" | "TECHNICALLY_BLOCKED";

export type ReviewWarning =
  | "POSSIBLE_DIAGNOSIS_AS_ACTION"
  | "POSSIBLE_EXISTING_POLICY"
  | "ATTRIBUTION_UNCERTAIN"
  | "POSSIBLE_DUPLICATE"
  | "OBJECTIVE_VS_MEASURE_UNCERTAIN"
  | "WORDING_NEEDS_REVIEW"
  | "EVIDENCE_SCOPE_WEAK"
  | "MODEL_LOW_CONFIDENCE";

export type TechnicalBlocker =
  | "DOCUMENT_NOT_ATTRIBUTABLE"
  | "DOCUMENT_TYPE_NOT_ADMISSIBLE"
  | "MISSING_EVIDENCE"
  | "INVALID_EVIDENCE_BUNDLE"
  | "INVALID_EVIDENCE_SNAPSHOT"
  | "MALFORMED_MODEL_OUTPUT"
  | "MISSING_COMMITMENT_ANCHOR"
  | "UNSUPPORTED_SUBSTANTIVE_CONTENT"
  | "UNDEFENDABLE_ATTRIBUTION"
  | "MISSING_DRAFT_CLASSIFICATION"
  | "MISSING_DRAFT_THEME"
  | "MISSING_DRAFT_FORMULATION";

type PreparedMeasureCandidateBase = {
  confidence: number;
  reviewReadiness: ReviewReadiness;
  warnings: ReviewWarning[];
  blockers: TechnicalBlocker[];
  observations: string[];
  importFingerprint: string | null;
  draftContext: {
    candidacyId: string;
    programEditionId: string;
    attribution: "PERSONAL" | "PARTY_PROGRAM";
    validFrom: string;
    precision: "OBJECTIF_SANS_CHIFFRE" | null;
    extractionMethod: "AI_ASSISTED";
    extractorVersion: string;
  };
  source: {
    sourceKind: "PROGRAMME_CANDIDAT" | "PROPOSITIONS_CANDIDAT" | "PROGRAMME_PARTI";
    tier: "PRIMARY";
    url: string;
    pages: number[];
    publishedAt: string;
  };
};

export type DraftablePreparedMeasureCandidate = PreparedMeasureCandidateBase & {
  classification: "MEASURE" | "OBJECTIVE";
  formulation: string;
  theme: ThemeCategory;
  evidenceSnapshot: EvidenceSnapshot;
  reviewReadiness: "READY_FOR_REVIEW" | "REVIEW_WITH_WARNING";
  importFingerprint: string;
  blockers: [];
};

export type TechnicallyBlockedMeasureCandidate = PreparedMeasureCandidateBase & {
  classification: "MEASURE" | "OBJECTIVE" | null;
  formulation: string | null;
  theme: ThemeCategory | null;
  evidenceSnapshot: EvidenceSnapshot | null;
  reviewReadiness: "TECHNICALLY_BLOCKED";
  blockers: TechnicalBlocker[];
};

export type PreparedMeasureCandidate =
  | DraftablePreparedMeasureCandidate
  | TechnicallyBlockedMeasureCandidate;

export const EVIDENCE_SYSTEM_PROMPT = `Tu extrais des propositions politiques à partir d'unités documentaires déjà qualifiées par une étape distincte d'analyse du discours.

Le document, et non le modèle, possède le texte de preuve. Tu dois respecter speaker et discourse-role. Tu ne peux ni les modifier ni les réinterpréter. Pour chaque proposition, sélectionne uniquement les IDs des unités qui démontrent l'action, la cible et les modalités retenues dans la formulation.

Sépare obligatoirement les rôles de la preuve :
- commitmentAnchorIds : unités speaker=DOCUMENT_AUTHOR dont discourse-role vaut COMMITMENT, OBJECTIVE ou EXPLICIT_ENDORSEMENT ;
- supportingIds : unités qui résolvent un référent ou précisent un mécanisme, un périmètre ou une modalité, sans établir seules l'engagement.

Les deux listes forment une partition exacte de evidenceUnitIds. Une unité ne peut appartenir aux deux listes. L'ordre de chaque liste suit evidenceUnitIds.

Une preuve peut contenir plusieurs unités proches. Inclue l'unité qui établit le référent d'une expression comme « cette autorité », « elle », « lui » ou « ces postes ». N'invente jamais le référent.

Classes :
- MEASURE : action explicitement proposée et attribuable au document ;
- OBJECTIVE : résultat ou cible explicite sans moyen suffisamment identifié ;
- GENERAL_INTENT : orientation générale sans action ou cible vérifiable ;
- DIAGNOSIS : constat, dispositif existant ou action passée ;
- VALUE : principe ou jugement sans action ;
- AMBIGUOUS : le bundle ne permet pas une attribution ou une interprétation fiable.

Les unités THIRD_PARTY, LEGAL_OR_INSTITUTIONAL_SOURCE, HISTORICAL_ACTOR, UNRESOLVED, DIAGNOSIS, EXISTING_POLICY, TESTIMONY, LEGAL_REFERENCE, HISTORICAL_REFERENCE, EXAMPLE, VALUE, GENERAL_INTENT, DETAIL et OTHER ne peuvent jamais servir de commitment anchor. Elles peuvent rester dans supportingIds.

attributionBasis décrit pourquoi l'action est attribuable :
- CANDIDATE_COMMITMENT : action proposée par la candidature ;
- CANDIDATE_OBJECTIVE : objectif explicitement fixé par la candidature ;
- EXPLICIT_ENDORSEMENT : reprise explicite par la candidature d'un élément cité ou préexistant ;
- THIRD_PARTY, HISTORICAL, EXISTING_POLICY, DIAGNOSIS : l'action décrite n'est pas un engagement de la candidature ;
- UNCLEAR : la voix ou l'endossement ne peut pas être établi.

Une reprise explicite peut inclure une unité historique, tierce ou existante comme supportingIds, mais le commitment anchor doit être l'unité distincte DOCUMENT_AUTHOR + EXPLICIT_ENDORSEMENT.

normalizedText est une proposition de formulation claire pour un relecteur. Chaque assertion substantielle doit être démontrée par les blocs sélectionnés. N'ajoute aucun nombre, montant, pourcentage, date, durée, seuil, nom propre, organisme, dispositif, population, condition, exception ou modalité juridique absent de ces blocs.

Ne renvoie jamais sourceText. Sélectionne entre 1 et 8 IDs par proposition. Ne crée jamais d'ID. Ne réordonne pas les IDs.`;

export const EVIDENCE_OUTPUT_FORMAT = `Réponds uniquement avec un objet JSON de cette forme :
{"proposals":[{"evidenceUnitIds":["p41-b03-u001","p41-b04-u001"],"commitmentAnchorIds":["p41-b04-u001"],"supportingIds":["p41-b03-u001"],"attributionBasis":"CANDIDATE_COMMITMENT|CANDIDATE_OBJECTIVE|EXPLICIT_ENDORSEMENT|THIRD_PARTY|HISTORICAL|EXISTING_POLICY|DIAGNOSIS|UNCLEAR","normalizedText":"formulation fidèle ou null","classification":"MEASURE|OBJECTIVE|VALUE|DIAGNOSIS|GENERAL_INTENT|AMBIGUOUS","theme":"une valeur ThemeCategory ou null","confidence":0.0,"rationale":"raison courte"}]}
evidenceUnitIds contient obligatoirement entre 1 et 8 IDs.
Les seules valeurs de thème sont ${THEMES_IN_ORDER.join(", ")}.`;

function escapePromptText(value: string, maxLength: number): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .slice(0, maxLength);
}

export function renderEvidenceUnitsForPrompt(
  units: DocumentUnit[],
  annotations: DiscourseAnnotation[]
): string {
  const annotationIndex = getDiscourseAnnotationIndex(annotations);
  return units
    .map((unit) => {
      const annotation = annotationIndex.get(unit.id);
      return `<unit id="${escapePromptText(unit.id, 140)}" block-id="${escapePromptText(unit.blockId, 120)}" page="${unit.page ?? "HTML"}" kind="${unit.kind}" speaker="${annotation?.speaker ?? "UNRESOLVED"}" discourse-role="${annotation?.discourseRole ?? "OTHER"}">${escapePromptText(unit.text, 3_000)}</unit>`;
    })
    .join("\n");
}

function isRateLimitError(error: unknown): boolean {
  return error instanceof Error && /Mistral API error 429|rate limit/i.test(error.message);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function callEvidenceExtractorWithRetry(
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

export async function extractEvidenceWindow(
  units: DocumentUnit[],
  annotations: DiscourseAnnotation[],
  context: Pick<EvidenceDocumentContext, "documentLabel" | "documentType">,
  options: { onRetry?: (event: ExtractorRetryEvent) => void } = {}
): Promise<EvidenceExtraction[]> {
  if (units.length === 0) return [];
  if (units.some((unit) => !unit.provenance.extractionAllowed)) {
    throw new Error("Une fenêtre V6 ne peut pas contenir une unité de provenance bloquée");
  }
  const documentaryContext = `<document-context><document-type>${escapePromptText(context.documentType, 100)}</document-type><document-label>${escapePromptText(context.documentLabel, 200)}</document-label></document-context>`;
  const response = await callEvidenceExtractorWithRetry(
    [
      {
        role: "user",
        content: `${EVIDENCE_OUTPUT_FORMAT}\n\n${documentaryContext}\n<document-units>\n${renderEvidenceUnitsForPrompt(units, annotations)}\n</document-units>`,
      },
    ],
    {
      system: EVIDENCE_SYSTEM_PROMPT,
      model: "mistral-large-latest",
      maxTokens: 3000,
      temperature: 0,
      responseFormat: { type: "json_object" },
    },
    options.onRetry
  );
  return parseEvidenceExtractionPayload(parseMistralJSON(extractMistralText(response)));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const evidenceSnapshotV3Schema = z
  .object({
    schemaVersion: z.literal(EVIDENCE_SCHEMA_VERSION),
    programEditionId: z.string().min(1),
    documentUrl: z.string().url(),
    documentHash: sha256Schema,
    pages: z.array(z.number().int().positive()),
    relation: z.enum(["LOCAL", "HEADING_SCOPE"]),
    units: z.array(
      z.object({
        unitId: blockIdSchema,
        blockId: blockIdSchema,
        page: z.number().int().positive().nullable(),
        order: z.number().int().nonnegative(),
        blockOrder: z.number().int().nonnegative(),
        kind: z.enum(["HEADING", "SENTENCE", "LIST_ITEM", "QUOTATION", "LABEL"]),
        role: z.enum(["COMMITMENT_ANCHOR", "SUPPORTING_CONTEXT"]),
        rawExactText: z.string(),
        canonicalText: z.string(),
        rawTextHash: sha256Schema,
        canonicalTextHash: sha256Schema,
        provenanceStatus: z.enum([
          "HTML_TRUSTED",
          "TEXT_LAYER_TRUSTED",
          "TEXT_LAYER_REORDERED",
          "TEXT_LAYER_SUSPECT",
          "TEXT_LAYER_CORRUPTED",
          "LEGACY_UNKNOWN",
        ]),
        provenanceReason: z
          .enum([
            "STABLE_TWO_COLUMN_GUTTER",
            "AMBIGUOUS_COLUMN_BOUNDARY",
            "OVERLAPPING_TEXT_LAYERS",
            "UNSTABLE_TEXT_GEOMETRY",
          ])
          .nullable(),
        speaker: z.enum([
          "DOCUMENT_AUTHOR",
          "QUOTED_THIRD_PARTY",
          "LEGAL_OR_INSTITUTIONAL_SOURCE",
          "HISTORICAL_ACTOR",
          "UNRESOLVED",
        ]),
        discourseRole: z.enum([
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
        ]),
        discourseConfidence: z.number().min(0).max(1),
        discourseReason: z.string().min(1).max(300),
        numbers: z.array(
          z.object({
            raw: z.string().min(1),
            normalized: z.string().min(1),
            role: z.enum(["STRUCTURAL", "CONTENT"]),
          })
        ),
      })
    ),
    discourseAnnotations: z.array(
      z.object({
        unitId: blockIdSchema,
        speaker: z.enum([
          "DOCUMENT_AUTHOR",
          "QUOTED_THIRD_PARTY",
          "LEGAL_OR_INSTITUTIONAL_SOURCE",
          "HISTORICAL_ACTOR",
          "UNRESOLVED",
        ]),
        discourseRole: z.enum([
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
        ]),
        confidence: z.number().min(0).max(1),
        reason: z.string().min(1).max(300),
      })
    ),
    commitmentAnchorIds: z.array(blockIdSchema),
    supportingIds: z.array(blockIdSchema),
    attributionBasis: attributionBasisSchema,
    canonicalEvidenceHash: sha256Schema,
    parserVersion: z.string().min(1),
    discourseExtractorVersion: z.string().min(1),
    measureExtractorVersion: z.string().min(1),
  })
  .superRefine((snapshot, context) => {
    const unitIds = snapshot.units.map((unit) => unit.unitId);
    const anchorIds = snapshot.units
      .filter((unit) => unit.role === "COMMITMENT_ANCHOR")
      .map((unit) => unit.unitId);
    const supportingIds = snapshot.units
      .filter((unit) => unit.role === "SUPPORTING_CONTEXT")
      .map((unit) => unit.unitId);
    if (
      new Set(unitIds).size !== unitIds.length ||
      anchorIds.join("\u0000") !== snapshot.commitmentAnchorIds.join("\u0000") ||
      supportingIds.join("\u0000") !== snapshot.supportingIds.join("\u0000")
    ) {
      context.addIssue({ code: "custom", message: "Partition des rôles de preuve invalide." });
    }
    if (
      snapshot.discourseAnnotations.map((annotation) => annotation.unitId).join("\u0000") !==
      unitIds.join("\u0000")
    ) {
      context.addIssue({ code: "custom", message: "Annotations de discours incomplètes." });
    }
    for (const [index, unit] of snapshot.units.entries()) {
      if (sha256(unit.rawExactText) !== unit.rawTextHash) {
        context.addIssue({
          code: "custom",
          path: ["units", index, "rawTextHash"],
          message: "Empreinte du texte brut invalide.",
        });
      }
      if (sha256(unit.canonicalText) !== unit.canonicalTextHash) {
        context.addIssue({
          code: "custom",
          path: ["units", index, "canonicalTextHash"],
          message: "Empreinte du texte canonique invalide.",
        });
      }
    }
    if (
      sha256(snapshot.units.map((unit) => unit.canonicalText).join("\n\n")) !==
      snapshot.canonicalEvidenceHash
    ) {
      context.addIssue({ code: "custom", message: "Empreinte de la preuve agrégée invalide." });
    }
  });

export function serializeEvidenceSnapshot(snapshot: EvidenceSnapshot): string {
  return JSON.stringify(evidenceSnapshotV3Schema.parse(snapshot));
}

export function deserializeEvidenceSnapshot(value: string): EvidenceSnapshot {
  return evidenceSnapshotV3Schema.parse(JSON.parse(value));
}

export function createEvidenceSnapshot(
  evidence: ValidatedEvidence,
  documentHash: string,
  extraction: EvidenceExtraction
): EvidenceSnapshot {
  const anchors = new Set(extraction.commitmentAnchorIds);
  const annotations = getDiscourseAnnotationIndex(evidence.discourseAnnotations);
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    programEditionId: evidence.programEditionId,
    documentUrl: evidence.documentUrl,
    documentHash,
    pages: [...evidence.pages],
    relation: evidence.relation,
    units: evidence.units.map((unit) => {
      const annotation = annotations.get(unit.id)!;
      return {
        unitId: unit.id,
        blockId: unit.blockId,
        page: unit.page,
        order: unit.order,
        blockOrder: unit.blockOrder,
        kind: unit.kind,
        role: anchors.has(unit.id) ? "COMMITMENT_ANCHOR" : "SUPPORTING_CONTEXT",
        rawExactText: unit.text,
        canonicalText: unit.text,
        rawTextHash: sha256(unit.text),
        canonicalTextHash: sha256(unit.text),
        provenanceStatus: unit.provenance.status,
        provenanceReason: unit.provenance.reason,
        speaker: annotation.speaker,
        discourseRole: annotation.discourseRole,
        discourseConfidence: annotation.confidence,
        discourseReason: annotation.reason,
        numbers: unit.numbers,
      };
    }),
    discourseAnnotations: evidence.discourseAnnotations.map((annotation) => ({ ...annotation })),
    commitmentAnchorIds: [...extraction.commitmentAnchorIds],
    supportingIds: [...extraction.supportingIds],
    attributionBasis: extraction.attributionBasis,
    canonicalEvidenceHash: sha256(evidence.exactText),
    parserVersion: PROGRAM_DOCUMENT_PARSER_VERSION,
    discourseExtractorVersion: DISCOURSE_EXTRACTOR_VERSION,
    measureExtractorVersion: MEASURE_EXTRACTOR_VERSION,
  };
}

function uniqueValues<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function createV6ImportFingerprint(input: {
  programEditionId: string;
  documentHash: string;
  canonicalEvidenceHash: string;
  classification: "MEASURE" | "OBJECTIVE";
  formulation: string;
}): string {
  const normalizedFormulation = input.formulation
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return createHash("sha256")
    .update(
      JSON.stringify({
        programEditionId: input.programEditionId,
        documentHash: input.documentHash,
        canonicalEvidenceHash: input.canonicalEvidenceHash,
        classification: input.classification,
        formulation: normalizedFormulation,
      })
    )
    .digest("hex");
}

function reviewWarningsFor(
  proposal: EvaluatedEvidenceProposal,
  possibleDuplicate: boolean
): ReviewWarning[] {
  const warnings: ReviewWarning[] = [];
  const { attributionBasis, normalizedText, confidence } = proposal.extraction;
  const anchorAnnotations = proposal.evidence?.discourseAnnotations.filter((annotation) =>
    proposal.extraction.commitmentAnchorIds.includes(annotation.unitId)
  );
  if (
    attributionBasis === "DIAGNOSIS" ||
    anchorAnnotations?.some((annotation) => annotation.discourseRole === "DIAGNOSIS")
  ) {
    warnings.push("POSSIBLE_DIAGNOSIS_AS_ACTION");
  }
  if (
    attributionBasis === "EXISTING_POLICY" ||
    proposal.policyGuard === "DESCRIPTIVE_EXISTING_POLICY" ||
    anchorAnnotations?.some((annotation) => annotation.discourseRole === "EXISTING_POLICY")
  ) {
    warnings.push("POSSIBLE_EXISTING_POLICY");
  }
  if (
    attributionBasis === "UNCLEAR" ||
    proposal.policyGuard === "INSUFFICIENT_ATTRIBUTION" ||
    anchorAnnotations?.some((annotation) => annotation.speaker === "UNRESOLVED")
  ) {
    warnings.push("ATTRIBUTION_UNCERTAIN");
  }
  if (possibleDuplicate) warnings.push("POSSIBLE_DUPLICATE");
  if (proposal.policyGuard === "ATTRIBUTION_BASIS_MISMATCH") {
    warnings.push("OBJECTIVE_VS_MEASURE_UNCERTAIN");
  }
  if (
    normalizedText === null ||
    [
      "TITLE_WITHOUT_ACTION",
      "TITLE_OR_NOMINAL_LABEL",
      "SLOGAN_OR_PRINCIPLE",
      "GENERAL_INTENT_FORMULATION",
      "RHETORICAL_FORMULATION",
    ].includes(proposal.policyGuard ?? "")
  ) {
    warnings.push("WORDING_NEEDS_REVIEW");
  }
  if (
    ["INSUFFICIENT_EVIDENCE", "DEPENDENT_FRAGMENT", "MISSING_REFERENT"].includes(
      proposal.policyGuard ?? ""
    )
  ) {
    warnings.push("EVIDENCE_SCOPE_WEAK");
  }
  if (confidence < 0.75) warnings.push("MODEL_LOW_CONFIDENCE");
  return uniqueValues(warnings);
}

function invalidAnchorCanReachReview(proposal: EvaluatedEvidenceProposal): boolean {
  if (proposal.evidenceGuard !== "INVALID_COMMITMENT_ANCHOR_ROLE" || !proposal.evidence) {
    return false;
  }
  const annotationIndex = getDiscourseAnnotationIndex(proposal.evidence.discourseAnnotations);
  return proposal.extraction.commitmentAnchorIds.every((unitId) => {
    const annotation = annotationIndex.get(unitId);
    if (!annotation) return false;
    if (annotation.speaker !== "DOCUMENT_AUTHOR" && annotation.speaker !== "UNRESOLVED") {
      return false;
    }
    return !["TESTIMONY", "LEGAL_REFERENCE", "HISTORICAL_REFERENCE"].includes(
      annotation.discourseRole
    );
  });
}

export function isDraftablePreparedCandidate(
  candidate: PreparedMeasureCandidate
): candidate is DraftablePreparedMeasureCandidate {
  return candidate.reviewReadiness !== "TECHNICALLY_BLOCKED";
}

export function prepareMeasureCandidate(
  proposal: EvaluatedEvidenceProposal,
  documentHash: string,
  context: {
    candidacyId: string;
    documentType: ProgramDocumentType;
    publishedAt: Date;
    attribution?: "PERSONAL" | "PARTY_PROGRAM";
    possibleDuplicate?: boolean;
  }
): PreparedMeasureCandidate {
  const classification =
    proposal.extraction.classification === "MEASURE" ||
    proposal.extraction.classification === "OBJECTIVE"
      ? proposal.extraction.classification
      : null;
  const theme = proposal.extraction.theme;
  const formulation = proposal.extraction.normalizedText ?? proposal.evidence?.exactText ?? null;
  const blockers: TechnicalBlocker[] = [];
  const reviewableInvalidAnchor = invalidAnchorCanReachReview(proposal);
  if (context.candidacyId.trim() === "") blockers.push("DOCUMENT_NOT_ATTRIBUTABLE");
  const attribution = context.attribution ?? "PERSONAL";
  const admissibleDocument =
    (attribution === "PERSONAL" &&
      (context.documentType === "CANDIDATE_PROGRAM_2027" ||
        context.documentType === "CANDIDATE_PROPOSALS_2027")) ||
    (attribution === "PARTY_PROGRAM" && context.documentType === "PARTY_PLATFORM_CURRENT");
  if (!admissibleDocument) {
    blockers.push("DOCUMENT_TYPE_NOT_ADMISSIBLE");
  }
  if (!proposal.evidence) blockers.push("MISSING_EVIDENCE");
  if (proposal.evidenceGuard && !reviewableInvalidAnchor) {
    blockers.push("INVALID_EVIDENCE_BUNDLE");
  }
  if (proposal.outputGuards.length > 0 || proposal.policyGuard === "MALFORMED_MODEL_CANDIDATE") {
    blockers.push("MALFORMED_MODEL_OUTPUT");
  }
  if (proposal.extraction.commitmentAnchorIds.length === 0) {
    blockers.push("MISSING_COMMITMENT_ANCHOR");
  }
  if (proposal.formulationGuard) blockers.push("UNSUPPORTED_SUBSTANTIVE_CONTENT");
  if (
    proposal.extraction.attributionBasis === "THIRD_PARTY" ||
    proposal.extraction.attributionBasis === "HISTORICAL" ||
    proposal.policyGuard === "HISTORICAL_REFERENCE" ||
    proposal.policyGuard === "CORRUPTED_SOURCE_TEXT"
  ) {
    blockers.push("UNDEFENDABLE_ATTRIBUTION");
  }
  if (classification === null) blockers.push("MISSING_DRAFT_CLASSIFICATION");
  if (theme === null) blockers.push("MISSING_DRAFT_THEME");
  if (formulation === null || formulation.trim() === "") blockers.push("MISSING_DRAFT_FORMULATION");

  let evidenceSnapshot: EvidenceSnapshot | null = null;
  if (proposal.evidence && (!proposal.evidenceGuard || reviewableInvalidAnchor)) {
    const candidateSnapshot = createEvidenceSnapshot(
      proposal.evidence,
      documentHash,
      proposal.extraction
    );
    const parsedSnapshot = evidenceSnapshotV3Schema.safeParse(candidateSnapshot);
    if (parsedSnapshot.success) evidenceSnapshot = parsedSnapshot.data as EvidenceSnapshot;
    else blockers.push("INVALID_EVIDENCE_SNAPSHOT");
  }

  const warnings = reviewWarningsFor(proposal, context.possibleDuplicate === true);
  const common = {
    confidence: proposal.extraction.confidence,
    warnings,
    blockers: uniqueValues(blockers),
    observations: [
      ...(proposal.evidenceGuard ? [`evidence:${proposal.evidenceGuard}`] : []),
      ...(proposal.formulationGuard ? [`formulation:${proposal.formulationGuard}`] : []),
      ...(proposal.policyGuard ? [`policy:${proposal.policyGuard}`] : []),
      ...proposal.outputGuards.map((guard) => `output:${guard}`),
    ],
    draftContext: {
      candidacyId: context.candidacyId,
      programEditionId: proposal.evidence?.programEditionId ?? "",
      attribution,
      validFrom: context.publishedAt.toISOString(),
      precision: classification === "OBJECTIVE" ? ("OBJECTIF_SANS_CHIFFRE" as const) : null,
      extractionMethod: "AI_ASSISTED" as const,
      extractorVersion: MEASURE_EXTRACTOR_VERSION,
    },
    source: {
      sourceKind:
        attribution === "PARTY_PROGRAM"
          ? ("PROGRAMME_PARTI" as const)
          : context.documentType === "CANDIDATE_PROGRAM_2027"
            ? ("PROGRAMME_CANDIDAT" as const)
            : ("PROPOSITIONS_CANDIDAT" as const),
      tier: "PRIMARY" as const,
      url: proposal.evidence?.documentUrl ?? "",
      pages: proposal.evidence ? [...proposal.evidence.pages] : [],
      publishedAt: context.publishedAt.toISOString(),
    },
  };

  if (
    common.blockers.length > 0 ||
    classification === null ||
    theme === null ||
    formulation === null ||
    evidenceSnapshot === null
  ) {
    return {
      ...common,
      classification,
      formulation,
      theme,
      evidenceSnapshot,
      reviewReadiness: "TECHNICALLY_BLOCKED",
      importFingerprint: null,
    };
  }

  return {
    ...common,
    classification,
    formulation,
    theme,
    evidenceSnapshot,
    reviewReadiness: warnings.length > 0 ? "REVIEW_WITH_WARNING" : "READY_FOR_REVIEW",
    importFingerprint: createV6ImportFingerprint({
      programEditionId: evidenceSnapshot.programEditionId,
      documentHash,
      canonicalEvidenceHash: evidenceSnapshot.canonicalEvidenceHash,
      classification,
      formulation,
    }),
    blockers: [],
  };
}

export function validateEvidenceBundle(
  documentUnits: DocumentUnit[],
  discourseAnnotations: DiscourseAnnotation[],
  unitIds: string[],
  context: EvidenceDocumentContext
): EvidenceValidationResult {
  if (unitIds.length === 0) {
    return { ok: false, guard: "EMPTY_EVIDENCE", detail: "Aucune unité de preuve sélectionnée." };
  }
  if (unitIds.length > EVIDENCE_BUNDLE_MAX_UNITS) {
    return {
      ok: false,
      guard: "TOO_MANY_BLOCKS",
      detail: `Le bundle dépasse ${EVIDENCE_BUNDLE_MAX_UNITS} unités.`,
    };
  }

  const index = new Map<string, DocumentUnit>();
  for (const unit of documentUnits) {
    if (index.has(unit.id)) {
      return {
        ok: false,
        guard: "DUPLICATE_DOCUMENT_BLOCK_ID",
        detail: `Le parser a produit plusieurs unités ${unit.id}.`,
      };
    }
    index.set(unit.id, unit);
  }
  if (new Set(unitIds).size !== unitIds.length) {
    return {
      ok: false,
      guard: "DUPLICATE_EVIDENCE_BLOCK_ID",
      detail: "Une même unité est sélectionnée plusieurs fois.",
    };
  }

  const selected: DocumentUnit[] = [];
  for (const unitId of unitIds) {
    const unit = index.get(unitId);
    if (!unit) {
      return {
        ok: false,
        guard: "UNKNOWN_BLOCK_ID",
        detail: `L'unité ${unitId} n'existe pas dans le document courant.`,
      };
    }
    if (!unit.provenance.extractionAllowed) {
      return {
        ok: false,
        guard: "BLOCKED_PROVENANCE",
        detail: `L'unité ${unitId} a la provenance ${unit.provenance.status}.`,
      };
    }
    selected.push(unit);
  }

  if (selected.some((unit, index) => index > 0 && unit.order <= selected[index - 1]!.order)) {
    return {
      ok: false,
      guard: "INCOHERENT_BLOCK_ORDER",
      detail: "Les IDs ne suivent pas l'ordre documentaire.",
    };
  }

  const first = selected[0]!;
  const last = selected.at(-1)!;
  const hasWideGap = selected.some(
    (unit, index) => index > 0 && unit.order - selected[index - 1]!.order > EVIDENCE_BUNDLE_MAX_GAP
  );
  const pages = [...new Set(selected.flatMap((unit) => (unit.page === null ? [] : [unit.page])))];
  const pageSpan = pages.length === 0 ? 0 : Math.max(...pages) - Math.min(...pages);
  if (
    last.order - first.order > EVIDENCE_BUNDLE_MAX_ORDER_SPAN ||
    hasWideGap ||
    pageSpan > EVIDENCE_BUNDLE_MAX_PAGE_SPAN
  ) {
    return {
      ok: false,
      guard: "NON_LOCAL_EVIDENCE",
      detail: "Les unités sélectionnées ne forment pas une preuve locale.",
    };
  }

  const headingInsideSpan = documentUnits.find(
    (unit) => unit.kind === "HEADING" && unit.order > first.order && unit.order <= last.order
  );
  if (headingInsideSpan) {
    return {
      ok: false,
      guard: "CROSSES_HEADING_SCOPE",
      detail: `Le bundle traverse le titre ${headingInsideSpan.id}.`,
    };
  }

  const annotationIndex = getDiscourseAnnotationIndex(discourseAnnotations);
  const selectedAnnotations = selected.map((unit) => annotationIndex.get(unit.id));
  if (selectedAnnotations.some((annotation) => annotation === undefined)) {
    return {
      ok: false,
      guard: "MISSING_DISCOURSE_ANNOTATION",
      detail: "Au moins une unité sélectionnée ne possède pas d'annotation de discours.",
    };
  }

  return {
    ok: true,
    evidence: {
      ...context,
      units: selected,
      discourseAnnotations: selectedAnnotations as DiscourseAnnotation[],
      pages: pages.sort((left, right) => left - right),
      exactText: selected.map((unit) => unit.text).join("\n\n"),
      relation: first.kind === "HEADING" ? "HEADING_SCOPE" : "LOCAL",
    },
  };
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[‘’‛`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fr");
}

function wordTokens(value: string): string[] {
  return normalize(value).match(/[a-z0-9]+/g) ?? [];
}

function numericTokens(value: string): Set<string> {
  return new Set(
    (normalize(value).match(/\d+(?:[ \u00a0\u202f]\d{3})*(?:[,.]\d+)?/g) ?? []).map((token) =>
      token.replace(/[ \u00a0\u202f]/g, "").replace(",", ".")
    )
  );
}

function properNameTokens(value: string): Set<string> {
  const names = new Set<string>();
  for (const match of value.matchAll(/\p{L}[\p{L}'’.-]*/gu)) {
    const token = match[0];
    const letters = token.replace(/[^\p{L}]/gu, "");
    const startsSentence =
      match.index === 0 || /[.!?]\s*$/.test(value.slice(0, match.index).trimEnd());
    const acronym = letters.length >= 2 && letters === letters.toLocaleUpperCase("fr");
    const titleCase = /^\p{Lu}\p{Ll}{2,}/u.test(letters) && !startsSentence;
    if (acronym || titleCase) names.add(normalize(token));
  }
  return names;
}

const TEMPORAL_TERMS = new Set([
  "janvier",
  "fevrier",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "aout",
  "septembre",
  "octobre",
  "novembre",
  "decembre",
  "jour",
  "jours",
  "semaine",
  "semaines",
  "mois",
  "an",
  "ans",
  "annee",
  "annees",
  "trimestre",
  "trimestriel",
  "semestre",
  "mandat",
]);

const SENSITIVE_TERMS = new Set([
  "agence",
  "allocation",
  "autorite",
  "beneficiaire",
  "beneficiaires",
  "chomeur",
  "chomeurs",
  "commission",
  "condition",
  "conditions",
  "conseil",
  "dispositif",
  "decret",
  "entreprise",
  "entreprises",
  "exception",
  "famille",
  "familles",
  "financier",
  "financiere",
  "financiers",
  "financieres",
  "fonds",
  "fonctionnaire",
  "fonctionnaires",
  "interdiction",
  "jeune",
  "jeunes",
  "loi",
  "menage",
  "menages",
  "ministere",
  "obligation",
  "plafond",
  "population",
  "populations",
  "quota",
  "registre",
  "retraite",
  "retraites",
  "revenu",
  "salarie",
  "salaries",
  "sanction",
  "seuil",
  "sauf",
  "statut",
  "taxe",
  "uniquement",
]);

const FUNCTION_WORDS = new Set([
  "a",
  "afin",
  "au",
  "aux",
  "avec",
  "ce",
  "ces",
  "cette",
  "dans",
  "de",
  "des",
  "du",
  "elle",
  "en",
  "et",
  "il",
  "la",
  "le",
  "les",
  "leur",
  "leurs",
  "lui",
  "nous",
  "par",
  "pour",
  "que",
  "qui",
  "sa",
  "ses",
  "son",
  "sur",
  "un",
  "une",
]);

export function getEditorialFormulationGuard(
  evidenceText: string,
  normalizedText: string,
  evidenceUnits?: DocumentUnit[]
): EditorialFormulationGuard | null {
  if (normalizedText.trim() === "") return "EMPTY_FORMULATION";
  const evidenceNumbers = evidenceUnits
    ? new Set(
        evidenceUnits.flatMap((unit) =>
          unit.numbers
            .filter((number) => number.role === "CONTENT")
            .map((number) => number.normalized)
        )
      )
    : numericTokens(evidenceText);
  if ([...numericTokens(normalizedText)].some((value) => !evidenceNumbers.has(value))) {
    return "NUMBER_ADDED";
  }
  if (/%|\bpour\s+cent\b/iu.test(normalizedText) && !/%|\bpour\s+cent\b/iu.test(evidenceText)) {
    return "PERCENTAGE_ADDED";
  }
  if (/€|\beuros?\b/iu.test(normalizedText) && !/€|\beuros?\b/iu.test(evidenceText)) {
    return "CURRENCY_ADDED";
  }

  const evidenceTokens = new Set(wordTokens(evidenceText));
  const normalizedTokens = new Set(wordTokens(normalizedText));
  if (
    [...normalizedTokens].some((token) => TEMPORAL_TERMS.has(token) && !evidenceTokens.has(token))
  ) {
    return "DATE_OR_DURATION_ADDED";
  }
  const normalizedEvidence = normalize(evidenceText);
  if ([...properNameTokens(normalizedText)].some((name) => !normalizedEvidence.includes(name))) {
    return "PROPER_NAME_ADDED";
  }
  if (
    [...normalizedTokens].some((token) => SENSITIVE_TERMS.has(token) && !evidenceTokens.has(token))
  ) {
    return "SENSITIVE_TERM_ADDED";
  }
  return null;
}

export function getEditorialLexicalDivergence(
  evidenceText: string,
  normalizedText: string
): string[] {
  const evidenceTokens = new Set(wordTokens(evidenceText));
  return [
    ...new Set(
      wordTokens(normalizedText).filter(
        (token) => token.length > 2 && !FUNCTION_WORDS.has(token) && !evidenceTokens.has(token)
      )
    ),
  ];
}

const ADMISSIBLE_ANCHOR_ROLES = new Set<DiscourseRole>([
  "COMMITMENT",
  "OBJECTIVE",
  "EXPLICIT_ENDORSEMENT",
]);

function validateEvidenceRoles(
  extraction: EvidenceExtraction,
  annotations: DiscourseAnnotation[]
): EvidenceValidationGuard | null {
  const evidence = new Set(extraction.evidenceUnitIds);
  const anchors = new Set(extraction.commitmentAnchorIds);
  const supporting = new Set(extraction.supportingIds);
  if (anchors.size !== extraction.commitmentAnchorIds.length) {
    return "DUPLICATE_EVIDENCE_ROLE_ID";
  }
  if (supporting.size !== extraction.supportingIds.length) {
    return "DUPLICATE_EVIDENCE_ROLE_ID";
  }
  if (extraction.commitmentAnchorIds.some((id) => !evidence.has(id))) {
    return "COMMITMENT_ANCHOR_OUTSIDE_EVIDENCE";
  }
  if (extraction.supportingIds.some((id) => !evidence.has(id))) {
    return "SUPPORTING_BLOCK_OUTSIDE_EVIDENCE";
  }
  if (extraction.commitmentAnchorIds.some((id) => supporting.has(id))) {
    return "OVERLAPPING_EVIDENCE_ROLES";
  }
  if (extraction.evidenceUnitIds.some((id) => !anchors.has(id) && !supporting.has(id))) {
    return "UNMAPPED_EVIDENCE_BLOCK";
  }
  const orderedAnchors = extraction.evidenceUnitIds.filter((id) => anchors.has(id));
  const orderedSupporting = extraction.evidenceUnitIds.filter((id) => supporting.has(id));
  if (
    orderedAnchors.join("\u0000") !== extraction.commitmentAnchorIds.join("\u0000") ||
    orderedSupporting.join("\u0000") !== extraction.supportingIds.join("\u0000")
  ) {
    return "INCOHERENT_EVIDENCE_ROLE_ORDER";
  }
  const annotationIndex = getDiscourseAnnotationIndex(annotations);
  if (
    extraction.commitmentAnchorIds.some((id) => {
      const annotation = annotationIndex.get(id);
      return (
        !annotation ||
        annotation.speaker !== "DOCUMENT_AUTHOR" ||
        !ADMISSIBLE_ANCHOR_ROLES.has(annotation.discourseRole)
      );
    })
  ) {
    return "INVALID_COMMITMENT_ANCHOR_ROLE";
  }
  return null;
}

function attributionPolicyGuard(extraction: EvidenceExtraction): EvidencePolicyGuard | null {
  if (extraction.commitmentAnchorIds.length === 0) return "MISSING_COMMITMENT_ANCHOR";
  if (
    extraction.attributionBasis === "THIRD_PARTY" ||
    extraction.attributionBasis === "HISTORICAL" ||
    extraction.attributionBasis === "EXISTING_POLICY" ||
    extraction.attributionBasis === "DIAGNOSIS" ||
    extraction.attributionBasis === "UNCLEAR"
  ) {
    return "ACTION_NOT_SUPPORTED_BY_COMMITMENT";
  }
  if (
    (extraction.classification === "MEASURE" &&
      extraction.attributionBasis === "CANDIDATE_OBJECTIVE") ||
    (extraction.classification === "OBJECTIVE" &&
      extraction.attributionBasis === "CANDIDATE_COMMITMENT")
  ) {
    return "ATTRIBUTION_BASIS_MISMATCH";
  }
  return null;
}

export function evaluateEvidenceExtraction(
  documentUnits: DocumentUnit[],
  discourseAnnotations: DiscourseAnnotation[],
  extraction: EvidenceExtraction,
  context: EvidenceDocumentContext
): EvaluatedEvidenceProposal {
  const validation = validateEvidenceBundle(
    documentUnits,
    discourseAnnotations,
    extraction.evidenceUnitIds,
    context
  );
  if (!validation.ok) {
    return {
      extraction,
      evidence: null,
      evidenceGuard: validation.guard,
      formulationGuard: null,
      policyGuard: null,
      outputGuards: extraction.outputGuards,
      lexicalDivergence: [],
      formulationDivergence: "SAFE_LEXICAL_REFORMULATION",
      accepted: false,
    };
  }

  const evidence = validation.evidence;
  const evidenceRoleGuard = validateEvidenceRoles(extraction, discourseAnnotations);
  if (evidenceRoleGuard) {
    return {
      extraction,
      evidence,
      evidenceGuard: evidenceRoleGuard,
      formulationGuard: null,
      policyGuard: null,
      outputGuards: extraction.outputGuards,
      lexicalDivergence: [],
      formulationDivergence: "SAFE_LEXICAL_REFORMULATION",
      accepted: false,
    };
  }
  if (extraction.outputGuards.length > 0) {
    return {
      extraction,
      evidence,
      evidenceGuard: null,
      formulationGuard: null,
      policyGuard: "MALFORMED_MODEL_CANDIDATE",
      outputGuards: extraction.outputGuards,
      lexicalDivergence: [],
      formulationDivergence: "SAFE_LEXICAL_REFORMULATION",
      accepted: false,
    };
  }
  if (extraction.classification !== "MEASURE" && extraction.classification !== "OBJECTIVE") {
    return {
      extraction,
      evidence,
      evidenceGuard: null,
      formulationGuard: null,
      policyGuard: "NON_ACTION_CLASSIFICATION",
      outputGuards: extraction.outputGuards,
      lexicalDivergence: [],
      formulationDivergence: "SAFE_LEXICAL_REFORMULATION",
      accepted: false,
    };
  }
  const attributionGuard = attributionPolicyGuard(extraction);
  if (attributionGuard) {
    return {
      extraction,
      evidence,
      evidenceGuard: null,
      formulationGuard: null,
      policyGuard: attributionGuard,
      outputGuards: extraction.outputGuards,
      lexicalDivergence: [],
      formulationDivergence: "SAFE_LEXICAL_REFORMULATION",
      accepted: false,
    };
  }
  if (extraction.theme === null) {
    return {
      extraction,
      evidence,
      evidenceGuard: null,
      formulationGuard: null,
      policyGuard: "MISSING_THEME",
      outputGuards: extraction.outputGuards,
      lexicalDivergence: [],
      formulationDivergence: "SAFE_LEXICAL_REFORMULATION",
      accepted: false,
    };
  }
  if (extraction.normalizedText === null) {
    return {
      extraction,
      evidence,
      evidenceGuard: null,
      formulationGuard: null,
      policyGuard: "MISSING_NORMALIZED_TEXT",
      outputGuards: extraction.outputGuards,
      lexicalDivergence: [],
      formulationDivergence: "SAFE_LEXICAL_REFORMULATION",
      accepted: false,
    };
  }

  const lexicalDivergence = getEditorialLexicalDivergence(
    evidence.exactText,
    extraction.normalizedText
  );
  const formulationGuard = getEditorialFormulationGuard(
    evidence.exactText,
    extraction.normalizedText,
    evidence.units
  );
  if (formulationGuard) {
    return {
      extraction,
      evidence,
      evidenceGuard: null,
      formulationGuard,
      policyGuard: null,
      outputGuards: extraction.outputGuards,
      lexicalDivergence,
      formulationDivergence: "SUBSTANTIVE_UNSUPPORTED_CONTENT",
      accepted: false,
    };
  }
  // V7 does not require every selected unit to be autonomous. Only a dependency at the
  // opening boundary proves that an antecedent is still missing from the bundle. Other
  // negative guards remain useful on the complete evidence, while a documentary heading is
  // allowed to introduce the action or objective developed by the following blocks.
  const openingSufficiency = evaluateTextualSufficiency(evidence.units[0]!.text);
  const aggregateSufficiency = evaluateTextualSufficiency(evidence.exactText);
  const missingOpeningEvidence =
    openingSufficiency === "MISSING_REFERENT" || openingSufficiency === "DEPENDENT_FRAGMENT";
  const documentedHeading =
    evidence.units[0]!.kind === "HEADING" &&
    evidence.units.some((unit) => unit.kind !== "HEADING" && unit.kind !== "LABEL");
  const policyGuard = missingOpeningEvidence
    ? "INSUFFICIENT_EVIDENCE"
    : aggregateSufficiency === "TITLE_OR_NOMINAL_LABEL" && documentedHeading
      ? null
      : aggregateSufficiency;
  return {
    extraction,
    evidence,
    evidenceGuard: null,
    formulationGuard: null,
    policyGuard,
    outputGuards: extraction.outputGuards,
    lexicalDivergence,
    formulationDivergence: "SAFE_LEXICAL_REFORMULATION",
    accepted: policyGuard === null,
  };
}

export function renderEvidenceProposalMarkdown(proposal: EvaluatedEvidenceProposal): string {
  const evidence = proposal.evidence;
  const evidenceLines = evidence
    ? evidence.units
        .map(
          (unit) =>
            `- p. ${unit.page ?? "HTML"} / unit ${unit.id} / ${unit.provenance.status}: ${JSON.stringify(unit.text)}`
        )
        .join("\n")
    : "- Preuve invalide, aucun texte reconstruit.";
  return `Formulation:\n${proposal.extraction.normalizedText ?? "-"}\n\nEvidence:\n${evidenceLines}\n\nDocument:\n${evidence?.documentUrl ?? "-"} (édition ${evidence?.programEditionId ?? "-"})\n\nClassification:\n${proposal.extraction.classification}\n\nValidation:\n- Bundle: ${proposal.evidenceGuard ?? "VALID"}\n- Formulation: ${proposal.formulationGuard ?? "VALID"}\n- Divergence: ${proposal.formulationDivergence}\n- Policy: ${proposal.policyGuard ?? "VALID"}\n- Divergence lexicale à relire: ${proposal.lexicalDivergence.join(", ") || "-"}\n\nDecision:\n${proposal.accepted ? "eligible for human review" : "not eligible for human review"}`;
}
