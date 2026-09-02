import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { acquireDocument } from "./acquisition";
import {
  analyzeDocumentDiscourse,
  DISCOURSE_ROLES,
  DISCOURSE_SPEAKERS,
  getDiscourseAnnotationIndex,
  type DiscourseRole,
  type DiscourseSpeaker,
} from "./discourse";
import {
  createEvidenceSnapshot,
  MEASURE_EXTRACTOR_VERSION,
  evaluateEvidenceExtraction,
  extractEvidenceWindow,
  prepareMeasureCandidate,
  PROGRAM_DOCUMENT_PARSER_VERSION,
  type EditorialFormulationGuard,
  type AttributionBasis,
  type EvidenceExtraction,
  type EvidenceOutputGuard,
  type EvidencePolicyGuard,
  type EvidenceSnapshot,
  type EvidenceValidationGuard,
  type PreparedMeasureCandidate,
} from "./evidence-v6";
import { parseDocument } from "./parser";
import { classifyEdition } from "./policy";
import type { DocumentUnit, ProgramDocumentType } from "./types";
import { DISCOURSE_EXTRACTOR_VERSION } from "./versions";

const SHADOW_REPORT_BASENAME = "presidentielle-2027-program-import-v6-shadow";
const WINDOW_MAX_BLOCKS = 12;
const WINDOW_OVERLAP_BLOCKS = 5;
const WINDOW_MAX_PROMPT_CHARACTERS = 18_000;

export type V6ShadowOptions = {
  candidate?: string;
  party?: string;
  /** Explicit candidacy receiving a matching current party platform. Never inferred. */
  partyProgramCandidacyId?: string;
  source?: string;
  limit?: number;
  forceRefetch?: boolean;
  reportDir?: string;
  onProgress?: (event: V6ShadowProgressEvent) => void;
};

export type V6ShadowProgressEvent =
  | {
      type: "document-start";
      documentIndex: number;
      documentTotal: number;
      label: string;
    }
  | {
      type: "window";
      documentIndex: number;
      documentTotal: number;
      windowIndex: number;
      windowTotal: number;
    }
  | {
      type: "retry";
      documentIndex: number;
      documentTotal: number;
      windowIndex: number;
      windowTotal: number;
      attempt: number;
      maxAttempts: number;
      delayMs: number;
    }
  | {
      type: "document-complete";
      documentIndex: number;
      documentTotal: number;
      durationMs: number;
      proposals: number;
    }
  | {
      type: "document-error";
      documentIndex: number;
      documentTotal: number;
      durationMs: number;
      message: string;
    };

export type EvidenceWindow = {
  id: string;
  units: DocumentUnit[];
};

export type V6ShadowProposalReport = {
  id: string;
  programEdition: {
    id: string;
    label: string;
    documentType: ProgramDocumentType;
  };
  document: {
    url: string;
    hash: string;
    publishedAt: string;
  };
  windowId: string;
  classification: string;
  formulation: string | null;
  theme: string | null;
  confidence: number;
  rationale: string;
  attributionBasis: AttributionBasis;
  commitmentAnchorIds: string[];
  supportingIds: string[];
  duplicateStatus: "POSSIBLE_DUPLICATE" | null;
  decision: "READY_FOR_REVIEW" | "REVIEW_WITH_WARNING" | "TECHNICALLY_BLOCKED";
  evidence: EvidenceSnapshot | null;
  preparedCandidate: PreparedMeasureCandidate;
  validation: {
    bundleValidity: "VALID" | "INVALID";
    evidenceGuard: EvidenceValidationGuard | null;
    outputGuards: EvidenceOutputGuard[];
    formulationValidity: "VALID" | "INVALID";
    formulationGuard: EditorialFormulationGuard | null;
    formulationDivergence: "SAFE_LEXICAL_REFORMULATION" | "SUBSTANTIVE_UNSUPPORTED_CONTENT";
    lexicalDivergence: string[];
    policyValidity: "VALID" | "REJECTED";
    policyGuard: EvidencePolicyGuard | null;
    historicalPolicy: "PASSED" | "REJECTED";
    thirdPartyPolicy: "PASSED" | "REJECTED";
    sensitiveContentChecks: "PASSED" | "FAILED";
  };
};

export type V6ShadowEditionReport = {
  programEditionId: string;
  label: string;
  candidate: string;
  documentUrl: string;
  documentType: ProgramDocumentType;
  documentHash: string | null;
  blocks: { total: number; reliable: number; blocked: number };
  units: { total: number; reliable: number; blocked: number };
  discourseCacheKey: string | null;
  discourseCacheHit: boolean;
  windows: number;
  proposals: V6ShadowProposalReport[];
  errors: string[];
  durationMs: number;
};

type EvidenceRejectionCounts = Record<EvidenceValidationGuard, number>;

export type V6ShadowReport = {
  generatedAt: string;
  mode: "v6-shadow-read-only";
  parserVersion: string;
  extractorVersion: string;
  discourseExtractorVersion: string;
  durationMs: number;
  retries: number;
  safety: {
    apply: false;
    databaseWrites: false;
    draftsCreated: 0;
    publication: false;
    migration: false;
    cutover: false;
    productionModified: false;
  };
  documents: {
    known: number;
    fetched: number;
    parsed: number;
    failed: number;
    scannedPdf: number;
    suspectPages: number;
    totalBlocks: number;
    reliableBlocks: number;
    blockedBlocks: number;
    totalUnits: number;
    reliableUnits: number;
    blockedUnits: number;
  };
  discourse: {
    modelCalls: number;
    cacheHits: number;
    speakers: Record<DiscourseSpeaker, number>;
    roles: Record<DiscourseRole, number>;
  };
  extraction: {
    proposed: number;
    unique: number;
    duplicateWindowOutputs: number;
    bundlesValid: number;
    bundlesInvalid: number;
    measures: number;
    objectives: number;
    eligibleForHumanReview: number;
    readyForReview: number;
    reviewWithWarning: number;
    technicallyBlocked: number;
    policyRejected: number;
    formulationRejected: number;
    malformedCandidateOutputs: number;
    errors: number;
  };
  evidence: {
    oneBlock: number;
    twoBlocks: number;
    threeBlocks: number;
    fourBlocks: number;
    fivePlusUnits: number;
    averageBundleSize: number;
    crossingTwoPages: number;
    rejectionCounts: EvidenceRejectionCounts;
  };
  commitment: {
    withAnchor: number;
    missingAnchor: number;
    oneAnchor: number;
    twoAnchors: number;
    threeAnchors: number;
    fourAnchors: number;
    supportingContextBlocks: number;
    attributionBasis: Record<AttributionBasis, number>;
    diagnosticActionsBlocked: number;
    thirdPartyActionsBlocked: number;
    historicalActionsBlocked: number;
    existingPolicyActionsBlocked: number;
    explicitEndorsements: number;
    possibleDuplicates: number;
  };
  editions: V6ShadowEditionReport[];
};

function emptyEvidenceRejectionCounts(): EvidenceRejectionCounts {
  return {
    EMPTY_EVIDENCE: 0,
    TOO_MANY_BLOCKS: 0,
    DUPLICATE_DOCUMENT_BLOCK_ID: 0,
    DUPLICATE_EVIDENCE_BLOCK_ID: 0,
    UNKNOWN_BLOCK_ID: 0,
    BLOCKED_PROVENANCE: 0,
    INCOHERENT_BLOCK_ORDER: 0,
    NON_LOCAL_EVIDENCE: 0,
    CROSSES_HEADING_SCOPE: 0,
    COMMITMENT_ANCHOR_OUTSIDE_EVIDENCE: 0,
    SUPPORTING_BLOCK_OUTSIDE_EVIDENCE: 0,
    DUPLICATE_EVIDENCE_ROLE_ID: 0,
    INCOHERENT_EVIDENCE_ROLE_ORDER: 0,
    OVERLAPPING_EVIDENCE_ROLES: 0,
    UNMAPPED_EVIDENCE_BLOCK: 0,
    MISSING_DISCOURSE_ANNOTATION: 0,
    INVALID_COMMITMENT_ANCHOR_ROLE: 0,
  };
}

function emptySpeakerCounts(): Record<DiscourseSpeaker, number> {
  return Object.fromEntries(DISCOURSE_SPEAKERS.map((speaker) => [speaker, 0])) as Record<
    DiscourseSpeaker,
    number
  >;
}

function emptyRoleCounts(): Record<DiscourseRole, number> {
  return Object.fromEntries(DISCOURSE_ROLES.map((role) => [role, 0])) as Record<
    DiscourseRole,
    number
  >;
}

function unitPromptLength(unit: DocumentUnit): number {
  return Math.min(unit.text.length, 3_000) + 180;
}

function splitReliableRuns(units: DocumentUnit[]): DocumentUnit[][] {
  const runs: DocumentUnit[][] = [];
  let current: DocumentUnit[] = [];
  for (const unit of units) {
    const previous = current.at(-1);
    if (!unit.provenance.extractionAllowed || (previous && unit.order !== previous.order + 1)) {
      if (current.length > 0) runs.push(current);
      current = [];
    }
    if (unit.provenance.extractionAllowed) current.push(unit);
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

function pageLocalGroups(run: DocumentUnit[]): DocumentUnit[][] {
  if (run.every((unit) => unit.page === null)) return [run];
  const byPage = new Map<number, DocumentUnit[]>();
  for (const unit of run) {
    if (unit.page === null) continue;
    const page = byPage.get(unit.page) ?? [];
    page.push(unit);
    byPage.set(unit.page, page);
  }
  const pages = [...byPage.keys()].sort((left, right) => left - right);
  const groups: DocumentUnit[][] = [];
  for (const [index, page] of pages.entries()) {
    const next = pages[index + 1];
    const previous = pages[index - 1];
    if (next !== undefined && next - page <= 1) {
      groups.push([...byPage.get(page)!, ...byPage.get(next)!]);
    } else if (previous === undefined || page - previous > 1) {
      groups.push(byPage.get(page)!);
    }
  }
  return groups;
}

function chunkLocalGroup(units: DocumentUnit[]): DocumentUnit[][] {
  const chunks: DocumentUnit[][] = [];
  let start = 0;
  while (start < units.length) {
    let end = start;
    let characters = 0;
    while (end < units.length && end - start < WINDOW_MAX_BLOCKS) {
      const nextLength = unitPromptLength(units[end]!);
      if (end > start && characters + nextLength > WINDOW_MAX_PROMPT_CHARACTERS) break;
      characters += nextLength;
      end += 1;
    }
    if (end === start) end += 1;
    chunks.push(units.slice(start, end));
    if (end >= units.length) break;
    start = Math.max(start + 1, end - WINDOW_OVERLAP_BLOCKS);
  }
  return chunks;
}

/**
 * Builds overlapping windows from reliable parser blocks. Every valid bundle spanning at most
 * six positions remains visible in at least one window, including across one page boundary.
 */
export function buildEvidenceWindows(units: DocumentUnit[]): EvidenceWindow[] {
  const seen = new Set<string>();
  const windows: EvidenceWindow[] = [];
  for (const run of splitReliableRuns(units)) {
    for (const group of pageLocalGroups(run)) {
      for (const chunk of chunkLocalGroup(group)) {
        const key = chunk.map((unit) => unit.id).join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        windows.push({ id: `${chunk[0]!.id}..${chunk.at(-1)!.id}`, units: chunk });
      }
    }
  }
  return windows;
}

export function assertV6ShadowReadOnly(argv: string[]): boolean {
  const engine = argv.find((argument) => argument.startsWith("--engine="))?.split("=")[1];
  if (engine && engine !== "v5" && engine !== "v6") {
    throw new Error(`Moteur d'import inconnu: ${engine}`);
  }
  const shadow = argv.includes("--shadow-v6") || engine === "v6";
  if (shadow && argv.includes("--apply")) {
    throw new Error(
      "V6 fonctionne uniquement en shadow mode READ-ONLY: --apply est explicitement interdit."
    );
  }
  if (argv.includes("--shadow-v6") && engine === "v5") {
    throw new Error("Options incompatibles: --shadow-v6 ne peut pas être combiné à --engine=v5.");
  }
  return shadow;
}

export function formatV6ShadowProgress(event: V6ShadowProgressEvent): string | null {
  if (event.type === "document-start") {
    return `[program-import-v6] document ${event.documentIndex}/${event.documentTotal}: ${event.label}`;
  }
  if (event.type === "window") {
    if (
      event.windowIndex !== 1 &&
      event.windowIndex !== event.windowTotal &&
      event.windowIndex % 5
    ) {
      return null;
    }
    return `  fenêtre ${event.windowIndex}/${event.windowTotal}`;
  }
  if (event.type === "retry") {
    return `  retry ${event.attempt}/${event.maxAttempts}, fenêtre ${event.windowIndex}/${event.windowTotal}, attente ${event.delayMs} ms`;
  }
  if (event.type === "document-complete") {
    return `  terminé en ${(event.durationMs / 1_000).toFixed(1)} s, ${event.proposals} propositions uniques`;
  }
  return `  erreur après ${(event.durationMs / 1_000).toFixed(1)} s: ${event.message}`;
}

export type V6DuplicateKind =
  | "SAME_EVIDENCE_SET"
  | "SAME_COMMITMENT_ANCHOR_SET"
  | "SAME_NORMALIZED_FORMULATION"
  | "POSSIBLE_DUPLICATE";

function normalizedWords(value: string | null): Set<string> {
  return new Set(
    (value ?? "")
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase("fr")
      .match(/[a-z0-9]+/g) ?? []
  );
}

function setKey(values: string[]): string {
  return [...new Set(values)].sort().join("\u0000");
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 1;
  const intersection = [...left].filter((value) => right.has(value)).length;
  return intersection / (left.size + right.size - intersection);
}

/** Deterministic overlap handling. Only the first three exact cases are silently merged. */
export function classifyV6Duplicate(
  existing: EvidenceExtraction,
  candidate: EvidenceExtraction
): V6DuplicateKind | null {
  if (
    existing.evidenceUnitIds.length > 0 &&
    candidate.evidenceUnitIds.length > 0 &&
    setKey(existing.evidenceUnitIds) === setKey(candidate.evidenceUnitIds)
  ) {
    return "SAME_EVIDENCE_SET";
  }
  if (
    existing.commitmentAnchorIds.length > 0 &&
    setKey(existing.commitmentAnchorIds) === setKey(candidate.commitmentAnchorIds)
  ) {
    return "SAME_COMMITMENT_ANCHOR_SET";
  }
  const existingFormulation = [...normalizedWords(existing.normalizedText)].join(" ");
  const candidateFormulation = [...normalizedWords(candidate.normalizedText)].join(" ");
  if (existingFormulation.length > 0 && existingFormulation === candidateFormulation) {
    return "SAME_NORMALIZED_FORMULATION";
  }
  const lexicalOverlap = jaccard(
    normalizedWords(existing.normalizedText),
    normalizedWords(candidate.normalizedText)
  );
  if (existingFormulation.length === 0 || candidateFormulation.length === 0) return null;
  const evidenceOverlap = jaccard(
    new Set(existing.evidenceUnitIds),
    new Set(candidate.evidenceUnitIds)
  );
  return lexicalOverlap >= 0.85 && evidenceOverlap >= 0.75 ? "POSSIBLE_DUPLICATE" : null;
}

function proposalId(editionId: string, index: number): string {
  return `${editionId}:v6:${String(index + 1).padStart(4, "0")}`;
}

export async function runV6ShadowImport(options: V6ShadowOptions): Promise<V6ShadowReport> {
  const runStartedAt = Date.now();
  if (options.partyProgramCandidacyId && (!options.party || options.candidate)) {
    throw new Error(
      "L'attribution PARTY_PROGRAM exige --party et ne peut pas être combinée à --candidate."
    );
  }
  const election = await db.election.findUniqueOrThrow({
    where: { slug: "presidentielle-2027" },
    select: { id: true },
  });
  const partyProgramCandidacy = options.partyProgramCandidacyId
    ? await db.candidacy.findUnique({
        where: { id: options.partyProgramCandidacyId },
        select: { id: true, candidateName: true, electionId: true, partyId: true },
      })
    : null;
  if (options.partyProgramCandidacyId && !partyProgramCandidacy) {
    throw new Error(`Candidature ${options.partyProgramCandidacyId} introuvable.`);
  }
  if (partyProgramCandidacy && partyProgramCandidacy.electionId !== election.id) {
    throw new Error("La candidature PARTY_PROGRAM n'appartient pas à la présidentielle 2027.");
  }
  const editions = await db.programEdition.findMany({
    where: {
      electionId: election.id,
      ...(options.source ? { id: options.source } : {}),
      ...(options.candidate ? { candidacy: { politician: { slug: options.candidate } } } : {}),
      ...(options.party ? { party: { slug: options.party } } : {}),
    },
    select: {
      id: true,
      label: true,
      ownerType: true,
      documentUrl: true,
      publishedAt: true,
      candidacyId: true,
      partyId: true,
      candidacy: { select: { candidateName: true } },
      party: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
    take: options.limit,
  });

  const report: V6ShadowReport = {
    generatedAt: new Date().toISOString(),
    mode: "v6-shadow-read-only",
    parserVersion: PROGRAM_DOCUMENT_PARSER_VERSION,
    extractorVersion: MEASURE_EXTRACTOR_VERSION,
    discourseExtractorVersion: DISCOURSE_EXTRACTOR_VERSION,
    durationMs: 0,
    retries: 0,
    safety: {
      apply: false,
      databaseWrites: false,
      draftsCreated: 0,
      publication: false,
      migration: false,
      cutover: false,
      productionModified: false,
    },
    documents: {
      known: editions.length,
      fetched: 0,
      parsed: 0,
      failed: 0,
      scannedPdf: 0,
      suspectPages: 0,
      totalBlocks: 0,
      reliableBlocks: 0,
      blockedBlocks: 0,
      totalUnits: 0,
      reliableUnits: 0,
      blockedUnits: 0,
    },
    discourse: {
      modelCalls: 0,
      cacheHits: 0,
      speakers: emptySpeakerCounts(),
      roles: emptyRoleCounts(),
    },
    extraction: {
      proposed: 0,
      unique: 0,
      duplicateWindowOutputs: 0,
      bundlesValid: 0,
      bundlesInvalid: 0,
      measures: 0,
      objectives: 0,
      eligibleForHumanReview: 0,
      readyForReview: 0,
      reviewWithWarning: 0,
      technicallyBlocked: 0,
      policyRejected: 0,
      formulationRejected: 0,
      malformedCandidateOutputs: 0,
      errors: 0,
    },
    evidence: {
      oneBlock: 0,
      twoBlocks: 0,
      threeBlocks: 0,
      fourBlocks: 0,
      fivePlusUnits: 0,
      averageBundleSize: 0,
      crossingTwoPages: 0,
      rejectionCounts: emptyEvidenceRejectionCounts(),
    },
    commitment: {
      withAnchor: 0,
      missingAnchor: 0,
      oneAnchor: 0,
      twoAnchors: 0,
      threeAnchors: 0,
      fourAnchors: 0,
      supportingContextBlocks: 0,
      attributionBasis: {
        CANDIDATE_COMMITMENT: 0,
        CANDIDATE_OBJECTIVE: 0,
        EXPLICIT_ENDORSEMENT: 0,
        THIRD_PARTY: 0,
        HISTORICAL: 0,
        EXISTING_POLICY: 0,
        DIAGNOSIS: 0,
        UNCLEAR: 0,
      },
      diagnosticActionsBlocked: 0,
      thirdPartyActionsBlocked: 0,
      historicalActionsBlocked: 0,
      existingPolicyActionsBlocked: 0,
      explicitEndorsements: 0,
      possibleDuplicates: 0,
    },
    editions: [],
  };
  let totalValidBundleBlocks = 0;

  for (const [editionIndex, edition] of editions.entries()) {
    const documentStartedAt = Date.now();
    const documentIndex = editionIndex + 1;
    const documentTotal = editions.length;
    options.onProgress?.({
      type: "document-start",
      documentIndex,
      documentTotal,
      label: edition.label,
    });
    let documentType = classifyEdition(edition.ownerType, edition.label);
    const attributedPartyProgram =
      edition.ownerType === "PARTY" &&
      partyProgramCandidacy !== null &&
      partyProgramCandidacy.partyId !== null &&
      partyProgramCandidacy.partyId === edition.partyId;
    const effectiveCandidacyId = attributedPartyProgram
      ? partyProgramCandidacy.id
      : edition.candidacyId;
    const editionReport: V6ShadowEditionReport = {
      programEditionId: edition.id,
      label: edition.label,
      candidate:
        (attributedPartyProgram ? partyProgramCandidacy.candidateName : null) ??
        edition.candidacy?.candidateName ??
        edition.party?.name ??
        "Sans propriétaire",
      documentUrl: edition.documentUrl,
      documentType,
      documentHash: null,
      blocks: { total: 0, reliable: 0, blocked: 0 },
      units: { total: 0, reliable: 0, blocked: 0 },
      discourseCacheKey: null,
      discourseCacheHit: false,
      windows: 0,
      proposals: [],
      errors: [],
      durationMs: 0,
    };
    report.editions.push(editionReport);

    if ((edition.ownerType !== "CANDIDACY" || !edition.candidacyId) && !attributedPartyProgram) {
      editionReport.errors.push(
        "Plateforme de parti non attribuable automatiquement à une candidature 2027."
      );
      editionReport.durationMs = Date.now() - documentStartedAt;
      continue;
    }

    try {
      const acquired = await acquireDocument({
        id: edition.id,
        url: edition.documentUrl,
        forceRefetch: options.forceRefetch,
      });
      report.documents.fetched += 1;
      editionReport.documentHash = acquired.hash;
      const parsed = await parseDocument(acquired.bytes, acquired.contentType);
      report.documents.parsed += 1;
      report.documents.scannedPdf += Number(parsed.scannedPdf);
      documentType = classifyEdition(
        edition.ownerType,
        edition.label,
        parsed.blocks.map((block) => block.text).join("\n")
      );
      editionReport.documentType = documentType;
      const reliable = parsed.blocks.filter((block) => block.provenance.extractionAllowed);
      const blocked = parsed.blocks.filter((block) => !block.provenance.extractionAllowed);
      const reliableUnits = parsed.units.filter((unit) => unit.provenance.extractionAllowed);
      const blockedUnits = parsed.units.filter((unit) => !unit.provenance.extractionAllowed);
      editionReport.blocks = {
        total: parsed.blocks.length,
        reliable: reliable.length,
        blocked: blocked.length,
      };
      editionReport.units = {
        total: parsed.units.length,
        reliable: reliableUnits.length,
        blocked: blockedUnits.length,
      };
      report.documents.totalBlocks += parsed.blocks.length;
      report.documents.reliableBlocks += reliable.length;
      report.documents.blockedBlocks += blocked.length;
      report.documents.totalUnits += parsed.units.length;
      report.documents.reliableUnits += reliableUnits.length;
      report.documents.blockedUnits += blockedUnits.length;
      report.documents.suspectPages += parsed.pageDiagnostics.filter(
        (diagnostic) => !diagnostic.extractionAllowed
      ).length;
      if (parsed.scannedPdf) {
        editionReport.errors.push("PDF probablement scanné, OCR requis.");
        continue;
      }

      const annotated = await analyzeDocumentDiscourse(reliableUnits, {
        documentHash: acquired.hash,
        documentLabel: edition.label,
        documentType,
        onRetry: () => {
          report.retries += 1;
        },
      });
      editionReport.discourseCacheKey = annotated.cacheKey;
      editionReport.discourseCacheHit = annotated.fromCache;
      report.discourse.modelCalls += annotated.modelCalls;
      report.discourse.cacheHits += Number(annotated.fromCache);
      for (const annotation of annotated.discourseAnnotations) {
        report.discourse.speakers[annotation.speaker] += 1;
        report.discourse.roles[annotation.discourseRole] += 1;
      }
      const annotationIndex = getDiscourseAnnotationIndex(annotated.discourseAnnotations);
      const windows = buildEvidenceWindows(reliableUnits);
      editionReport.windows = windows.length;
      const seenProposals: EvidenceExtraction[] = [];
      for (const [windowIndex, window] of windows.entries()) {
        options.onProgress?.({
          type: "window",
          documentIndex,
          documentTotal,
          windowIndex: windowIndex + 1,
          windowTotal: windows.length,
        });
        let extractions: Awaited<ReturnType<typeof extractEvidenceWindow>>;
        try {
          extractions = await extractEvidenceWindow(
            window.units,
            window.units.map((unit) => annotationIndex.get(unit.id)!).filter(Boolean),
            { documentLabel: edition.label, documentType },
            {
              onRetry: ({ attempt, maxAttempts, delayMs }) => {
                report.retries += 1;
                options.onProgress?.({
                  type: "retry",
                  documentIndex,
                  documentTotal,
                  windowIndex: windowIndex + 1,
                  windowTotal: windows.length,
                  attempt,
                  maxAttempts,
                  delayMs,
                });
              },
            }
          );
        } catch (error) {
          report.extraction.errors += 1;
          const message = error instanceof Error ? error.message : String(error);
          editionReport.errors.push(`Fenêtre ${window.id}: ${message}`);
          continue;
        }
        report.extraction.proposed += extractions.length;
        for (const extraction of extractions) {
          const duplicateKinds = seenProposals
            .map((existing) => classifyV6Duplicate(existing, extraction))
            .filter((kind): kind is V6DuplicateKind => kind !== null);
          const exactDuplicate = duplicateKinds.find((kind) => kind !== "POSSIBLE_DUPLICATE");
          if (exactDuplicate) {
            report.extraction.duplicateWindowOutputs += 1;
            continue;
          }
          const possibleDuplicate = duplicateKinds.includes("POSSIBLE_DUPLICATE");
          seenProposals.push(extraction);
          report.extraction.unique += 1;
          report.commitment.attributionBasis[extraction.attributionBasis] += 1;
          report.commitment.supportingContextBlocks += extraction.supportingIds.length;
          if (extraction.commitmentAnchorIds.length === 0) {
            report.commitment.missingAnchor += 1;
          } else {
            report.commitment.withAnchor += 1;
          }
          if (extraction.commitmentAnchorIds.length === 1) report.commitment.oneAnchor += 1;
          if (extraction.commitmentAnchorIds.length === 2) report.commitment.twoAnchors += 1;
          if (extraction.commitmentAnchorIds.length === 3) report.commitment.threeAnchors += 1;
          if (extraction.commitmentAnchorIds.length === 4) report.commitment.fourAnchors += 1;
          if (extraction.attributionBasis === "DIAGNOSIS") {
            report.commitment.diagnosticActionsBlocked += 1;
          }
          if (extraction.attributionBasis === "THIRD_PARTY") {
            report.commitment.thirdPartyActionsBlocked += 1;
          }
          if (extraction.attributionBasis === "HISTORICAL") {
            report.commitment.historicalActionsBlocked += 1;
          }
          if (extraction.attributionBasis === "EXISTING_POLICY") {
            report.commitment.existingPolicyActionsBlocked += 1;
          }
          if (extraction.attributionBasis === "EXPLICIT_ENDORSEMENT") {
            report.commitment.explicitEndorsements += 1;
          }
          if (possibleDuplicate) report.commitment.possibleDuplicates += 1;
          if (extraction.outputGuards.length > 0) {
            report.extraction.malformedCandidateOutputs += 1;
          }
          const evaluated = evaluateEvidenceExtraction(
            reliableUnits,
            annotated.discourseAnnotations,
            extraction,
            {
              programEditionId: edition.id,
              documentUrl: edition.documentUrl,
              documentLabel: edition.label,
              documentType,
            }
          );
          if (extraction.classification === "MEASURE") report.extraction.measures += 1;
          if (extraction.classification === "OBJECTIVE") report.extraction.objectives += 1;

          if (evaluated.evidenceGuard) {
            report.extraction.bundlesInvalid += 1;
            report.evidence.rejectionCounts[evaluated.evidenceGuard] += 1;
          } else {
            report.extraction.bundlesValid += 1;
          }
          if (evaluated.formulationGuard) report.extraction.formulationRejected += 1;
          if (evaluated.policyGuard) report.extraction.policyRejected += 1;
          let evidence: EvidenceSnapshot | null = null;
          if (evaluated.evidence && !evaluated.evidenceGuard) {
            evidence = createEvidenceSnapshot(evaluated.evidence, acquired.hash, extraction);
            const size = evidence.units.length;
            totalValidBundleBlocks += size;
            if (size === 1) report.evidence.oneBlock += 1;
            if (size === 2) report.evidence.twoBlocks += 1;
            if (size === 3) report.evidence.threeBlocks += 1;
            if (size === 4) report.evidence.fourBlocks += 1;
            if (size >= 5) report.evidence.fivePlusUnits += 1;
            if (evidence.pages.length === 2) report.evidence.crossingTwoPages += 1;
          }
          const preparedCandidate = prepareMeasureCandidate(evaluated, acquired.hash, {
            candidacyId: effectiveCandidacyId!,
            documentType,
            publishedAt: edition.publishedAt,
            attribution: attributedPartyProgram ? "PARTY_PROGRAM" : "PERSONAL",
            possibleDuplicate,
          });
          if (preparedCandidate.reviewReadiness === "READY_FOR_REVIEW") {
            report.extraction.readyForReview += 1;
            report.extraction.eligibleForHumanReview += 1;
          } else if (preparedCandidate.reviewReadiness === "REVIEW_WITH_WARNING") {
            report.extraction.reviewWithWarning += 1;
            report.extraction.eligibleForHumanReview += 1;
          } else {
            report.extraction.technicallyBlocked += 1;
          }
          editionReport.proposals.push({
            id: proposalId(edition.id, editionReport.proposals.length),
            programEdition: { id: edition.id, label: edition.label, documentType },
            document: {
              url: edition.documentUrl,
              hash: acquired.hash,
              publishedAt: edition.publishedAt.toISOString(),
            },
            windowId: window.id,
            classification: extraction.classification,
            formulation: extraction.normalizedText,
            theme: extraction.theme,
            confidence: extraction.confidence,
            rationale: extraction.rationale,
            attributionBasis: extraction.attributionBasis,
            commitmentAnchorIds: [...extraction.commitmentAnchorIds],
            supportingIds: [...extraction.supportingIds],
            duplicateStatus: possibleDuplicate ? "POSSIBLE_DUPLICATE" : null,
            decision: preparedCandidate.reviewReadiness,
            evidence,
            preparedCandidate,
            validation: {
              bundleValidity: evaluated.evidenceGuard ? "INVALID" : "VALID",
              evidenceGuard: evaluated.evidenceGuard,
              outputGuards: evaluated.outputGuards,
              formulationValidity: evaluated.formulationGuard ? "INVALID" : "VALID",
              formulationGuard: evaluated.formulationGuard,
              formulationDivergence: evaluated.formulationDivergence,
              lexicalDivergence: evaluated.lexicalDivergence,
              policyValidity: evaluated.policyGuard ? "REJECTED" : "VALID",
              policyGuard: evaluated.policyGuard,
              historicalPolicy:
                extraction.attributionBasis === "HISTORICAL" ? "REJECTED" : "PASSED",
              thirdPartyPolicy:
                extraction.attributionBasis === "THIRD_PARTY" ? "REJECTED" : "PASSED",
              sensitiveContentChecks: evaluated.formulationGuard ? "FAILED" : "PASSED",
            },
          });
        }
      }
      editionReport.durationMs = Date.now() - documentStartedAt;
      options.onProgress?.({
        type: "document-complete",
        documentIndex,
        documentTotal,
        durationMs: editionReport.durationMs,
        proposals: editionReport.proposals.length,
      });
    } catch (error) {
      report.documents.failed += 1;
      report.extraction.errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      editionReport.errors.push(message);
      editionReport.durationMs = Date.now() - documentStartedAt;
      options.onProgress?.({
        type: "document-error",
        documentIndex,
        documentTotal,
        durationMs: editionReport.durationMs,
        message,
      });
    }
  }

  report.evidence.averageBundleSize =
    report.extraction.bundlesValid === 0
      ? 0
      : Math.round((totalValidBundleBlocks / report.extraction.bundlesValid) * 100) / 100;
  report.durationMs = Date.now() - runStartedAt;
  await writeV6ShadowReport(report, options.reportDir);
  return report;
}

export async function writeV6ShadowReport(
  report: V6ShadowReport,
  reportDir = ".tmp/program-import/reports"
): Promise<void> {
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    path.join(reportDir, `${SHADOW_REPORT_BASENAME}.json`),
    JSON.stringify(report, null, 2)
  );
  await writeFile(
    path.join(reportDir, `${SHADOW_REPORT_BASENAME}.md`),
    renderV6ShadowMarkdown(report)
  );
}

function renderEvidenceMarkdown(evidence: EvidenceSnapshot | null): string {
  if (!evidence) return "  - Preuve indisponible: bundle invalide.";
  return evidence.units
    .map(
      (unit) =>
        `  - ${unit.role === "COMMITMENT_ANCHOR" ? "Engagement" : "Détails"}, p. ${unit.page ?? "HTML"}, unité ${unit.unitId}, bloc ${unit.blockId}, ordre ${unit.order}, ${unit.speaker}/${unit.discourseRole}, ${unit.provenanceStatus}, hash ${unit.canonicalTextHash}: ${JSON.stringify(unit.canonicalText)}`
    )
    .join("\n");
}

export function renderV6ShadowMarkdown(report: V6ShadowReport): string {
  const rejectionRows = Object.entries(report.evidence.rejectionCounts)
    .map(([guard, count]) => `- ${guard}: ${count}`)
    .join("\n");
  const editionSections = report.editions
    .map((edition) => {
      const proposals = edition.proposals
        .map(
          (proposal) =>
            `#### ${proposal.id} ${proposal.decision}\n\n- Classification: ${proposal.classification}\n- Formulation: ${proposal.formulation ?? "-"}\n- Thème: ${proposal.theme ?? "-"}\n- Confiance: ${proposal.confidence}\n- Attribution: ${proposal.attributionBasis}\n- Anchors: ${proposal.commitmentAnchorIds.join(", ") || "-"}\n- Contexte: ${proposal.supportingIds.join(", ") || "-"}\n- Doublon: ${proposal.duplicateStatus ?? "-"}\n- Document: ${proposal.document.url}\n- Hash document: ${proposal.document.hash}\n- Parser: ${report.parserVersion}\n- Discourse: ${report.discourseExtractorVersion}\n- Extracteur de mesures: ${report.extractorVersion}\n- Sortie modèle: ${proposal.validation.outputGuards.join(", ") || "VALID"}\n- Bundle: ${proposal.validation.bundleValidity} (${proposal.validation.evidenceGuard ?? "-"})\n- Formulation: ${proposal.validation.formulationValidity} (${proposal.validation.formulationGuard ?? "-"})\n- Divergence: ${proposal.validation.formulationDivergence}\n- Policy: ${proposal.validation.policyValidity} (${proposal.validation.policyGuard ?? "-"})\n- Historique: ${proposal.validation.historicalPolicy}\n- Tiers: ${proposal.validation.thirdPartyPolicy}\n- Contenu sensible: ${proposal.validation.sensitiveContentChecks}\n- Divergence lexicale à relire: ${proposal.validation.lexicalDivergence.join(", ") || "-"}\n- Raison du modèle: ${proposal.rationale}\n\nEvidence:\n${renderEvidenceMarkdown(proposal.evidence)}`
        )
        .join("\n\n");
      return `### ${edition.label}\n\n- ProgramEdition: ${edition.programEditionId}\n- Candidature: ${edition.candidate}\n- Document: ${edition.documentUrl}\n- Type: ${edition.documentType}\n- Blocs: ${edition.blocks.total} total, ${edition.blocks.reliable} fiables, ${edition.blocks.blocked} bloqués\n- Unités: ${edition.units.total} total, ${edition.units.reliable} fiables, ${edition.units.blocked} bloquées\n- Cache discourse: ${edition.discourseCacheKey ?? "-"} (${edition.discourseCacheHit ? "HIT" : "MISS"})\n- Fenêtres: ${edition.windows}\n- Durée: ${(edition.durationMs / 1_000).toFixed(1)} s\n- Erreurs: ${edition.errors.join(" | ") || "-"}\n\n${proposals || "Aucune proposition."}`;
    })
    .join("\n\n");
  const attributionRows = Object.entries(report.commitment.attributionBasis)
    .map(([basis, count]) => `- ${basis}: ${count}`)
    .join("\n");
  const speakerRows = Object.entries(report.discourse.speakers)
    .map(([speaker, count]) => `- ${speaker}: ${count}`)
    .join("\n");
  const roleRows = Object.entries(report.discourse.roles)
    .map(([role, count]) => `- ${role}: ${count}`)
    .join("\n");
  return `# Import V6 shadow Présidentielle 2027\n\nGénéré le ${report.generatedAt}. Mode strictement READ-ONLY.\n\n## Sécurité\n\n- --apply: NO\n- DB writes: NO\n- draftsCreated: 0\n- publication: NO\n- migration: NO\n- cutover: NO\n- production modified: NO\n\n## Sémantique\n\nREADY_FOR_REVIEW signifie seulement que la proposition est techniquement prête à être examinée. Ce statut ne valide ni la mesure, ni sa formulation, ni sa publication.\n\n## Corpus\n\n- Documents connus: ${report.documents.known}\n- Documents parsés: ${report.documents.parsed}\n- Documents en échec: ${report.documents.failed}\n- Pages suspectes: ${report.documents.suspectPages}\n- Blocs totaux: ${report.documents.totalBlocks}\n- Blocs fiables: ${report.documents.reliableBlocks}\n- Blocs bloqués: ${report.documents.blockedBlocks}\n- Unités totales: ${report.documents.totalUnits}\n- Unités fiables: ${report.documents.reliableUnits}\n- Unités bloquées: ${report.documents.blockedUnits}\n\n## Discourse\n\n- Version: ${report.discourseExtractorVersion}\n- Appels modèle: ${report.discourse.modelCalls}\n- Cache hits: ${report.discourse.cacheHits}\n\n### Speakers\n\n${speakerRows}\n\n### Roles\n\n${roleRows}\n\n## Extraction\n\n- Extractions proposées: ${report.extraction.proposed}\n- Extractions uniques: ${report.extraction.unique}\n- Sorties mal formées isolées: ${report.extraction.malformedCandidateOutputs}\n- Bundles valides: ${report.extraction.bundlesValid}\n- Bundles invalides: ${report.extraction.bundlesInvalid}\n- MEASURE: ${report.extraction.measures}\n- OBJECTIVE: ${report.extraction.objectives}\n- READY_FOR_REVIEW: ${report.extraction.readyForReview}\n- REVIEW_WITH_WARNING: ${report.extraction.reviewWithWarning}\n- TECHNICALLY_BLOCKED: ${report.extraction.technicallyBlocked}\n- Éligibles à la création d'un DRAFT: ${report.extraction.eligibleForHumanReview}\n- Observations policy: ${report.extraction.policyRejected}\n- Erreurs de formulation détectables: ${report.extraction.formulationRejected}\n- Erreurs: ${report.extraction.errors}\n- Retries: ${report.retries}\n- Durée: ${(report.durationMs / 1_000).toFixed(1)} s\n\n## Engagement et attribution\n\n- Propositions avec anchor: ${report.commitment.withAnchor}\n- Propositions sans anchor: ${report.commitment.missingAnchor}\n- Anchors 1/2/3/4: ${report.commitment.oneAnchor}/${report.commitment.twoAnchors}/${report.commitment.threeAnchors}/${report.commitment.fourAnchors}\n- Unités de contexte: ${report.commitment.supportingContextBlocks}\n- Diagnostics signalés: ${report.commitment.diagnosticActionsBlocked}\n- Tiers bloqués: ${report.commitment.thirdPartyActionsBlocked}\n- Historiques bloqués: ${report.commitment.historicalActionsBlocked}\n- Politiques existantes signalées: ${report.commitment.existingPolicyActionsBlocked}\n- Reprises explicites: ${report.commitment.explicitEndorsements}\n- Doublons possibles: ${report.commitment.possibleDuplicates}\n\n${attributionRows}\n\n## Distribution de la preuve\n\n- 1 unité: ${report.evidence.oneBlock}\n- 2 unités: ${report.evidence.twoBlocks}\n- 3 unités: ${report.evidence.threeBlocks}\n- 4 unités: ${report.evidence.fourBlocks}\n- 5 unités ou plus: ${report.evidence.fivePlusUnits}\n- Bundle moyen: ${report.evidence.averageBundleSize}\n- Bundles traversant deux pages: ${report.evidence.crossingTwoPages}\n\n### Rejets de bundle\n\n${rejectionRows}\n\n## Détail par édition\n\n${editionSections || "Aucune édition analysée."}\n`;
}
