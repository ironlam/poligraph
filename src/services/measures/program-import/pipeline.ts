import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { assertHubMeasureCandidacy } from "@/app/admin/mesures/_data/candidacy-eligibility";
import { createMeasure } from "@/lib/measures/transitions";
import { acquireDocument } from "./acquisition";
import { jaccardSimilarity, normalizeForDeduplication } from "./deduplication";
import { extractSegment, EXTRACTOR_VERSION } from "./extractor";
import { parseDocument } from "./parser";
import { ACCEPTANCE_POLICY_VERSION, classifyEdition, finalizeProposalForReview } from "./policy";
import type { FinalizedProposal } from "./policy";
import type {
  DocumentProvenanceReason,
  DocumentProvenanceStatus,
  DocumentSegment,
  ExtractedProposal,
  ProgramDocumentType,
} from "./types";

export type ProgramImportOptions = {
  apply: boolean;
  candidate?: string;
  party?: string;
  source?: string;
  limit?: number;
  forceRefetch?: boolean;
  reportDir?: string;
  onProgress?: (event: ProgramImportProgressEvent) => void;
};

export type ProgramImportProgressEvent =
  | {
      type: "document-start";
      documentIndex: number;
      documentTotal: number;
      label: string;
      documentUrl: string;
    }
  | {
      type: "segment";
      documentIndex: number;
      documentTotal: number;
      segmentIndex: number;
      segmentTotal: number;
      segmentId: string;
    }
  | {
      type: "retry";
      documentIndex: number;
      documentTotal: number;
      segmentIndex: number;
      segmentTotal: number;
      attempt: number;
      maxAttempts: number;
      delayMs: number;
    }
  | {
      type: "document-complete";
      documentIndex: number;
      documentTotal: number;
      durationMs: number;
      proposalsDetected: number;
    }
  | {
      type: "document-error";
      documentIndex: number;
      documentTotal: number;
      durationMs: number;
      message: string;
    };

export type ProgramImportCandidateStatus =
  | "READY_FOR_REVIEW"
  | "PARTIAL"
  | "NO_ATTRIBUTABLE_PROGRAM"
  | "SOURCE_MISSING"
  | "IMPORT_ERROR";

type CandidateReportProposal = {
  programEditionId: string;
  documentUrl: string;
  documentType: ProgramDocumentType;
  sourceTier: "PRIMARY";
  segmentId: string;
  segmentProvenance?: DocumentProvenanceStatus;
  provenanceReason?: DocumentProvenanceReason | null;
} & FinalizedProposal;

type CandidateProvenanceIssue = {
  documentUrl: string;
  page: number;
  status: "TEXT_LAYER_SUSPECT" | "TEXT_LAYER_CORRUPTED";
  reason: DocumentProvenanceReason;
  blockedSegments: number;
};

type CandidateReport = {
  candidate: string;
  sources: string[];
  sourceTypes: ProgramDocumentType[];
  documentsAnalyzed: number;
  detected: number;
  draftsExisting: number;
  draftsAdded: number;
  published: number;
  /** Percentage from 0 to 100, or null when no proposal was considered. */
  primaryShare: number | null;
  themes: string[];
  proposals: CandidateReportProposal[];
  errors: string[];
  blockers: string[];
  provenanceIssues?: CandidateProvenanceIssue[];
  /** Technical eligibility only: at least one proposal can enter human review. */
  status: ProgramImportCandidateStatus;
};

export function calculatePrimaryShare(primaryCount: number, totalCount: number): number | null {
  if (totalCount === 0) return null;
  return Math.round((primaryCount / totalCount) * 10_000) / 100;
}

/** Fail closed: segments from a suspect PDF layer never reach the extractor. */
export function filterExtractableSegments(segments: DocumentSegment[]): DocumentSegment[] {
  return segments.filter((segment) => segment.provenance?.extractionAllowed !== false);
}

export function formatProgramImportProgress(event: ProgramImportProgressEvent): string | null {
  if (event.type === "document-start") {
    return `[program-import] document ${event.documentIndex}/${event.documentTotal}: ${event.label}`;
  }
  if (event.type === "segment") {
    if (
      event.segmentIndex !== 1 &&
      event.segmentIndex !== event.segmentTotal &&
      event.segmentIndex % 5 !== 0
    ) {
      return null;
    }
    return `  segment ${event.segmentIndex}/${event.segmentTotal}`;
  }
  if (event.type === "retry") {
    return `  retry ${event.attempt}/${event.maxAttempts}, segment ${event.segmentIndex}/${event.segmentTotal}, attente ${event.delayMs} ms`;
  }
  if (event.type === "document-complete") {
    return `  terminé en ${(event.durationMs / 1_000).toFixed(1)} s, ${event.proposalsDetected} propositions détectées`;
  }
  return `  erreur après ${(event.durationMs / 1_000).toFixed(1)} s: ${event.message}`;
}

export type ProgramImportReport = {
  generatedAt: string;
  mode: "dry-run" | "apply";
  decisionPolicyVersion: string;
  documents: {
    known: number;
    fetched: number;
    parsed: number;
    failed: number;
    scannedPdf: number;
    suspectPages?: number;
    blockedSegments?: number;
  };
  propositions: {
    detected: number;
    measures: number;
    objectives: number;
    rejected: number;
    ambiguous: number;
    duplicates: number;
  };
  database: { draftsCreated: number; alreadyPresent: number; publishedUnchanged: number };
  candidates: CandidateReport[];
};

function candidateReviewStatus(candidate: CandidateReport, mode: ProgramImportReport["mode"]) {
  if (candidate.draftsAdded > 0) return "READY_FOR_REVIEW" as const;
  if (mode === "dry-run" && candidate.proposals.some((proposal) => proposal.accepted)) {
    return "READY_FOR_REVIEW" as const;
  }
  return "PARTIAL" as const;
}

export function canonicalizeProgramImportReport(report: ProgramImportReport): ProgramImportReport {
  return {
    ...report,
    documents: {
      ...report.documents,
      suspectPages: report.documents.suspectPages ?? 0,
      blockedSegments: report.documents.blockedSegments ?? 0,
    },
    decisionPolicyVersion: ACCEPTANCE_POLICY_VERSION,
    candidates: report.candidates.map((candidate) => {
      const proposals = candidate.proposals.map((proposal) => {
        const withProvenance = {
          ...proposal,
          segmentProvenance: proposal.segmentProvenance ?? "LEGACY_UNKNOWN",
          provenanceReason: proposal.provenanceReason ?? null,
        } as CandidateReportProposal;
        return { ...withProvenance, ...finalizeProposalForReview(withProvenance) };
      });
      const status =
        candidate.status === "READY_FOR_REVIEW" || candidate.status === "PARTIAL"
          ? candidateReviewStatus({ ...candidate, proposals }, report.mode)
          : candidate.status;
      return {
        ...candidate,
        proposals,
        themes: [
          ...new Set(
            proposals
              .filter((proposal) => proposal.accepted && proposal.theme !== null)
              .map((proposal) => proposal.theme!)
          ),
        ],
        provenanceIssues: candidate.provenanceIssues ?? [],
        status,
      };
    }),
  };
}

function chunkSegments(segments: DocumentSegment[], maxCharacters = 7_000): DocumentSegment[] {
  const chunks: DocumentSegment[] = [];
  for (const segment of segments) {
    const previous = chunks.at(-1);
    if (
      previous &&
      previous.page === segment.page &&
      previous.provenance?.status === segment.provenance?.status &&
      previous.provenance?.reason === segment.provenance?.reason &&
      previous.text.length + segment.text.length < maxCharacters
    ) {
      previous.text += `\n\n${segment.text}`;
    } else {
      chunks.push({ ...segment });
    }
  }
  return chunks;
}

export async function runProgramImport(
  options: ProgramImportOptions
): Promise<ProgramImportReport> {
  const election = await db.election.findUniqueOrThrow({
    where: { slug: "presidentielle-2027" },
    select: { id: true },
  });
  const candidacies = await db.candidacy.findMany({
    where: { electionId: election.id },
    select: {
      id: true,
      candidateName: true,
      partyId: true,
      status: true,
      sourceUrl: true,
      sourceLabel: true,
      measures: { select: { publicationStatus: true } },
    },
    orderBy: { candidateName: "asc" },
  });
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
  const report: ProgramImportReport = {
    generatedAt: new Date().toISOString(),
    mode: options.apply ? "apply" : "dry-run",
    decisionPolicyVersion: ACCEPTANCE_POLICY_VERSION,
    documents: {
      known: editions.length,
      fetched: 0,
      parsed: 0,
      failed: 0,
      scannedPdf: 0,
      suspectPages: 0,
      blockedSegments: 0,
    },
    propositions: {
      detected: 0,
      measures: 0,
      objectives: 0,
      rejected: 0,
      ambiguous: 0,
      duplicates: 0,
    },
    database: {
      draftsCreated: 0,
      alreadyPresent: 0,
      publishedUnchanged: await db.measure.count({
        where: { electionId: election.id, publicationStatus: "PUBLISHED" },
      }),
    },
    candidates: [],
  };
  const reports = new Map<string, CandidateReport>(
    candidacies.map((candidacy) => {
      const eligible =
        candidacy.status === "DECLARE" && candidacy.sourceUrl && candidacy.sourceLabel;
      return [
        candidacy.id,
        {
          candidate: candidacy.candidateName,
          sources: [],
          sourceTypes: [],
          documentsAnalyzed: 0,
          detected: 0,
          draftsExisting: candidacy.measures.filter(
            (measure) => measure.publicationStatus === "DRAFT"
          ).length,
          draftsAdded: 0,
          published: candidacy.measures.filter(
            (measure) => measure.publicationStatus === "PUBLISHED"
          ).length,
          primaryShare: null,
          themes: [],
          proposals: [],
          errors: [],
          blockers: eligible
            ? []
            : ["Candidature non éligible: elle doit être DECLARE et sourcée."],
          provenanceIssues: [],
          status: eligible ? "SOURCE_MISSING" : "NO_ATTRIBUTABLE_PROGRAM",
        },
      ];
    })
  );
  const provenanceCounts = new Map<string, { primary: number; total: number }>();

  for (const [editionIndex, edition] of editions.entries()) {
    const documentIndex = editionIndex + 1;
    const documentTotal = editions.length;
    const startedAt = Date.now();
    options.onProgress?.({
      type: "document-start",
      documentIndex,
      documentTotal,
      label: edition.label,
      documentUrl: edition.documentUrl,
    });
    const matchedCandidacy = edition.candidacyId
      ? candidacies.find((candidacy) => candidacy.id === edition.candidacyId)
      : candidacies.find((candidacy) => candidacy.partyId === edition.partyId);
    const reportKey = matchedCandidacy?.id ?? `party:${edition.partyId ?? edition.id}`;
    const candidateName =
      matchedCandidacy?.candidateName ?? edition.party?.name ?? "Sans propriétaire";
    const candidate = reports.get(reportKey) ?? {
      candidate: candidateName,
      sources: [],
      sourceTypes: [],
      documentsAnalyzed: 0,
      detected: 0,
      draftsExisting: 0,
      draftsAdded: 0,
      published: 0,
      primaryShare: null,
      themes: [],
      proposals: [],
      errors: [],
      blockers: [],
      provenanceIssues: [],
      status: "PARTIAL" as const,
    };
    reports.set(reportKey, candidate);
    candidate.sources.push(edition.documentUrl);
    let documentType = classifyEdition(edition.ownerType, edition.label);
    candidate.sourceTypes.push(documentType);

    if (edition.ownerType === "PARTY" || !edition.candidacyId) {
      candidate.blockers.push(
        "Plateforme de parti non attribuable automatiquement à une candidature 2027."
      );
      candidate.status = "NO_ATTRIBUTABLE_PROGRAM";
      continue;
    }

    let eligible: { electionId: string; politicianId: string };
    try {
      eligible = await assertHubMeasureCandidacy(edition.candidacyId);
    } catch (error) {
      candidate.blockers.push(error instanceof Error ? error.message : String(error));
      candidate.status = "NO_ATTRIBUTABLE_PROGRAM";
      continue;
    }

    try {
      const acquired = await acquireDocument({
        id: edition.id,
        url: edition.documentUrl,
        forceRefetch: options.forceRefetch,
      });
      report.documents.fetched += 1;
      const parsed = await parseDocument(acquired.bytes, acquired.contentType);
      documentType = classifyEdition(
        edition.ownerType,
        edition.label,
        parsed.segments.map((segment) => segment.text).join("\n")
      );
      candidate.sourceTypes[candidate.sourceTypes.length - 1] = documentType;
      report.documents.parsed += 1;
      report.documents.scannedPdf += Number(parsed.scannedPdf);
      candidate.documentsAnalyzed += 1;
      if (parsed.scannedPdf) {
        candidate.blockers.push("PDF probablement scanné, OCR requis.");
        continue;
      }

      const blockedDiagnostics = parsed.pageDiagnostics.filter(
        (diagnostic) => !diagnostic.extractionAllowed
      );
      const blockedSegments = parsed.segments.filter(
        (segment) => segment.provenance?.extractionAllowed === false
      );
      report.documents.suspectPages =
        (report.documents.suspectPages ?? 0) + blockedDiagnostics.length;
      report.documents.blockedSegments =
        (report.documents.blockedSegments ?? 0) + blockedSegments.length;
      for (const diagnostic of blockedDiagnostics) {
        if (
          diagnostic.status !== "TEXT_LAYER_SUSPECT" &&
          diagnostic.status !== "TEXT_LAYER_CORRUPTED"
        ) {
          continue;
        }
        const issue = {
          documentUrl: edition.documentUrl,
          page: diagnostic.page,
          status: diagnostic.status,
          reason: diagnostic.reason ?? "UNSTABLE_TEXT_GEOMETRY",
          blockedSegments: blockedSegments.filter((segment) => segment.page === diagnostic.page)
            .length,
        };
        candidate.provenanceIssues?.push(issue);
        candidate.blockers.push(`Provenance PDF bloquée page ${diagnostic.page}: ${issue.reason}.`);
      }

      const proposals: Array<{ proposal: ExtractedProposal; segment: DocumentSegment }> = [];
      const segments = chunkSegments(filterExtractableSegments(parsed.segments));
      for (const [segmentIndex, segment] of segments.entries()) {
        options.onProgress?.({
          type: "segment",
          documentIndex,
          documentTotal,
          segmentIndex: segmentIndex + 1,
          segmentTotal: segments.length,
          segmentId: segment.id,
        });
        const extracted = await extractSegment(segment, {
          documentContext: {
            documentType,
            documentLabel: edition.label,
          },
          onRetry: ({ attempt, maxAttempts, delayMs }) =>
            options.onProgress?.({
              type: "retry",
              documentIndex,
              documentTotal,
              segmentIndex: segmentIndex + 1,
              segmentTotal: segments.length,
              attempt,
              maxAttempts,
              delayMs,
            }),
        });
        proposals.push(...extracted.map((proposal) => ({ proposal, segment })));
      }
      candidate.detected += proposals.length;
      report.propositions.detected += proposals.length;
      const provenance = provenanceCounts.get(reportKey) ?? { primary: 0, total: 0 };
      provenance.primary += proposals.length;
      provenance.total += proposals.length;
      provenanceCounts.set(reportKey, provenance);
      const exactSeen = new Set<string>();
      for (const { proposal, segment } of proposals) {
        if (proposal.classification === "MEASURE") report.propositions.measures += 1;
        else if (proposal.classification === "OBJECTIVE") report.propositions.objectives += 1;
        else if (proposal.classification === "AMBIGUOUS") report.propositions.ambiguous += 1;
        else report.propositions.rejected += 1;
        const finalizedProposal = finalizeProposalForReview({
          ...proposal,
          segmentProvenance: segment.provenance?.status ?? "LEGACY_UNKNOWN",
          provenanceReason: segment.provenance?.reason ?? null,
        });
        candidate.proposals.push({
          programEditionId: edition.id,
          documentUrl: edition.documentUrl,
          documentType,
          sourceTier: "PRIMARY",
          segmentId: segment.id,
          segmentProvenance: finalizedProposal.segmentProvenance,
          provenanceReason: finalizedProposal.provenanceReason,
          ...finalizedProposal,
        });
        if (!finalizedProposal.accepted) continue;
        const text = finalizedProposal.normalizedText!;
        const exact = normalizeForDeduplication(text);
        if (exactSeen.has(exact)) {
          report.propositions.duplicates += 1;
          continue;
        }
        exactSeen.add(exact);

        const existing = await db.measure.findMany({
          where: { candidacyId: edition.candidacyId, theme: finalizedProposal.theme! },
          select: { publicationStatus: true, latestRevision: { select: { text: true } } },
        });
        const same = existing.find(
          (item) =>
            item.latestRevision && normalizeForDeduplication(item.latestRevision.text) === exact
        );
        if (same) {
          report.database.alreadyPresent += 1;
          report.propositions.duplicates += 1;
          continue;
        }
        const possible = existing.find(
          (item) => item.latestRevision && jaccardSimilarity(item.latestRevision.text, text) >= 0.72
        );
        if (possible) {
          report.propositions.duplicates += 1;
          candidate.blockers.push(`Doublon probable: ${text}`);
          continue;
        }

        candidate.themes.push(finalizedProposal.theme!);
        if (options.apply) {
          await createMeasure({
            politicianId: eligible.politicianId,
            electionId: eligible.electionId,
            candidacyId: edition.candidacyId,
            programEditionId: edition.id,
            attribution: "PERSONAL",
            theme: finalizedProposal.theme!,
            precedingMeasureId: null,
            revision: {
              text,
              precision:
                finalizedProposal.classification === "OBJECTIVE" ? "OBJECTIF_SANS_CHIFFRE" : null,
              validFrom: edition.publishedAt,
              extractionMethod: "AI_ASSISTED",
              extractionConfidence: finalizedProposal.confidence,
              extractorVersion: EXTRACTOR_VERSION,
            },
            sources: [
              {
                sourceKind:
                  documentType === "CANDIDATE_PROGRAM_2027"
                    ? "PROGRAMME_CANDIDAT"
                    : "PROPOSITIONS_CANDIDAT",
                tier: "PRIMARY",
                url: edition.documentUrl,
                page: finalizedProposal.page === null ? null : String(finalizedProposal.page),
                publishedAt: edition.publishedAt,
              },
            ],
          });
          report.database.draftsCreated += 1;
          candidate.draftsAdded += 1;
        }
      }
      candidate.status = candidateReviewStatus(candidate, options.apply ? "apply" : "dry-run");
      options.onProgress?.({
        type: "document-complete",
        documentIndex,
        documentTotal,
        durationMs: Date.now() - startedAt,
        proposalsDetected: proposals.length,
      });
    } catch (error) {
      report.documents.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      candidate.errors.push(message);
      candidate.status = "IMPORT_ERROR";
      options.onProgress?.({
        type: "document-error",
        documentIndex,
        documentTotal,
        durationMs: Date.now() - startedAt,
        message,
      });
    }
  }

  report.candidates = [...reports.entries()].map(([reportKey, candidate]) => {
    const provenance = provenanceCounts.get(reportKey) ?? { primary: 0, total: 0 };
    return {
      ...candidate,
      primaryShare: calculatePrimaryShare(provenance.primary, provenance.total),
      themes: [...new Set(candidate.themes)],
      status:
        candidate.errors.length === 0
          ? candidate.status
          : candidate.documentsAnalyzed > 0
            ? "PARTIAL"
            : "IMPORT_ERROR",
    };
  });
  const reportDir = options.reportDir ?? ".tmp/program-import/reports";
  await writeProgramImportReport(report, reportDir);
  return report;
}

export async function writeProgramImportReport(
  report: ProgramImportReport,
  reportDir = ".tmp/program-import/reports"
): Promise<void> {
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    path.join(reportDir, "presidentielle-2027-program-import.json"),
    JSON.stringify(report, null, 2)
  );
  await writeFile(
    path.join(reportDir, "presidentielle-2027-program-import.md"),
    renderMarkdownReport(report)
  );
}

export async function reconcileProgramImportReportFile(
  reportPath: string
): Promise<ProgramImportReport> {
  const report = canonicalizeProgramImportReport(
    JSON.parse(await readFile(reportPath, "utf8")) as ProgramImportReport
  );
  await writeProgramImportReport(report, path.dirname(reportPath));
  return report;
}

export function renderMarkdownReport(report: ProgramImportReport): string {
  const rows = report.candidates
    .map(
      (c) =>
        `| ${c.candidate} | ${c.documentsAnalyzed} | ${c.detected} | ${c.proposals.filter((proposal) => proposal.accepted).length} | ${c.draftsAdded} | ${c.primaryShare === null ? "-" : `${c.primaryShare} %`} | ${c.themes.join(", ") || "-"} | ${c.status} |`
    )
    .join("\n");
  const proposalDetails = report.candidates
    .filter((candidate) => candidate.proposals.length > 0)
    .map((candidate) => {
      const items = candidate.proposals
        .map(
          (proposal) =>
            `- ${proposal.accepted ? "RETENUE" : "ÉCARTÉE"} [${proposal.classification}, modèle ${proposal.modelClassification}, ${proposal.documentType}, confiance ${proposal.confidence}, page ${proposal.page ?? "HTML"}, segment ${proposal.segmentId}] [document](${proposal.documentUrl}) (édition ${proposal.programEditionId})\n  - Source: ${proposal.sourceText}\n  - Normalisation: ${proposal.normalizedText ?? "-"}\n  - Thème: ${proposal.theme ?? "-"}\n  - Provenance segment: ${proposal.segmentProvenance ?? "LEGACY_UNKNOWN"}\n  - Raison provenance: ${proposal.provenanceReason ?? "-"}\n  - Garde extraction: ${proposal.extractionGuard ?? "-"}\n  - Garde acceptation: ${proposal.acceptanceGuard ?? "-"}\n  - Fallback normalisation: ${proposal.normalizationFallback ?? "-"}\n  - Citation exacte utilisée: ${proposal.exactSourceFallback ? "oui" : "non"}\n  - Contexte historique: ${proposal.historicalContext ? "oui" : "non"}\n  - Raison: ${proposal.rationale}`
        )
        .join("\n");
      return `### ${candidate.candidate}\n\n${items}`;
    })
    .join("\n\n");
  return `# Import des programmes Présidentielle 2027\n\nGénéré le ${report.generatedAt}, mode ${report.mode}. Policy de décision: ${report.decisionPolicyVersion}.\n\n## Sémantique du statut\n\nREADY_FOR_REVIEW signifie uniquement qu’au moins une proposition est techniquement éligible à une revue humaine. Ce statut ne valide ni l’extraction, ni les mesures, ni leur publication.\n\n## Corpus\n\n- Documents connus: ${report.documents.known}\n- Documents parsés: ${report.documents.parsed}\n- Échecs: ${report.documents.failed}\n- Pages PDF suspectes ou corrompues: ${report.documents.suspectPages ?? 0}\n- Segments bloqués pour provenance: ${report.documents.blockedSegments ?? 0}\n\n## Extraction\n\n- Propositions détectées: ${report.propositions.detected}\n- Mesures: ${report.propositions.measures}\n- Objectifs: ${report.propositions.objectives}\n- Ambiguës: ${report.propositions.ambiguous}\n- Rejetées: ${report.propositions.rejected}\n- Doublons: ${report.propositions.duplicates}\n\n## Base\n\n- Brouillons créés: ${report.database.draftsCreated}\n- Déjà présents: ${report.database.alreadyPresent}\n- Mesures publiées inchangées: ${report.database.publishedUnchanged}\n\n## Couverture par candidature ou parti\n\n| Candidat ou parti | Documents | Détectées | Retenues | Drafts ajoutés | Part primaire | Thèmes | État |\n|---|---:|---:|---:|---:|---:|---|---|\n${rows}\n\n## Détail des propositions\n\n${proposalDetails || "Aucune proposition extraite."}\n`;
}
