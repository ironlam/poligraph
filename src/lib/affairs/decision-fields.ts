/**
 * Dual read of the identifiers that moved to `CourtDecision` (#536).
 *
 * During the transition an affair may carry a historical value, be linked to a
 * decision that carries it, or both. This module decides which one a flat field
 * shows, and refuses to invent one when the answer is genuinely plural.
 *
 * Two fields are deliberately absent: `court` and `verdictDate` stay editorial and
 * are always read from `Affair`. Measured on the base, 23.7 % of `Affair.court`
 * values name a body that renders no decision, and 4 affairs carry a verdict date
 * while no decision has been handed down — so neither is a decision attribute.
 *
 * `caseNumber` and `caseNumbers` are absent too: they were deferred from the model,
 * so there is nothing to fall back to and they always come from the affair.
 */

/** Where a displayed value came from, so a caller can label or debug it. */
export type DecisionFieldSource = "affair" | "decision" | "ambiguous" | "absent";

export interface ResolvedDecisionField<T> {
  value: T | null;
  source: DecisionFieldSource;
}

/** The subset of a decision this resolver reads. */
export interface DecisionFieldCarrier {
  ecli?: string | null;
  pourvoiNumber?: string | null;
  chamber?: string | null;
}

/**
 * Picks the value a flat field should show.
 *
 * Order, and the reasoning behind it:
 *
 * 1. **The affair's own value wins.** It was written or validated by moderation, so
 *    it is the editorial record and must not be overridden by a backfill.
 * 2. **One linked decision** and the affair says nothing: the decision's value fills
 *    the gap.
 * 3. **Several linked decisions**: no flat value at all. Choosing would mean picking
 *    one decision over another, and "the most recent" is the wrong default — on an
 *    affair covering first instance, appeal then cassation, the most recent is often
 *    a procedural rejection rather than the outcome a reader is looking for. The
 *    caller shows the list instead.
 */
export function resolveDecisionField<T>(
  affairValue: T | null | undefined,
  decisionValues: Array<T | null | undefined>
): ResolvedDecisionField<T> {
  if (affairValue !== null && affairValue !== undefined && affairValue !== "") {
    return { value: affairValue, source: "affair" };
  }
  // Ambiguity is about how many decisions are linked, not how many hold a value:
  // narrowing on the single non-null value would be exactly the implicit choice
  // this function exists to refuse.
  if (decisionValues.length > 1) {
    return { value: null, source: "ambiguous" };
  }
  const single = decisionValues[0];
  if (single !== null && single !== undefined && single !== "") {
    return { value: single, source: "decision" };
  }
  return { value: null, source: "absent" };
}

export interface ResolvedDecisionFields {
  ecli: ResolvedDecisionField<string>;
  pourvoiNumber: ResolvedDecisionField<string>;
  chamber: ResolvedDecisionField<string>;
  /** True when several decisions are linked, so no flat value is offered. */
  hasMultipleDecisions: boolean;
  /** How many decisions the affair cites, for the caller to render a list. */
  decisionCount: number;
}

/**
 * Resolves every field the decision model carries, in one pass.
 *
 * `court` and `verdictDate` are not here on purpose: they remain read from `Affair`.
 */
export function resolveDecisionFields(
  affair: DecisionFieldCarrier,
  decisions: readonly DecisionFieldCarrier[]
): ResolvedDecisionFields {
  return {
    ecli: resolveDecisionField(
      affair.ecli,
      decisions.map((d) => d.ecli)
    ),
    pourvoiNumber: resolveDecisionField(
      affair.pourvoiNumber,
      decisions.map((d) => d.pourvoiNumber)
    ),
    chamber: resolveDecisionField(
      affair.chamber,
      decisions.map((d) => d.chamber)
    ),
    hasMultipleDecisions: decisions.length > 1,
    decisionCount: decisions.length,
  };
}
