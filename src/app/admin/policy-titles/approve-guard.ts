import { runValidators, quoteAppearsInText } from "@/services/scrutin-policy-title/validators";
import type {
  EvidenceQuote,
  GenerationWarning,
  SubstanceTextBlock,
} from "@/services/scrutin-policy-title/types";

export type HardBlocker =
  | "EMPTY_OR_NULL_TITLE"
  | "OVER_LENGTH"
  | "STALE"
  | "INPUT_DRIFT"
  | "EVIDENCE_DRIFT"
  | "VALIDATION_BLOCKER";

export interface ApproveContext {
  row: { policyTitle: string | null; status: string; confidence: string; inputHash: string };
  currentInputHash: string;
  currentWarnings: GenerationWarning[];
  evidenceDrift: boolean;
  mode: "single" | "batch";
  override?: { reason: string; actor: string };
}

export type ApproveGuardResult =
  | { ok: true }
  | { ok: false; hardBlockers: HardBlocker[]; overridableWarnings: GenerationWarning[] };

/**
 * Single source of truth for whether a policy-title row may transition to
 * APPROVED. Pure function. Hard blockers are never overridable (empty/over-length
 * title, stale row, input/evidence drift, validation blocker). In single mode a
 * `warn` may be overridden with a reason; in batch mode no override path exists
 * and only HIGH-confidence, warning-free rows pass.
 */
export function approveGuard(ctx: ApproveContext): ApproveGuardResult {
  const hard: HardBlocker[] = [];
  const title = ctx.row.policyTitle?.trim();
  if (!title) hard.push("EMPTY_OR_NULL_TITLE");
  if ((ctx.row.policyTitle?.length ?? 0) > 140) hard.push("OVER_LENGTH");
  if (ctx.row.status === "STALE") hard.push("STALE");
  if (ctx.currentInputHash !== ctx.row.inputHash) hard.push("INPUT_DRIFT");
  if (ctx.evidenceDrift) hard.push("EVIDENCE_DRIFT");
  if (ctx.currentWarnings.some((w) => w.severity === "blocker")) hard.push("VALIDATION_BLOCKER");
  if (hard.length > 0) return { ok: false, hardBlockers: hard, overridableWarnings: [] };

  const warns = ctx.currentWarnings.filter((w) => w.severity === "warn");
  if (ctx.mode === "batch") {
    if (warns.length > 0 || ctx.row.confidence !== "HIGH") {
      return { ok: false, hardBlockers: [], overridableWarnings: warns };
    }
    return { ok: true };
  }
  if (warns.length > 0 && !ctx.override) {
    return { ok: false, hardBlockers: [], overridableWarnings: warns };
  }
  return { ok: true };
}

/**
 * Re-runs the rule-based validators against the CURRENT title and grounding
 * evidence. Used to detect drift between a stored row's warnings and what the
 * validators say today. `runValidators` requires a non-null title; a null title
 * is a hard blocker handled by `approveGuard` directly, so coerce to "".
 */
export function computeCurrentWarnings(
  policyTitle: string | null,
  policySubtitle: string | null,
  evidenceQuotes: EvidenceQuote[],
  blocks: SubstanceTextBlock[],
  officialTitle?: string
): GenerationWarning[] {
  return runValidators({
    policyTitle: policyTitle ?? "",
    policySubtitle,
    evidenceQuotes,
    blocks,
    officialTitle,
  });
}

/**
 * Evidence drift: true when any stored quote can no longer be grounded in the
 * current blocks, either because its (sourceType, sourceId, field) tuple is gone
 * or because the quote text no longer appears in the matching block.
 */
export function detectEvidenceDrift(
  evidenceQuotes: EvidenceQuote[],
  blocks: SubstanceTextBlock[]
): boolean {
  return evidenceQuotes.some((q) => {
    const block = blocks.find(
      (b) => b.sourceId === q.sourceId && b.field === q.field && b.sourceType === q.sourceType
    );
    return !block || !quoteAppearsInText(q.quote, block.text);
  });
}
