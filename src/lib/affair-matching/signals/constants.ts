/**
 * Log-likelihood ratio constants shared between signals and the combiner.
 * Values are expert-elicited for v1 and refined from production data in v2+.
 *
 * Interpretation:
 *   log-LR = log(P(signal fires | true match) / P(signal fires | random pair))
 * Positive values support the match, negative values argue against it.
 */

// ============================================================================
// External ID signal (deterministic)
// ============================================================================
export const EXTERNAL_ID_MATCH_LLR = 10.0;

// ============================================================================
// Name quality signal (strong)
// ============================================================================
export const NAME_FULL_EXACT_LLR = 5.2;
export const NAME_LEGAL_TITLE_SURNAME_LLR = 3.6;
export const NAME_SURNAME_PROXIMITY_LLR = 2.6;
export const NAME_SURNAME_ONLY_LLR = 0.7;

/**
 * Surname-only match where the surname is also an ordinary word of the text:
 * a major city, a common given name, or a word that lives in lowercase.
 *
 * Negative rather than disqualifying, for two reasons. A disqualified candidate
 * is filtered out of the ranking, so its reason never reaches the persisted row
 * and the moderator cannot tell an artefact from a genuine unknown. And a
 * penalty stays revocable by evidence: a candidate really tied to the affair by
 * role-context (+4.0) or jurisdiction (+3.0) still clears FLOOR_SCORE, which is
 * the right outcome for someone whose surname happens to be Pierre or Marie.
 */
export const NAME_SURNAME_AMBIGUOUS_LLR = -2.0;

/** Minimum surname length for non-disqualifying match. */
export const MIN_SURNAME_LENGTH = 3;

// ============================================================================
// First name signal
// ============================================================================
export const FIRST_NAME_NEAR_LLR = 1.5;
export const FIRST_NAME_ABSENT_LLR = -0.2;
export const FIRST_NAME_PROXIMITY_CHARS = 80;

// ============================================================================
// Jurisdiction signal
// ============================================================================
export const JURISDICTION_EXACT_MATCH_LLR = 3.0;
export const JURISDICTION_DEPARTMENT_OVERLAP_LLR = 1.5;
export const JURISDICTION_MISMATCH_LLR = -2.0;

// ============================================================================
// Temporal mandate signal
// ============================================================================
export const TEMPORAL_DURING_MANDATE_LLR = 2.0;
export const TEMPORAL_AFTER_MANDATE_LLR = 0.5;
export const TEMPORAL_BEFORE_MANDATE_LLR = -1.0;

/** Politicians deceased more than this before facts date are disqualified. */
export const DEATH_GRACE_PERIOD_MS = 10 * 365.25 * 24 * 60 * 60 * 1000;

// ============================================================================
// Role context signal
// ============================================================================
export const ROLE_LOCATION_MATCH_LLR = 4.0;
export const ROLE_GENERIC_MATCH_LLR = 0.5;
export const ROLE_MISMATCH_LLR = -2.0;

// ============================================================================
// Party context signal
// ============================================================================
export const PARTY_MATCH_LLR = 1.5;
export const PARTY_FORMER_MATCH_LLR = 0.5;
export const PARTY_MISMATCH_LLR = -1.5;

// ============================================================================
// Context plausibility signal
// ============================================================================
export const FRENCH_ANCHOR_LLR = 1.0;
export const FOREIGN_CONTEXT_PENALTY_LLR = -3.0;

// ============================================================================
// Thresholds
// ============================================================================
/** Minimum absolute score for any candidate to be considered a plausible match. */
export const FLOOR_SCORE = 3.0;

/** Absolute score required for an auto-link (SAME judgment). */
export const SAME_THRESHOLD = 5.0;

/** Top candidate must beat the runner-up by at least this to auto-link. */
export const MIN_GAP = 2.0;

// ============================================================================
// Versioning
// ============================================================================
export const RESOLVER_VERSION = "v1";
