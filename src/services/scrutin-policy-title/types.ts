export type SourceTrust = "official" | "internal" | "editorialContext" | "unknown";

/** Fields the resolver may emit as OFFICIAL, evidence-eligible blocks. V1 list:
 *  - Amendment.content / Amendment.summary: raw AN amendment text (official).
 *  - LegislativeDossier.exposeDesMotifs: bill preamble from AN source — official when populated.
 *  EXCLUDED on purpose: LegislativeDossier.summary (AI-generated) and Scrutin.title
 *  (the procedural label we are improving) — context only, never evidence. */
export type SubstanceField =
  | "Amendment.content"
  | "Amendment.summary"
  | "LegislativeDossier.exposeDesMotifs";

/** Depths the resolver can emit, deepest → shallowest. null (not a value) = no
 *  usable text → FALLBACK. No "article" (article text not ingested in V1) and no
 *  "dossierOnly" (a dossier contributes only via exposeDesMotifs). */
export type SubstanceDepth = "subAmendment" | "amendment" | "exposeDesMotifs";

export interface SubstanceTextBlock {
  // "article" intentionally absent: article text not ingested in V1.
  sourceType: "subAmendment" | "amendment" | "parentAmendment" | "identical" | "dossier";
  sourceId: string;
  field: SubstanceField;
  text: string; // PLAIN text (HTML already stripped)
  trust: SourceTrust; // "official" for everything the resolver emits in V1
  url?: string;
  meta?: { amendmentNumber?: string; articleRef?: string };
}

export interface ResolvedSubstance {
  blocks: SubstanceTextBlock[];
  substanceDepth: SubstanceDepth | null; // null → FALLBACK
  warnings: GenerationWarning[];
}

export interface EvidenceQuote {
  sourceType: SubstanceTextBlock["sourceType"];
  sourceId: string;
  field: SubstanceField;
  quote: string;
  startOffset?: number;
  endOffset?: number;
  url?: string;
}

export interface EvidenceCandidate extends EvidenceQuote {
  keywords: string[];
  weight: number;
}

export interface QualitySignals {
  hasConcreteObject: boolean;
  hasConcreteAction: boolean;
  mentionsOnlyProceduralRefs: boolean;
  evidenceCoverage: number; // 0..1 — WEAK SIGNAL: lexical overlap, not legal correctness
  substanceDepth: SubstanceDepth | null;
  llmSelfConfidence: "HIGH" | "MEDIUM" | "LOW" | null;
  validationFlags: string[];
}

export interface GenerationWarning {
  code: string;
  severity: "info" | "warn" | "blocker";
  message: string;
}

/** Validated shape of the LLM's JSON output. */
export interface PolicyTitleOutput {
  policyTitle: string;
  policySubtitle: string | null;
  evidenceQuotes: EvidenceQuote[];
  selfConfidence: "HIGH" | "MEDIUM" | "LOW";
  rationale: string;
}

export interface GenerateOptions {
  dryRun?: boolean; // resolve + prompt + (optionally) LLM, but NEVER write. Writes gated ONLY by dryRun.
  skipLlm?: boolean; // resolve + build prompt only, no LLM call (implies no write)
  force?: boolean; // regenerate even if a row exists (overwrite in place + revision)
  /** When false, a forced overwrite does NOT create a revision snapshot
   *  (the caller already recorded the authoritative one). Default true. */
  createRevision?: boolean;
  allowUnlinkedFallback?: boolean; // explicit unlinked scrutinId → FALLBACK row instead of skip (default false → skip NO_LINKED_AMENDMENT)
  promptVersion?: string; // default "policy-title-v1"
  modelVersionDate?: string; // ISO date; modelVersion = `${MISTRAL_MODEL}@${modelVersionDate}`
  verbose?: boolean;
}

/** Debug payload attached to a GenerateResult only when `opts.verbose`. Carries
 *  the extra context the debug script prints (officialTitle, links, evidence)
 *  that the lean result does not normally need. */
export interface GenerateResultDebug {
  officialTitle: string;
  officialSourceUrl: string | null;
  proceduralLabel: string;
  links: { role: string; amendmentNumber: string; amendmentId: string }[];
  substanceDepth: SubstanceDepth | null;
  evidenceQuotes: EvidenceQuote[];
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  prompt?: { system: string; user: string };
  rawLlmText?: string;
}

export interface GenerateResult {
  scrutinId: string;
  outcome: "generated" | "fallback" | "skipped";
  status: "DRAFT" | "NEEDS_REVIEW" | null; // derived even in dryRun; null ONLY when skipped
  confidence: "HIGH" | "MEDIUM" | "LOW" | null; // null ONLY when skipped
  policyTitle: string | null;
  policySubtitle?: string | null;
  written: boolean; // true only on a real (non-dryRun) write
  skipReason?: string; // "ROW_EXISTS" | "NO_LINKED_AMENDMENT" | "OUT_OF_SCOPE"
  warnings: GenerationWarning[];
  debug?: GenerateResultDebug; // populated ONLY when opts.verbose
}

export interface GeneratePolicyTitlesStats {
  processed: number;
  generated: number;
  fallbacks: number;
  skipped: number;
  errors: { scrutinId: string; error: string }[];
  durationMs: number;
}
