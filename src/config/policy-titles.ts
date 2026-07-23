/**
 * Tunables for the daily policy-title pipeline steps in sync-daily.
 * All values are env-overridable; the defaults are sane for a 3×/day cron over
 * the incremental delta of new AN votes.
 */
function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const POLICY_TITLE_CRON = {
  /**
   * Hard ceiling on ZIP entries processed per run. This is NOT a functional
   * limit: the daily import streams the WHOLE feed. If the corpus ever exceeds
   * this, the run FAILS explicitly rather than truncating silently (the old
   * 2000 cap silently skipped every recent amendment).
   */
  amendmentsSafetyCap: intEnv("POLICY_TITLE_AMENDMENTS_SAFETY_CAP", 500_000),
  /** Newest-first scrutins re-scanned for amendment links each run (idempotent). */
  linkLimit: intEnv("POLICY_TITLE_LINK_LIMIT", 200),
  /** Max titles generated per run — a safety cap, not a target. */
  generateLimit: intEnv("POLICY_TITLE_GENERATE_LIMIT", 30),
  /** Max DRAFT rows evaluated for auto-approval per run. */
  approveLimit: intEnv("POLICY_TITLE_APPROVE_LIMIT", 50),
  /**
   * Auto-approve only titles at least this old. Gives a deliberate veto window:
   * a freshly generated title is never published in the same run that made it.
   */
  approveMinAgeHours: intEnv("POLICY_TITLE_APPROVE_MIN_AGE_HOURS", 24),
} as const;
