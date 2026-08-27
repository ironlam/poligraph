import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { parsePagination } from "@/lib/api/pagination";
import {
  summarizeProposalOfficialEvidence,
  summarizeProposalSourceLink,
} from "@/lib/affairs/official-decision-verification";
import type { Prisma, ProposalStatus, SourceType } from "@/generated/prisma";
import { parseAffairProposalPayload } from "@/lib/security/schemas/affair-proposal";
import { parseAffairEventProposalContext } from "@/services/affairs/proposals";

// Affaires v2, lot 1: review queue for importer-proposed affair changes.

const PAGE_SIZE = 20;

const VALID_STATUSES: ProposalStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "AUTO_APPLIED",
  "CONFLICT",
];

function parseStatus(raw: string | null): ProposalStatus {
  return VALID_STATUSES.includes(raw as ProposalStatus) ? (raw as ProposalStatus) : "PENDING";
}

function proposalPresentation(row: {
  affair: { id: string; publicationStatus: string } | null;
  proposedPatch: unknown;
  observedValues: unknown;
  metadata: unknown;
  source: SourceType;
  sourceUrl: string | null;
  sourceExcerpt: string | null;
}) {
  try {
    const parsed = parseAffairProposalPayload(row.proposedPatch);
    if (parsed.kind === "PATCH") {
      const issues = row.affair ? [] : ["L’affaire cible a été supprimée"];
      return {
        payloadKind: "PATCH" as const,
        eventPreview: null,
        acceptanceEligible: issues.length === 0,
        validationIssues: issues,
      };
    }
    if (!row.affair) throw new Error("L’affaire cible a été supprimée");
    if (!new Set(["DRAFT", "PUBLISHED"]).has(row.affair.publicationStatus)) {
      throw new Error(`Le statut ${row.affair.publicationStatus} interdit l’ajout d’un événement`);
    }
    const context = parseAffairEventProposalContext({
      affairId: row.affair.id,
      proposedPatch: row.proposedPatch,
      observedValues: row.observedValues,
      metadata: row.metadata,
      source: row.source,
      sourceUrl: row.sourceUrl,
      sourceExcerpt: row.sourceExcerpt,
    });
    return {
      payloadKind: "ADD_EVENT" as const,
      acceptanceEligible: true,
      validationIssues: [],
      eventPreview: {
        date: context.event.date.toISOString(),
        type: context.event.type,
        title: context.event.title,
        description: context.event.description ?? null,
        sourceUrl: context.event.sourceUrl,
        sourceTitle: context.event.sourceTitle,
        identityKey: context.identityKey,
        publisher: context.metadata.eventProposal.publisher,
      },
    };
  } catch (error) {
    return {
      payloadKind: "INVALID" as const,
      eventPreview: null,
      acceptanceEligible: false,
      validationIssues: [error instanceof Error ? error.message : "Proposition invalide"],
    };
  }
}

export const GET = withAdminAuth(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const status = parseStatus(params.get("status"));
  const importer = params.get("importer");
  const { page, skip } = parsePagination(params, {
    defaultLimit: PAGE_SIZE,
    maxLimit: PAGE_SIZE,
  });

  const where: Prisma.AffairUpdateProposalWhereInput = {
    status,
    ...(importer ? { importer } : {}),
  };

  const [rows, total, statusCounts] = await Promise.all([
    db.affairUpdateProposal.findMany({
      where,
      // riskLevel is declared LOW, MEDIUM, HIGH, so "desc" surfaces HIGH first.
      orderBy: [{ riskLevel: "desc" }, { createdAt: "desc" }],
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        importer: true,
        extractorVersion: true,
        proposedPatch: true,
        observedValues: true,
        // Read when the affair was deleted: the relation is null, the snapshot
        // is what keeps the row readable.
        affairSnapshot: true,
        source: true,
        sourceUrl: true,
        officialId: true,
        sourceContentHash: true,
        sourceExcerpt: true,
        metadata: true,
        confidence: true,
        riskLevel: true,
        rationale: true,
        status: true,
        conflictDetail: true,
        reviewedAt: true,
        reviewedBy: true,
        reviewNotes: true,
        createdAt: true,
        affair: {
          select: {
            id: true,
            title: true,
            slug: true,
            publicationStatus: true,
            politician: { select: { fullName: true, slug: true } },
          },
        },
      },
    }),
    db.affairUpdateProposal.count({ where }),
    db.affairUpdateProposal.groupBy({ by: ["status"], _count: true }),
  ]);

  return NextResponse.json({
    rows: rows.map(({ metadata, ...row }) => {
      const officialEvidence = summarizeProposalOfficialEvidence({
        source: row.source,
        sourceUrl: row.sourceUrl,
        officialId: row.officialId,
        metadata,
      });
      const sourceLink = officialEvidence.required
        ? { rawUrl: row.sourceUrl, safeUrl: null }
        : summarizeProposalSourceLink(row.sourceUrl);

      return {
        ...row,
        ...proposalPresentation({ ...row, metadata }),
        officialEvidence,
        sourceLink,
      };
    }),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts: Object.fromEntries(statusCounts.map((c) => [c.status, c._count])),
  });
});
