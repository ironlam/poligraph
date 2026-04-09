/**
 * Validate that Affair.partyAtTime is chronologically consistent with
 * Affair.factsDate — a party cannot have been "the party at the time of the
 * facts" if the party did not yet exist when the facts occurred.
 *
 * Used by:
 *   - scripts/fix-affair-party-at-time.ts (cleanup of historical anomalies)
 *   - The Prisma client extension (creation-time guard, see prisma-extension.ts)
 *
 * Kept as a pure function so it can be unit-tested without a database.
 */

export interface PartyAtTimeInput {
  /** Date the alleged facts occurred (may be null if unknown) */
  factsDate: Date | null;
  /** Date the party was founded (may be null if unknown) */
  partyFoundedDate: Date | null;
  /** Date the party was dissolved, if applicable */
  partyDissolvedDate?: Date | null;
}

export type PartyAtTimeValidation =
  | { valid: true }
  | { valid: false; reason: "party_founded_after_facts" | "party_dissolved_before_facts" };

/**
 * Returns a structured validation result rather than a boolean so callers can
 * log exactly which rule failed and surface that in the cleanup report.
 *
 * When either date is null we cannot determine consistency, so we default to
 * valid (no false positives) — cleanup only flags rows we can prove are wrong.
 */
export function validatePartyAtTime(input: PartyAtTimeInput): PartyAtTimeValidation {
  const { factsDate, partyFoundedDate, partyDissolvedDate } = input;

  if (!factsDate || !partyFoundedDate) {
    return { valid: true };
  }

  if (factsDate.getTime() < partyFoundedDate.getTime()) {
    return { valid: false, reason: "party_founded_after_facts" };
  }

  if (partyDissolvedDate && factsDate.getTime() > partyDissolvedDate.getTime()) {
    return { valid: false, reason: "party_dissolved_before_facts" };
  }

  return { valid: true };
}

/** Boolean shortcut for callers that only need a yes/no answer. */
export function isValidPartyAtTime(input: PartyAtTimeInput): boolean {
  return validatePartyAtTime(input).valid;
}
