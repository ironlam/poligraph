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

export type ProgramImportOptions = {
  apply: boolean;
  candidate?: string;
  party?: string;
  source?: string;
  limit?: number;
  forceRefetch?: boolean;
  reportDir?: string;
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
  primaryShare: number;
  themes: string[];
  proposals: Array<{
    sourceText: string;
    normalizedText: string | null;
    classification: ExtractedProposal["classification"];
    theme: string | null;
    confidence: number;
    page: number | null;
    rationale: string;
    accepted: boolean;
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
          primaryShare: 0,
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
      primaryShare: 100,
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

      const proposals: ExtractedProposal[] = [];
      for (const segment of chunkSegments(parsed.segments)) {
        proposals.push(...(await extractSegment(segment)));
      }
      candidate.detected += proposals.length;
      report.propositions.detected += proposals.length;
      const exactSeen = new Set<string>();
      for (const proposal of proposals) {
        if (proposal.classification === "MEASURE") report.propositions.measures += 1;
        else if (proposal.classification === "OBJECTIVE") report.propositions.objectives += 1;
        else if (proposal.classification === "AMBIGUOUS") report.propositions.ambiguous += 1;
        else report.propositions.rejected += 1;
        candidate.proposals.push({ ...proposal, accepted: isAcceptedProposal(proposal) });
        if (!isAcceptedProposal(proposal)) continue;
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
        if (options.apply) {
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
        candidate.draftsAdded > 0 || (!options.apply && candidate.detected > 0)
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
        `| ${c.candidate} | ${c.documentsAnalyzed} | ${c.detected} | ${c.draftsAdded} | ${c.themes.join(", ") || "-"} | ${c.status} |`
    )
    .join("\n");
  const proposalDetails = report.candidates
    .filter((candidate) => candidate.proposals.length > 0)
    .map((candidate) => {
      const items = candidate.proposals
        .map(
          (proposal) =>
            `- ${proposal.accepted ? "RETENUE" : "ÉCARTÉE"} [${proposal.classification}, confiance ${proposal.confidence}, page ${proposal.page ?? "HTML"}] ${proposal.normalizedText ?? proposal.sourceText}`
        )
        .join("\n");
      return `### ${candidate.candidate}\n\n${items}`;
    })
    .join("\n\n");
  return `# Import des programmes Présidentielle 2027\n\nGénéré le ${report.generatedAt}, mode ${report.mode}.\n\n## Corpus\n\n- Documents connus: ${report.documents.known}\n- Documents parsés: ${report.documents.parsed}\n- Échecs: ${report.documents.failed}\n\n## Extraction\n\n- Propositions détectées: ${report.propositions.detected}\n- Mesures: ${report.propositions.measures}\n- Objectifs: ${report.propositions.objectives}\n- Ambiguës: ${report.propositions.ambiguous}\n- Rejetées: ${report.propositions.rejected}\n- Doublons: ${report.propositions.duplicates}\n\n## Base\n\n- Brouillons créés: ${report.database.draftsCreated}\n- Déjà présents: ${report.database.alreadyPresent}\n- Mesures publiées inchangées: ${report.database.publishedUnchanged}\n\n## Couverture par candidature ou parti\n\n| Candidat ou parti | Documents | Détectées | Drafts ajoutés | Thèmes | État |\n|---|---:|---:|---:|---|---|\n${rows}\n\n## Détail des propositions\n\n${proposalDetails || "Aucune proposition extraite."}\n`;
}
