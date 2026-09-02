import type { ReactNode } from "react";

/**
 * The three weights a fact about a measure can carry, and the only place their form is decided.
 *
 * The tier encodes IMPORTANCE, not category. A reader scanning the page has to meet the verdicts
 * first and the housekeeping last, and before this component every badge on the surface set its own
 * classes by hand: the verification state was bare grey text with no form at all, while vote
 * positions used pills. Two qualifications of the same sentence appeared in two visual languages
 * and the one without a shape read as leftover rather than as information.
 *
 * - `verdict`: the candidacy voted on the same object. Rare, strong, the only tier allowed a colour,
 *   which the caller passes (the AA-verified values of spec §9.2).
 * - `qualification`: descriptive, on nearly every measure, never a judgment. Tinted ground, dark
 *   text, no colour of its own.
 * - `verification`: where our own work stands. The most frequent of the three, so the quietest: no
 *   ground, a dashed rule that says "provisional" without adding weight, regular text. A tier that
 *   appears under almost every measure must not become wallpaper.
 *
 * Weights are 400 and 700 and nothing else, because the body face (Atkinson Hyperlegible) publishes
 * exactly those two. `font-medium` was rendering at 400, which is why a filled pill looked soft.
 */
export type MeasureBadgeTier = "verdict" | "qualification" | "verification";

const TIER_CLASS: Record<MeasureBadgeTier, string> = {
  verdict: "font-bold",
  qualification: "border border-border/70 bg-muted font-bold text-foreground",
  verification: "border border-dashed border-border text-muted-foreground-strong",
};

export function MeasureBadge({
  tier,
  icon,
  className,
  attrs,
  children,
}: {
  tier: MeasureBadgeTier;
  /** Decorative mark for the verification tier; the label always says the same thing in words. */
  icon?: ReactNode;
  className?: string;
  /** Hooks the surface asserts on, kept out of the styling contract. */
  attrs?: Record<string, string>;
  children: ReactNode;
}) {
  const base = "inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs leading-tight";
  const classes = [base, TIER_CLASS[tier], className].filter(Boolean).join(" ");

  return (
    <span data-measure-badge={tier} className={classes} {...attrs}>
      {icon}
      {children}
    </span>
  );
}
