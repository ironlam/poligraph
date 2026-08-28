import { z } from "zod";
import { THEMES_IN_ORDER } from "@/lib/presidentielle/themes";

export const DOCUMENT_TYPES = [
  "CANDIDATE_PROGRAM_2027",
  "CANDIDATE_PROPOSALS_2027",
  "PARTY_PLATFORM_CURRENT",
  "PARTY_PLATFORM_HISTORICAL",
  "THEMATIC_DOCUMENT",
  "CAMPAIGN_SPEECH",
  "UNUSABLE",
] as const;

export type ProgramDocumentType = (typeof DOCUMENT_TYPES)[number];

const classificationSchema = z.enum([
  "MEASURE",
  "OBJECTIVE",
  "VALUE",
  "DIAGNOSIS",
  "GENERAL_INTENT",
  "AMBIGUOUS",
]);

const themeSchema = z.enum(THEMES_IN_ORDER).nullable();

export const normalizationGroundingFailureSchema = z.enum([
  "NUMBER_ADDED",
  "PERCENTAGE_ADDED",
  "CURRENCY_ADDED",
  "PROPER_NAME_ADDED",
  "PRECISE_CONTENT_ADDED",
]);

export type ExtractionGuard =
  | "INVALID_THEME"
  | "INVALID_CONFIDENCE"
  | "INVALID_NORMALIZED_TEXT"
  | "UNGROUNDED_SOURCE_TEXT";

const confidenceSchema = z.number().min(0).max(1);
const normalizedTextSchema = z.string().min(1).nullable();

const extractedProposalSchema = z
  .object({
    sourceText: z.string().min(1),
    // Validate optional model fields inside the proposal transform. One malformed item must
    // never discard valid siblings from the same payload.
    normalizedText: z.unknown(),
    classification: classificationSchema,
    // Keep theme validation local to the proposal. A model-generated theme must never
    // invalidate otherwise valid siblings from the same segment.
    theme: z.unknown(),
    // Validate this field inside the proposal transform so one malformed confidence does not
    // invalidate valid siblings from the same model payload.
    confidence: z.unknown(),
    rationale: z.string().min(1).max(500),
  })
  .transform((proposal) => {
    const theme = themeSchema.safeParse(proposal.theme);
    const confidence = confidenceSchema.safeParse(proposal.confidence);
    const normalizedText = normalizedTextSchema.safeParse(proposal.normalizedText);
    if (!confidence.success) {
      return {
        ...proposal,
        modelClassification: proposal.classification,
        normalizedText: null,
        classification: "AMBIGUOUS" as const,
        theme: null,
        confidence: 0,
        rationale: "Confiance invalide, proposition conservée en attente de revue.",
        extractionGuard: "INVALID_CONFIDENCE" as ExtractionGuard,
        normalizationFallback: null as z.infer<typeof normalizationGroundingFailureSchema> | null,
        exactSourceFallback: false,
        historicalContext: false,
      };
    }
    if (!normalizedText.success) {
      return {
        ...proposal,
        modelClassification: proposal.classification,
        normalizedText: null,
        classification: "AMBIGUOUS" as const,
        theme: null,
        confidence: confidence.data,
        rationale: "Normalisation mal formée, proposition conservée en attente de revue.",
        extractionGuard: "INVALID_NORMALIZED_TEXT" as ExtractionGuard,
        normalizationFallback: null as z.infer<typeof normalizationGroundingFailureSchema> | null,
        exactSourceFallback: false,
        historicalContext: false,
      };
    }
    if (theme.success) {
      return {
        ...proposal,
        normalizedText: normalizedText.data,
        theme: theme.data,
        confidence: confidence.data,
        modelClassification: proposal.classification,
        extractionGuard: null as ExtractionGuard | null,
        normalizationFallback: null as z.infer<typeof normalizationGroundingFailureSchema> | null,
        exactSourceFallback: false,
        historicalContext: false,
      };
    }
    return {
      ...proposal,
      modelClassification: proposal.classification,
      normalizedText: null,
      classification: "AMBIGUOUS" as const,
      theme: null,
      confidence: confidence.data,
      rationale: "Thème hors nomenclature, proposition conservée en attente de revue.",
      extractionGuard: "INVALID_THEME" as ExtractionGuard,
      normalizationFallback: null as z.infer<typeof normalizationGroundingFailureSchema> | null,
      exactSourceFallback: false,
      historicalContext: false,
    };
  });

export const extractionSchema = z.object({
  proposals: z.array(extractedProposalSchema),
});

export type ExtractedProposal = z.infer<typeof extractionSchema>["proposals"][number] & {
  page: number | null;
  segmentProvenance?: DocumentProvenanceStatus;
  provenanceReason?: DocumentProvenanceReason | null;
};

export type DocumentProvenanceStatus =
  | "HTML_TRUSTED"
  | "TEXT_LAYER_TRUSTED"
  | "TEXT_LAYER_REORDERED"
  | "TEXT_LAYER_SUSPECT"
  | "TEXT_LAYER_CORRUPTED"
  | "LEGACY_UNKNOWN";

export type DocumentProvenanceReason =
  | "STABLE_TWO_COLUMN_GUTTER"
  | "AMBIGUOUS_COLUMN_BOUNDARY"
  | "OVERLAPPING_TEXT_LAYERS"
  | "UNSTABLE_TEXT_GEOMETRY";

export type SegmentProvenance = {
  status: DocumentProvenanceStatus;
  reason: DocumentProvenanceReason | null;
  extractionAllowed: boolean;
};

export type PdfPageDiagnostic = SegmentProvenance & {
  page: number;
  lineCount: number;
  overlappingLinePairs: number;
  ambiguousColumnLines?: number;
};

export type DocumentBlockKind = "HEADING" | "CONTENT";

export const DOCUMENT_UNIT_KINDS = [
  "HEADING",
  "SENTENCE",
  "LIST_ITEM",
  "QUOTATION",
  "LABEL",
] as const;

export type DocumentUnitKind = (typeof DOCUMENT_UNIT_KINDS)[number];

export type DocumentNumber = {
  raw: string;
  normalized: string;
  role: "STRUCTURAL" | "CONTENT";
};

/**
 * Deterministic documentary unit used by the evidence-grounded V6 slice.
 *
 * The text is owned by the parser. A model may select the id, but it never supplies or edits
 * this content. IDs only need to remain stable for the same parser version and input bytes.
 */
export type DocumentBlock = {
  id: string;
  order: number;
  heading: string | null;
  page: number | null;
  kind: DocumentBlockKind;
  /** Parser input before removal of demonstrably technical PDF control characters. */
  rawText?: string;
  text: string;
  provenance: SegmentProvenance;
};

/**
 * Smallest parser-owned span exposed to semantic analysis. Text is always a deterministic
 * substring of the canonical parent block. The model can qualify a unit, but cannot create it.
 */
export type DocumentUnit = {
  id: string;
  blockId: string;
  page: number | null;
  order: number;
  blockOrder: number;
  text: string;
  kind: DocumentUnitKind;
  numbers: DocumentNumber[];
  provenance: SegmentProvenance;
};

export type DocumentSegment = {
  id: string;
  heading: string | null;
  page: number | null;
  /** Parser input before removal of demonstrably technical PDF control characters. */
  rawText?: string;
  text: string;
  /** Always populated by production parsers. Optional for focused extractor fixtures. */
  provenance?: SegmentProvenance;
};

export type ParsedDocument = {
  mediaType: "html" | "pdf";
  blocks: DocumentBlock[];
  units: DocumentUnit[];
  segments: DocumentSegment[];
  scannedPdf: boolean;
  pageDiagnostics: PdfPageDiagnostic[];
};
