/**
 * Lexical coherence guard shared by the AI pipelines that describe a vote
 * (citizen impact, vote analysis). It answers one question: does a generated
 * text actually talk about the OFFICIAL measure (the approved policy title, or
 * the resolved amendment substance), or did the model drift onto a different
 * measure from broad context (the scrutin-2084 failure mode)?
 *
 * WEAK lexical signal, not legal correctness. Extracted verbatim from the
 * citizen-impact pipeline so both consumers share one implementation.
 */
import type { SubstanceTextBlock } from "@/services/scrutin-policy-title/types";

/**
 * Below this fraction of the official reference vocabulary echoed in the
 * generated text, the text is treated as ungrounded (likely describing a
 * different measure than the official source).
 */
export const MIN_REFERENCE_COVERAGE = 0.3;
/**
 * Threshold for a debate already anchored by the official séance, the examined text and the
 * amendment number cited in the opening of its discussion. Such a passage cannot come from
 * another measure, so only a near-total lack of shared vocabulary (a wrong passage) blocks it.
 * Legal amendment text (articles, amounts) shares little vocabulary with plain speech.
 */
export const MIN_ANCHORED_REFERENCE_COVERAGE = 0.1;
const COVERAGE_PREFIX_LEN = 6;

/** Frequent French words (len >= 5) carrying no topical signal; excluded so
 *  shared prose boilerplate cannot inflate the coverage score. */
const COVERAGE_STOPWORDS = new Set([
  "leurs",
  "cette",
  "celle",
  "celles",
  "comme",
  "entre",
  "selon",
  "ainsi",
  "aussi",
  "toute",
  "toutes",
  "aurait",
  "auraient",
  "etait",
  "etaient",
  "avait",
  "avaient",
  "seront",
  "quand",
  "alors",
  "parce",
  "memes",
]);

function normalizeForCoverage(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Salient stemmed prefixes of a text: tokens len >= 5, stop-words optionally
 *  removed, truncated to a fixed prefix to tolerate simple inflection. */
function coveragePrefixes(s: string, opts?: { dropStopwords?: boolean }): Set<string> {
  const set = new Set<string>();
  for (const w of normalizeForCoverage(s).split(" ")) {
    if (w.length < 5) continue;
    if (opts?.dropStopwords && COVERAGE_STOPWORDS.has(w)) continue;
    set.add(w.slice(0, COVERAGE_PREFIX_LEN));
  }
  return set;
}

/**
 * Fraction of the reference's salient terms that appear in the candidate text.
 * Returns 1 when the reference has no salient term (nothing to compare against,
 * so never blocks).
 */
export function computeReferenceCoverage(text: string, referenceText: string): number {
  const ref = coveragePrefixes(referenceText, { dropStopwords: true });
  if (ref.size === 0) return 1;
  const hay = coveragePrefixes(text);
  let hits = 0;
  for (const term of ref) if (hay.has(term)) hits++;
  return hits / ref.size;
}

export interface CoherenceVerdict {
  coherent: boolean;
  coverage: number;
  referenceUsed: "policyTitle" | "amendment" | "none";
}

/**
 * Confronts a generated text with the OFFICIAL reference (the approved policy
 * title when present, else the resolved amendment substance). If the text shares
 * too little vocabulary with that reference, it likely describes a different
 * measure and must not auto-persist.
 */
export function assessCoherence(args: {
  text: string;
  policyTitle?: string | null;
  policySubtitle?: string | null;
  blocks: SubstanceTextBlock[];
  /** Lower threshold for a debate anchored by the amendment number (see above). */
  anchored?: boolean;
}): CoherenceVerdict {
  const titleRef = [args.policyTitle, args.policySubtitle].filter(Boolean).join(" ").trim();
  let referenceText = "";
  let referenceUsed: CoherenceVerdict["referenceUsed"] = "none";
  if (titleRef) {
    referenceText = titleRef;
    referenceUsed = "policyTitle";
  } else if (args.blocks.length > 0) {
    referenceText = args.blocks.map((b) => b.text).join(" ");
    referenceUsed = "amendment";
  }

  if (referenceUsed === "none") {
    return { coherent: true, coverage: 1, referenceUsed };
  }

  const coverage = computeReferenceCoverage(args.text, referenceText);
  const min = args.anchored ? MIN_ANCHORED_REFERENCE_COVERAGE : MIN_REFERENCE_COVERAGE;
  return { coherent: coverage >= min, coverage, referenceUsed };
}
