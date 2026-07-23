/**
 * Shared policy-title approval logic. Extracted verbatim from the admin server
 * action so BOTH the admin UI (`/admin/policy-titles/actions.ts`, which adds auth
 * + revalidatePath) and the daily cron (`autoApproveBatchEligible`) run the SAME
 * eligibility guard and persistence — never a second copy of the rules.
 *
 * This module is server-only but NOT a "use server" file: it exports sync helpers
 * and types, and is imported by both a server action and an Inngest function.
 */
import { db } from "@/lib/db";
import {
  approveGuard,
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
import type { Prisma, ScrutinPolicyTitle } from "@/generated/prisma";
import { POLICY_TITLE_CRON } from "@/config/policy-titles";

/** Actor attributed to cron-driven (automated) approvals, distinct from the
 *  admin UI's "admin" so the revision history shows which approvals were
 *  automated. */
export const CRON_ACTOR = "system:cron";

export interface ApprovalContext {
  row: ScrutinPolicyTitle;
  scrutin: {
    id: string;
    title: string;
    sourceUrl: string | null;
    amendmentLinks: { role: string; amendment: { id: string; number: string } }[];
  };
  blocks: SubstanceTextBlock[];
  currentInputHash: string;
  currentWarnings: GenerationWarning[];
  evidenceDrift: boolean;
}

export function asJson(value: unknown): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

/** Snapshot of the row as stored, for revision history. */
export function snapshot(row: ScrutinPolicyTitle): Prisma.InputJsonValue {
  return row as unknown as Prisma.InputJsonValue;
}

/**
 * Loads the row + scrutin and recomputes substance, input hash, validator
 * warnings and evidence drift FRESH. Never trusts the stored values: every
 * approval decision must reflect what the official text says today.
 */
export async function recomputeApprovalContext(scrutinId: string): Promise<ApprovalContext> {
  const policy = await db.scrutinPolicyTitle.findUnique({
    where: { scrutinId },
    include: {
      scrutin: {
        select: {
          id: true,
          title: true,
          sourceUrl: true,
          amendmentLinks: {
            select: { role: true, amendment: { select: { id: true, number: true } } },
          },
        },
      },
    },
  });

  if (!policy) throw new Error(`Aucun titre public pour le scrutin ${scrutinId}`);

  const { scrutin, ...row } = policy;

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
      row.proceduralLabel,
      resolved.blocks
    )
  );

  const evidenceQuotes = (row.evidenceQuotes ?? []) as unknown as EvidenceQuote[];
  const currentWarnings = computeCurrentWarnings(
    row.policyTitle,
    row.policySubtitle,
    evidenceQuotes,
    resolved.blocks,
    scrutin.title
  );
  const evidenceDrift = detectEvidenceDrift(evidenceQuotes, resolved.blocks);

  return {
    row: policy as ScrutinPolicyTitle,
    scrutin,
    blocks: resolved.blocks,
    currentInputHash,
    currentWarnings,
    evidenceDrift,
  };
}

/** True when the row is REJECTED and its most-recent revision is a rejection. */
export async function isRejectedNotRevised(row: ScrutinPolicyTitle): Promise<boolean> {
  if (row.status !== "REJECTED") return false;
  const latest = await db.scrutinPolicyTitleRevision.findFirst({
    where: { policyTitleId: row.id },
    orderBy: { createdAt: "desc" },
  });
  return latest?.action === "rejected";
}

/**
 * Batch eligibility for a PRE-RECOMPUTED context. Runs the batch-mode guard
 * (HIGH confidence, zero current warnings, no input/evidence drift,
 * non-empty/<=140 title, no validation blocker) plus two explicit checks batch
 * mode must never relax: zero generationWarnings and not a FALLBACK row. Returns
 * the failure reasons, or an empty array when batch-eligible.
 */
export async function evaluateBatchEligibility(ctx: ApprovalContext): Promise<string[]> {
  const { row, currentInputHash, currentWarnings, evidenceDrift } = ctx;
  const reasons: string[] = [];

  if (await isRejectedNotRevised(row)) {
    reasons.push("REJECTED_NOT_REVISED");
  }

  const generationWarnings = (row.generationWarnings ?? []) as unknown as GenerationWarning[];
  if (generationWarnings.length > 0) {
    reasons.push("GENERATION_WARNINGS");
  }
  if (row.generationSource === "FALLBACK") {
    reasons.push("FALLBACK_ROW");
  }

  const result = approveGuard({
    row,
    currentInputHash,
    currentWarnings,
    evidenceDrift,
    mode: "batch",
  });
  if (!result.ok) {
    for (const code of result.hardBlockers) reasons.push(code);
    if (result.hardBlockers.length === 0) reasons.push("NOT_BATCH_CLEAN");
  }

  return reasons;
}

export interface PersistApprovalOptions {
  /** Who is approving — "admin" for the UI, CRON_ACTOR for the cron. */
  actor: string;
  approvalOverride?: { reason: string; actor: string };
}

/** Persists APPROVED + the freshly recomputed hash/warnings + an "approved"
 *  revision. Only ever called after evaluateBatchEligibility/approveGuard pass. */
export async function persistApproval(
  ctx: ApprovalContext,
  { actor, approvalOverride }: PersistApprovalOptions
): Promise<void> {
  const { row, currentInputHash, currentWarnings } = ctx;
  const reviewedAt = new Date();

  await db.$transaction(async (tx) => {
    await tx.scrutinPolicyTitleRevision.create({
      data: {
        policyTitleId: row.id,
        snapshot: {
          ...(snapshot(row) as object),
          ...(approvalOverride ? { approvalOverride } : {}),
        } as Prisma.InputJsonValue,
        action: "approved",
        actorId: actor,
      },
    });
    await tx.scrutinPolicyTitle.update({
      where: { id: row.id },
      data: {
        status: "APPROVED",
        reviewedAt,
        reviewedBy: actor,
        inputHash: currentInputHash,
        currentWarnings: asJson(currentWarnings),
      },
    });
  });
}

export interface AutoApproveOptions {
  /** Max DRAFT rows evaluated. Defaults to POLICY_TITLE_CRON.approveLimit. */
  limit?: number;
  /** Only approve titles at least this old. Defaults to approveMinAgeHours. */
  minAgeHours?: number;
  /** Approval actor. Defaults to CRON_ACTOR. */
  actor?: string;
  /** Restrict the scan to these scrutins. Omit to scan the whole eligible set
   *  (the cron does); tests pass their seeded ids to stay scoped. */
  scrutinIds?: string[];
}

export interface AutoApproveStats {
  scanned: number;
  approved: number;
  skipped: number;
  byReason: Record<string, number>;
  durationMs: number;
}

/**
 * Cron auto-approval. DELIBERATELY stricter than the manual batchApprove: it only
 * considers DRAFT rows (NEEDS_REVIEW stays for human review even when HIGH), that
 * are HIGH-confidence, non-FALLBACK, and at least `minAgeHours` old (a veto
 * window). Each candidate is recomputed and run through the SAME shared
 * `evaluateBatchEligibility` guard; only rows with zero failure reasons are
 * approved. Never does a blunt UPDATE; never revalidates (public pages are ISR).
 */
export async function autoApproveBatchEligible(
  opts: AutoApproveOptions = {}
): Promise<AutoApproveStats> {
  const startedAt = Date.now();
  const limit = opts.limit ?? POLICY_TITLE_CRON.approveLimit;
  const minAgeHours = opts.minAgeHours ?? POLICY_TITLE_CRON.approveMinAgeHours;
  const actor = opts.actor ?? CRON_ACTOR;
  const cutoff = new Date(startedAt - minAgeHours * 60 * 60 * 1000);

  const candidates = await db.scrutinPolicyTitle.findMany({
    where: {
      status: "DRAFT",
      confidence: "HIGH",
      generationSource: { not: "FALLBACK" },
      generatedAt: { lte: cutoff },
      ...(opts.scrutinIds ? { scrutinId: { in: opts.scrutinIds } } : {}),
    },
    select: { scrutinId: true },
    orderBy: { generatedAt: "asc" },
    take: limit,
  });

  const stats: AutoApproveStats = {
    scanned: candidates.length,
    approved: 0,
    skipped: 0,
    byReason: {},
    durationMs: 0,
  };

  for (const { scrutinId } of candidates) {
    const ctx = await recomputeApprovalContext(scrutinId);
    const reasons = await evaluateBatchEligibility(ctx);
    if (reasons.length === 0) {
      await persistApproval(ctx, { actor });
      stats.approved++;
    } else {
      stats.skipped++;
      for (const r of reasons) stats.byReason[r] = (stats.byReason[r] ?? 0) + 1;
    }
  }

  stats.durationMs = Date.now() - startedAt;
  return stats;
}
