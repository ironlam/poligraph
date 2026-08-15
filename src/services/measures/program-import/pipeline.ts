import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { assertHubMeasureCandidacy } from "@/app/admin/mesures/_data/candidacy-eligibility";
import { createMeasure } from "@/lib/measures/transitions";
import { acquireDocument } from "./acquisition";
import { jaccardSimilarity, normalizeForDeduplication } from "./deduplication";
import { extractSegment, EXTRACTOR_VERSION } from "./extractor";
import { parseDocument } from "./parser";
import { classifyEdition, isAcceptedProposal } from "./policy";
import type { DocumentSegment, ExtractedProposal, ProgramDocumentType } from "./types";

const PRIMARY_SHARE_UNAVAILABLE_REASON =
  "ProgramEdition ne distingue pas encore explicitement source primaire et source secondaire.";

export type ProgramImportProgressEvent =
  | {
      kind: "document";
      editionId: string;
      label: string;
      documentUrl: string;
      segmentsTotal: number;
    }
  | {
      kind: "extraction";
      editionId: string;
      label: string;
      completed: number;
      total: number;
      proposals: number;
      failed: number;
    };

export type ProgramImportOptions = {
  apply: boolean;
  candidate?: string;
  party?: string;
  source?: string;
  limit?: number;
  forceRefetch?: boolean;
  reportDir?: string;
  segmentConcurrency?: number;
  onProgress?: (event: ProgramImportProgressEvent) => void;
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
  primaryShare: number | null;
  primaryShareReason: string;
  themes: string[];
  proposals: Array<{
    editionId: string;
    documentUrl: string;
    sourceText: string;
    normalizedText: string | null;
    classification: ExtractedProposal["classification"];
    theme: string | null;
    confidence: number;
    page: number | null;
    rationale: string;
    accepted: boolean;
    warnings: string[];
    normalization: ExtractedProposal["normalization"];
    provenance: {
      ownerType: "PARTY" | "CANDIDACY";
      ownerId: string | null;
      documentType: ProgramDocumentType;
      segmentId: string;
    };
  }>;
  errors: string[];
  blockers: string[];
  status:
    | "READY_FOR_REVIEW"
    | "PARTIAL"
    | "NO_ATTRIBUTABLE_PROGRAM"
    | "SOURCE_MISSING"
    | "IMPORT_ERROR";
};

export type ProgramImportReport = {
  generatedAt: string;
  mode: "dry-run" | "apply";
  documents: { known: number; fetched: number; parsed: number; failed: number; scannedPdf: number };
  extraction: {
    segmentsTotal: number;
    segmentsSucceeded: number;
    segmentsFailed: number;
    normalizationFallbacks: number;
    invalidThemes: number;
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

function chunkSegments(segments: DocumentSegment[], maxCharacters = 7_000): DocumentSegment[] {
  const chunks: DocumentSegment[] = [];
  for (const segment of segments) {
    const previous = chunks.at(-1);
    if (
      previous &&
      previous.page === segment.page &&
      previous.text.length + segment.text.length < maxCharacters
    ) {
      previous.text += `\n\n${segment.text}`;
    } else {
      chunks.push({ ...segment });
    }
  }
  return chunks;
}

function normalizeConcurrency(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 3;
  return Math.min(8, Math.max(1, Math.trunc(value)));
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
    documents: { known: editions.length, fetched: 0, parsed: 0, failed: 0, scannedPdf: 0 },
    extraction: {
      segmentsTotal: 0,
      segmentsSucceeded: 0,
      segmentsFailed: 0,
      normalizationFallbacks: 0,
      invalidThemes: 0,
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
          primaryShareReason: PRIMARY_SHARE_UNAVAILABLE_REASON,
          themes: [],
          proposals: [],
          errors: [],
          blockers: eligible
            ? []
            : ["Candidature non éligible: elle doit être DECLARE et sourcée."],
          status: eligible ? "SOURCE_MISSING" : "NO_ATTRIBUTABLE_PROGRAM",
        },
      ];
    })
  );
  const segmentConcurrency = normalizeConcurrency(options.segmentConcurrency);

  for (const edition of editions) {
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
      primaryShareReason: PRIMARY_SHARE_UNAVAILABLE_REASON,
      themes: [],
      proposals: [],
      errors: [],
      blockers: [],
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

      const chunks = chunkSegments(parsed.segments);
      report.extraction.segmentsTotal += chunks.length;
      options.onProgress?.({
        kind: "document",
        editionId: edition.id,
        label: edition.label,
        documentUrl: edition.documentUrl,
        segmentsTotal: chunks.length,
      });

      const proposals: ExtractedProposal[] = [];
      let segmentFailures = 0;
      let completedSegments = 0;
      for (let start = 0; start < chunks.length; start += segmentConcurrency) {
        const batch = chunks.slice(start, start + segmentConcurrency);
        const results = await Promise.allSettled(batch.map((segment) => extractSegment(segment)));
        for (let index = 0; index < results.length; index += 1) {
          const result = results[index];
          const segment = batch[index];
          completedSegments += 1;
          if (result.status === "fulfilled") {
            proposals.push(...result.value);
            report.extraction.segmentsSucceeded += 1;
          } else {
            segmentFailures += 1;
            report.extraction.segmentsFailed += 1;
            candidate.errors.push(
              `Échec d'extraction du segment ${segment.id} (page ${segment.page ?? "HTML"}): ${
                result.reason instanceof Error ? result.reason.message : String(result.reason)
              }`
            );
          }
        }
        options.onProgress?.({
          kind: "extraction",
          editionId: edition.id,
          label: edition.label,
          completed: completedSegments,
          total: chunks.length,
          proposals: proposals.length,
          failed: segmentFailures,
        });
      }

      if (segmentFailures > 0) {
        candidate.blockers.push(
          `Extraction partielle: ${segmentFailures}/${chunks.length} segment(s) en échec.`
        );
        if (options.apply) {
          candidate.blockers.push(
            "Application bloquée pour cette édition tant que tous les segments ne sont pas extraits avec succès."
          );
        }
      }

      candidate.detected += proposals.length;
      report.propositions.detected += proposals.length;
      const exactSeen = new Set<string>();
      let acceptedInEdition = 0;
      for (const proposal of proposals) {
        if (proposal.classification === "MEASURE") report.propositions.measures += 1;
        else if (proposal.classification === "OBJECTIVE") report.propositions.objectives += 1;
        else if (proposal.classification === "AMBIGUOUS") report.propositions.ambiguous += 1;
        else report.propositions.rejected += 1;
        report.extraction.normalizationFallbacks += Number(
          proposal.normalization === "SOURCE_FALLBACK"
        );
        report.extraction.invalidThemes += Number(
          proposal.warnings.some((warning) => warning.startsWith("Thème hors enum"))
        );
        const accepted = isAcceptedProposal(proposal);
        candidate.proposals.push({
          editionId: edition.id,
          documentUrl: edition.documentUrl,
          sourceText: proposal.sourceText,
          normalizedText: proposal.normalizedText,
          classification: proposal.classification,
          theme: proposal.theme,
          confidence: proposal.confidence,
          page: proposal.page,
          rationale: proposal.rationale,
          accepted,
          warnings: proposal.warnings,
          normalization: proposal.normalization,
          provenance: {
            ownerType: edition.ownerType,
            ownerId: edition.candidacyId ?? edition.partyId,
            documentType,
            segmentId: proposal.segmentId,
          },
        });
        if (!accepted) continue;
        acceptedInEdition += 1;
        const text = proposal.normalizedText!;
        const exact = normalizeForDeduplication(text);
        if (exactSeen.has(exact)) {
          report.propositions.duplicates += 1;
          continue;
        }
        exactSeen.add(exact);

        const existing = await db.measure.findMany({
          where: { candidacyId: edition.candidacyId, theme: proposal.theme! },
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

        candidate.themes.push(proposal.theme!);
        if (options.apply && segmentFailures === 0) {
          await createMeasure({
            politicianId: eligible.politicianId,
            electionId: eligible.electionId,
            candidacyId: edition.candidacyId,
            programEditionId: edition.id,
            attribution: "PERSONAL",
            theme: proposal.theme!,
            precedingMeasureId: null,
            revision: {
              text,
              precision: proposal.classification === "OBJECTIVE" ? "OBJECTIF_SANS_CHIFFRE" : null,
              validFrom: edition.publishedAt,
              extractionMethod: "AI_ASSISTED",
              extractionConfidence: proposal.confidence,
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
                page: proposal.page === null ? null : String(proposal.page),
                publishedAt: edition.publishedAt,
              },
            ],
          });
          report.database.draftsCreated += 1;
          candidate.draftsAdded += 1;
        }
      }
      candidate.status =
        segmentFailures > 0
          ? "PARTIAL"
          : acceptedInEdition > 0
            ? "READY_FOR_REVIEW"
            : "PARTIAL";
    } catch (error) {
      report.documents.failed += 1;
      candidate.errors.push(error instanceof Error ? error.message : String(error));
      candidate.status = "IMPORT_ERROR";
    }
  }

  report.candidates = [...reports.values()].map((candidate) => ({
    ...candidate,
    themes: [...new Set(candidate.themes)],
  }));
  const reportDir = options.reportDir ?? ".tmp/program-import/reports";
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    path.join(reportDir, "presidentielle-2027-program-import.json"),
    JSON.stringify(report, null, 2)
  );
  await writeFile(
    path.join(reportDir, "presidentielle-2027-program-import.md"),
    renderMarkdownReport(report)
  );
  return report;
}

export function renderMarkdownReport(report: ProgramImportReport): string {
  const rows = report.candidates
    .map(
      (c) =>
        `| ${c.candidate} | ${c.documentsAnalyzed} | ${c.detected} | ${c.draftsAdded} | ${
          c.primaryShare === null ? "n/a" : `${c.primaryShare.toFixed(1)} %`
        } | ${c.themes.join(", ") || "-"} | ${c.status} |`
    )
    .join("\n");
  const proposalDetails = report.candidates
    .filter((candidate) => candidate.proposals.length > 0)
    .map((candidate) => {
      const items = candidate.proposals
        .map((proposal) => {
          const warnings =
            proposal.warnings.length > 0
              ? `\n  - Avertissements: ${proposal.warnings.join(" | ")}`
              : "";
          return `- ${proposal.accepted ? "RETENUE" : "ÉCARTÉE"} [${proposal.classification}, confiance ${proposal.confidence}, page ${proposal.page ?? "HTML"}] ${proposal.normalizedText ?? proposal.sourceText}\n  - Édition: ${proposal.editionId}\n  - Document: ${proposal.documentUrl}\n  - Segment: ${proposal.provenance.segmentId}\n  - Normalisation: ${proposal.normalization}${warnings}`;
        })
        .join("\n");
      return `### ${candidate.candidate}\n\n${items}`;
    })
    .join("\n\n");
  return `# Import des programmes Présidentielle 2027\n\nGénéré le ${report.generatedAt}, mode ${report.mode}.\n\n## Corpus\n\n- Documents connus: ${report.documents.known}\n- Documents parsés: ${report.documents.parsed}\n- Échecs documentaires: ${report.documents.failed}\n- Part de sources primaires: non calculable avec le schéma ProgramEdition actuel.\n\n## Extraction\n\n- Segments: ${report.extraction.segmentsSucceeded}/${report.extraction.segmentsTotal} réussis\n- Segments en échec: ${report.extraction.segmentsFailed}\n- Propositions détectées: ${report.propositions.detected}\n- Mesures: ${report.propositions.measures}\n- Objectifs: ${report.propositions.objectives}\n- Ambiguës: ${report.propositions.ambiguous}\n- Rejetées: ${report.propositions.rejected}\n- Fallbacks vers citation exacte: ${report.extraction.normalizationFallbacks}\n- Thèmes hors enum neutralisés: ${report.extraction.invalidThemes}\n- Doublons: ${report.propositions.duplicates}\n\n## Base\n\n- Brouillons créés: ${report.database.draftsCreated}\n- Déjà présents: ${report.database.alreadyPresent}\n- Mesures publiées inchangées: ${report.database.publishedUnchanged}\n\n## Couverture par candidature ou parti\n\n| Candidat ou parti | Documents | Détectées | Drafts ajoutés | Sources primaires | Thèmes | État |\n|---|---:|---:|---:|---:|---|---|\n${rows}\n\n_n/a : ${PRIMARY_SHARE_UNAVAILABLE_REASON}_\n\n## Détail des propositions\n\n${proposalDetails || "Aucune proposition extraite."}\n`;
}
