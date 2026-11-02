import type { MeasureDossierLinkKind } from "@/generated/prisma";

/** One line of the decisions file exported by the review page. */
export interface ImportDecision {
  measureId: string;
  textId: string;
  decision: "SAME_OBJECT" | "BROADER_TEXT" | "REJECT";
}

/** One line of the proposals file, where the quotes and the rationale live. */
export interface ImportProposal {
  measureId: string;
  textId: string;
  measureText: string;
  textTitle: string;
  q: { measureQuote: string; textQuote: string; rationale: string };
}

export interface PlannedLink {
  measureId: string;
  dossierId: string;
  measureText: string;
  textTitle: string;
  linkKind: MeasureDossierLinkKind;
  measureQuote: string;
  textQuote: string;
  rationale: string;
}

export interface ImportPlan {
  toWrite: PlannedLink[];
  rejected: number;
  problems: string[];
}

const KINDS = new Set(["SAME_OBJECT", "BROADER_TEXT", "REJECT"]);

/**
 * Joins the reviewer's decisions with the proposals that hold the evidence. The link kind is the
 * reviewer's decision, never the model's proposal. A decision with no matching proposal, an unknown
 * value or no quotes is a problem to report, not something to guess.
 */
export function planDossierLinkImport(
  decisions: readonly ImportDecision[],
  proposals: readonly ImportProposal[]
): ImportPlan {
  const byKey = new Map(proposals.map((p) => [`${p.measureId}|${p.textId}`, p]));
  const plan: ImportPlan = { toWrite: [], rejected: 0, problems: [] };
  const seen = new Set<string>();
  for (const d of decisions) {
    const key = `${d.measureId}|${d.textId}`;
    if (!KINDS.has(d.decision)) {
      plan.problems.push(`${key} : décision inconnue « ${String(d.decision)} »`);
      continue;
    }
    if (seen.has(key)) {
      plan.problems.push(`${key} : décision en double`);
      continue;
    }
    seen.add(key);
    if (d.decision === "REJECT") {
      plan.rejected++;
      continue;
    }
    const p = byKey.get(key);
    if (!p) {
      plan.problems.push(`${key} : aucune proposition correspondante`);
      continue;
    }
    if (p.q.measureQuote.trim() === "" || p.q.textQuote.trim() === "") {
      plan.problems.push(`${key} : citations absentes`);
      continue;
    }
    plan.toWrite.push({
      measureId: d.measureId,
      dossierId: d.textId,
      measureText: p.measureText,
      textTitle: p.textTitle,
      linkKind: d.decision,
      measureQuote: p.q.measureQuote,
      textQuote: p.q.textQuote,
      rationale: p.q.rationale,
    });
  }
  return plan;
}

/**
 * A decision was taken on the text the reviewer saw. If the measure was republished since, the
 * quotes may still occur in the new wording while its scope has changed, so the link would carry a
 * human approval that never covered that wording. Strict equality: no normalisation.
 */
export function reviewedTextStillCurrent(
  reviewedText: string,
  currentText: string | null
): boolean {
  return currentText !== null && currentText === reviewedText;
}
