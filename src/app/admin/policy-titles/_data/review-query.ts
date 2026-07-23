import { db } from "@/lib/db";
import {
  computeCurrentWarnings,
  detectEvidenceDrift,
} from "@/app/admin/policy-titles/approve-guard";
import { buildInputHashInput } from "@/services/scrutin-policy-title";
import { computeInputHash } from "@/services/scrutin-policy-title/input-hash";
import { resolveSubstanceSources } from "@/services/scrutin-policy-title/substance-resolver";
import type {
  EvidenceQuote,
  GenerationWarning,
  SubstanceTextBlock,
} from "@/services/scrutin-policy-title/types";
import type { ScrutinPolicyTitle, ScrutinPolicyTitleRevision } from "@/generated/prisma";

export interface ReviewScrutin {
  id: string;
  externalId: string;
  title: string;
  sourceUrl: string | null;
  votingDate: Date;
  result: string;
  chamber: string;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  proceduralLabel: string;
}

export interface ReviewAmendmentLink {
  role: string;
  number: string;
  amendmentId: string;
}

export interface ReviewData {
  scrutin: ReviewScrutin;
  policy: ScrutinPolicyTitle;
  amendmentLinks: ReviewAmendmentLink[];
  blocks: SubstanceTextBlock[];
  currentInputHash: string;
  currentWarnings: GenerationWarning[];
  evidenceDrift: boolean;
  inputDrift: boolean;
  revisions: ScrutinPolicyTitleRevision[];
}

/**
 * Loads everything the per-row review page needs, with a FRESH recomputation of
 * substance, input hash, validator warnings and drift flags. The stored row is
 * never trusted for these: the reviewer must see what the official text says
 * TODAY, not what it said at generation time. Returns null when the scrutin has
 * no policy-title row.
 */
export async function loadReview(scrutinId: string): Promise<ReviewData | null> {
  const policy = await db.scrutinPolicyTitle.findUnique({
    where: { scrutinId },
    include: {
      scrutin: {
        select: {
          id: true,
          externalId: true,
          title: true,
          sourceUrl: true,
          votingDate: true,
          result: true,
          chamber: true,
          votesFor: true,
          votesAgainst: true,
          votesAbstain: true,
          amendmentLinks: {
            select: {
              role: true,
              amendment: { select: { id: true, number: true } },
            },
          },
        },
      },
      history: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!policy) return null;

  const { scrutin, history, ...policyRow } = policy;

  const amendmentLinks: ReviewAmendmentLink[] = scrutin.amendmentLinks.map((l) => ({
    role: l.role,
    number: l.amendment.number,
    amendmentId: l.amendment.id,
  }));

  // Fresh substance + recomputed hash from the row's stored procedural label.
  const resolved = await resolveSubstanceSources(scrutinId);
  const currentInputHash = computeInputHash(
    buildInputHashInput(
      {
        title: scrutin.title,
        sourceUrl: scrutin.sourceUrl,
        amendmentLinks: scrutin.amendmentLinks.map((l) => ({
          role: l.role,
          amendment: { id: l.amendment.id, number: l.amendment.number },
        })),
      },
      policyRow.proceduralLabel,
      resolved.blocks
    )
  );

  const evidenceQuotes = (policyRow.evidenceQuotes ?? []) as unknown as EvidenceQuote[];

  const currentWarnings = computeCurrentWarnings(
    policyRow.policyTitle,
    policyRow.policySubtitle,
    evidenceQuotes,
    resolved.blocks,
    scrutin.title
  );
  const evidenceDrift = detectEvidenceDrift(evidenceQuotes, resolved.blocks);
  const inputDrift = currentInputHash !== policyRow.inputHash;

  return {
    scrutin: {
      id: scrutin.id,
      externalId: scrutin.externalId,
      title: scrutin.title,
      sourceUrl: scrutin.sourceUrl,
      votingDate: scrutin.votingDate,
      result: scrutin.result,
      chamber: scrutin.chamber,
      votesFor: scrutin.votesFor,
      votesAgainst: scrutin.votesAgainst,
      votesAbstain: scrutin.votesAbstain,
      proceduralLabel: policyRow.proceduralLabel,
    },
    policy: policy as ScrutinPolicyTitle,
    amendmentLinks,
    blocks: resolved.blocks,
    currentInputHash,
    currentWarnings,
    evidenceDrift,
    inputDrift,
    revisions: history,
  };
}
