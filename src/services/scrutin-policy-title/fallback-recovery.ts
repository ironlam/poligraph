/**
 * Recovery of the policy titles left in FALLBACK while the Mistral alias returned
 * an unreadable reasoning payload (2026-11-12 to 2026-11-17, fixed by #1354).
 * Those rows are never picked up again by the daily run, which only selects
 * scrutins without a row. Their titles are written in session (no model call) and
 * applied through the approval guard by `scripts/judge-policy-titles.ts`.
 *
 * Pure helpers only: selection predicate and the shape check of a hand-written
 * title. Every DB write stays in the script, behind the guard.
 */
import type { EvidenceQuote, GenerationWarning, SubstanceTextBlock } from "./types";
import { computeCurrentWarnings } from "@/app/admin/policy-titles/approve-guard";

/** Generation window of the incident, UTC, end exclusive. */
export const LLM_OUTAGE_WINDOW = {
  from: new Date("2026-11-12T00:00:00.000Z"),
  to: new Date("2026-11-18T00:00:00.000Z"),
} as const;

export const POLICY_TITLE_MAX_LENGTH = 140;

export interface FallbackRowShape {
  status: string;
  generationSource: string;
  policyTitle: string | null;
  generatedAt: Date;
  generationWarnings: unknown;
}

function hasWarningCode(warnings: unknown, code: string): boolean {
  return (
    Array.isArray(warnings) &&
    warnings.some(
      (w) => typeof w === "object" && w !== null && (w as { code?: unknown }).code === code
    )
  );
}

/**
 * A row left in fallback by the outage: still waiting for review, no title, and
 * the invalid-output warning that marks the model failure. Older fallback rows
 * (no official substance) have another cause and stay out of scope.
 */
export function isOutageFallbackRow(
  row: FallbackRowShape,
  window: { from: Date; to: Date } = LLM_OUTAGE_WINDOW
): boolean {
  return (
    row.status === "NEEDS_REVIEW" &&
    row.generationSource === "FALLBACK" &&
    row.policyTitle === null &&
    row.generatedAt >= window.from &&
    row.generatedAt < window.to &&
    hasWarningCode(row.generationWarnings, "LLM_OUTPUT_INVALID")
  );
}

export interface ManualTitleInput {
  title: string | undefined;
  subtitle?: string | undefined;
  evidenceQuotes?: EvidenceQuote[] | undefined;
}

export type ManualTitleCheck =
  | {
      ok: true;
      title: string;
      subtitle: string | null;
      evidenceQuotes: EvidenceQuote[];
      warnings: GenerationWarning[];
    }
  | { ok: false; reason: string; warnings: GenerationWarning[] };

/**
 * Checks a hand-written title against the same validators the generator runs,
 * with the quotes the writer supplied. A fallback row has no stored quotes, so
 * without them EVIDENCE_GROUNDING blocks: the quotes are the grounding, never a
 * way around the guard. Returns the blockers instead of throwing so a dry run can
 * report every row.
 */
export function checkManualTitle(
  input: ManualTitleInput,
  blocks: SubstanceTextBlock[],
  officialTitle: string
): ManualTitleCheck {
  const title = (input.title ?? "").trim();
  if (!title) return { ok: false, reason: "EMPTY_TITLE", warnings: [] };
  if (title.length > POLICY_TITLE_MAX_LENGTH) {
    return { ok: false, reason: "OVER_LENGTH", warnings: [] };
  }
  const subtitle = (input.subtitle ?? "").trim() || null;
  const evidenceQuotes = input.evidenceQuotes ?? [];
  const warnings = computeCurrentWarnings(title, subtitle, evidenceQuotes, blocks, officialTitle);
  const blockers = warnings.filter((w) => w.severity === "blocker");
  if (blockers.length > 0) {
    return { ok: false, reason: blockers.map((w) => w.code).join("+"), warnings };
  }
  return { ok: true, title, subtitle, evidenceQuotes, warnings };
}
