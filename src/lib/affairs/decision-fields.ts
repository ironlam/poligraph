/**
 * Read of the identifiers that live on `CourtDecision` (#536, #545).
 *
 * It used to be a dual read, preferring the affair's own historical value and falling
 * back to the linked decision. #545 removed the affair side: nothing writes those
 * columns any more, so keeping them as a preferred source would freeze whatever a
 * backfill happened to leave there. The linked decisions are now the only source.
 *
 * Measured before the switch on the 340 published affairs: 3 carry a pourvoi number,
 * and each is linked to exactly one decision carrying the same value, so no displayed
 * value changes. What changes is provenance, from `affair` to `decision`.
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
/**
 * `affair` is no longer produced (#545): it survives in the type so a stored or
 * logged value from before the switch still parses.
 */
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
 * **Several linked decisions mean no flat value at all.** Choosing would mean picking
 * one decision over another, and "the most recent" is the wrong default — on an affair
 * covering first instance, appeal then cassation, the most recent is often a
 * procedural rejection rather than the outcome a reader is looking for. The caller
 * shows the list instead.
 */
export function resolveDecisionField<T>(
  decisionValues: Array<T | null | undefined>
): ResolvedDecisionField<T> {
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
  decisions: readonly DecisionFieldCarrier[]
): ResolvedDecisionFields {
  return {
    ecli: resolveDecisionField(decisions.map((d) => d.ecli)),
    pourvoiNumber: resolveDecisionField(decisions.map((d) => d.pourvoiNumber)),
    chamber: resolveDecisionField(decisions.map((d) => d.chamber)),
    hasMultipleDecisions: decisions.length > 1,
    decisionCount: decisions.length,
  };
}
