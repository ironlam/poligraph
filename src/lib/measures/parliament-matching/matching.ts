import { createHash } from "node:crypto";
/**
 * Pure building blocks of the measure to parliamentary text matching proof of concept.
 *
 * Nothing here talks to the database or to a model. The model only ever proposes: a proposal is
 * kept for a human when the passages it quotes really exist in the sources, and it never carries
 * a vote polarity (`MeasureVoteRelation` stays a reviewer decision, see `vote-links.ts`).
 */

export type ProposedLinkKind = "SAME_OBJECT" | "BROADER_TEXT" | "NO_VOTE_IDENTIFIED";
export type Confidence = "high" | "medium" | "low";

export interface Qualification {
  kind: ProposedLinkKind;
  confidence: Confidence;
  /** Passage copied from the measure, verbatim. */
  measureQuote: string;
  /** Passage copied from the parliamentary text, verbatim. */
  textQuote: string;
  rationale: string;
}

export type ReviewTier = "LOT_PRET" | "A_EXAMINER" | "REJETE";

export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .toLocaleLowerCase("fr")
    .replace(/\s+/g, " ")
    .trim();
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

const STOPWORDS = new Set(
  "le la les un une des du de au aux et en pour par sur dans avec sans que qui ce cette ces son sa ses leur leurs est sont etre ou ne pas plus a l d s n y".split(
    " "
  )
);

export function significantTokens(value: string): string[] {
  return normalizeForMatch(value)
    .split(" ")
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

/** Share of the measure's significant words found in the document, a cheap lexical signal. */
export function lexicalOverlap(measure: string, document: string): number {
  const wanted = new Set(significantTokens(measure));
  if (wanted.size === 0) return 0;
  const haystack = new Set(significantTokens(document));
  let hits = 0;
  for (const token of wanted) if (haystack.has(token)) hits++;
  return hits / wanted.size;
}

const RRF_K = 60;

/** Reciprocal-rank fusion of two orderings of document ids, stable on ties. */
export function fuseRankings(semantic: readonly string[], lexical: readonly string[]): string[] {
  const score = new Map<string, number>();
  for (const ranking of [semantic, lexical]) {
    ranking.forEach((id, rank) => score.set(id, (score.get(id) ?? 0) + 1 / (RRF_K + rank + 1)));
  }
  return [...score.entries()]
    .toSorted((l, r) => r[1] - l[1] || l[0].localeCompare(r[0]))
    .map(([id]) => id);
}

export const QUALIFICATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "confidence", "measureQuote", "textQuote", "rationale"],
  properties: {
    kind: { type: "string", enum: ["SAME_OBJECT", "BROADER_TEXT", "NO_VOTE_IDENTIFIED"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    measureQuote: { type: "string" },
    textQuote: { type: "string" },
    rationale: { type: "string" },
  },
} as const;

const sanitize = (s: string, max: number) => s.replace(/["\n\r]+/g, " ").slice(0, max);

export function buildQualificationPrompt(measureText: string, textTitle: string, textBody: string) {
  return [
    "Tu compares une mesure d'un programme électoral avec un texte parlementaire.",
    "Réponds uniquement par un objet JSON conforme au schéma.",
    "Règles :",
    "- SAME_OBJECT : le texte traite du même dispositif, avec la même action et le même public. Une proximité de thème ne suffit pas.",
    "- BROADER_TEXT : le texte contient ou encadre le dispositif de la mesure sans lui être identique.",
    "- NO_VOTE_IDENTIFIED : tout le reste, y compris dans le doute.",
    "- measureQuote et textQuote sont des extraits copiés mot pour mot. Si tu ne peux pas citer, réponds NO_VOTE_IDENTIFIED avec des citations vides.",
    "- Ne dis rien du sens d'un vote, ni de la position d'une personne.",
    `<mesure>${sanitize(measureText, 600)}</mesure>`,
    `<texte_titre>${sanitize(textTitle, 300)}</texte_titre>`,
    `<texte>${sanitize(textBody, 1800)}</texte>`,
  ].join("\n");
}

export function parseQualification(raw: unknown): Qualification | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const kinds = ["SAME_OBJECT", "BROADER_TEXT", "NO_VOTE_IDENTIFIED"];
  const confidences = ["high", "medium", "low"];
  if (typeof r.kind !== "string" || !kinds.includes(r.kind)) return null;
  if (typeof r.confidence !== "string" || !confidences.includes(r.confidence)) return null;
  if (typeof r.measureQuote !== "string" || typeof r.textQuote !== "string") return null;
  if (typeof r.rationale !== "string") return null;
  return r as unknown as Qualification;
}

const ELLIPSIS = /\[\s*(?:\.{3}|…)\s*\]|\.{3}|…/;

/**
 * A quote counts only if each fragment is long enough to mean something and sits verbatim in the
 * source. An ellipsis joins fragments that need not be contiguous in the source, so each is checked
 * on its own; fragments shorter than `minWords` are ignored, and at least one must remain.
 */
export function isQuoteVerified(quote: string, source: string, minWords = 4): boolean {
  const haystack = normalizeForMatch(source);
  const fragments = quote
    .split(ELLIPSIS)
    .map(normalizeForMatch)
    .filter((f) => f.split(" ").filter(Boolean).length >= minWords);
  return fragments.length > 0 && fragments.every((f) => haystack.includes(f));
}

/**
 * A verified quote can still prove little: the dossier's own title. For a short bill the title is
 * the object, so this is not grounds for rejection, only for a human to read it. The measure
 * quote is not checked: a short measure is naturally quoted whole.
 */
export function isGenericEvidence(q: Pick<Qualification, "textQuote">, textTitle: string): boolean {
  const tq = normalizeForMatch(q.textQuote);
  return tq.length > 0 && normalizeForMatch(textTitle).includes(tq);
}

/** Distinct significant words (5+ letters) of the measure that the document also contains. */
export function sharedDistinctiveTerms(measure: string, document: string): number {
  const haystack = new Set(significantTokens(document));
  const wanted = new Set(significantTokens(measure).filter((t) => t.length >= 5));
  let hits = 0;
  for (const token of wanted) if (haystack.has(token)) hits++;
  return hits;
}

export const MIN_SHARED_TERMS = 2;

export interface EvidenceChecks {
  measure: boolean;
  text: boolean;
  /** False when the text quote is only the dossier title. */
  specific: boolean;
  /** True when the measure and the text share enough distinctive words. */
  vocabulary: boolean;
}

/**
 * Only SAME_OBJECT with high confidence, every check passed and a quote beyond the dossier title is
 * pre-ticked. BROADER_TEXT is a thematic proximity until a human says otherwise, so it always waits
 * for an explicit decision. A title-only quote waits too, without being rejected.
 */
export function assignReviewTier(q: Qualification, checks: EvidenceChecks): ReviewTier {
  if (q.kind === "NO_VOTE_IDENTIFIED") return "REJETE";
  if (!checks.measure || !checks.text || !checks.vocabulary) return "REJETE";
  return q.kind === "SAME_OBJECT" && q.confidence === "high" && checks.specific
    ? "LOT_PRET"
    : "A_EXAMINER";
}

export interface ReviewRow {
  measureId: string;
  textId: string;
  textTitle: string;
  tier: ReviewTier;
}

/** One batch per parliamentary text: a reviewer reads the text once and rules on all its measures. */
export function groupForBatchReview<T extends ReviewRow>(rows: readonly T[]) {
  const groups = new Map<string, { textId: string; textTitle: string; rows: T[] }>();
  for (const row of rows) {
    if (row.tier === "REJETE") continue;
    const g = groups.get(row.textId) ?? { textId: row.textId, textTitle: row.textTitle, rows: [] };
    g.rows.push(row);
    groups.set(row.textId, g);
  }
  return [...groups.values()].toSorted(
    (l, r) => r.rows.length - l.rows.length || l.textId.localeCompare(r.textId)
  );
}

export interface Judgement {
  measureId: string;
  textId: string;
  /** Human label from the reference set. */
  expected: "SAME_OBJECT" | "BROADER_TEXT" | "NONE";
}

const REFERENCE_LABELS = new Set(["SAME_OBJECT", "BROADER_TEXT", "NONE"]);

/**
 * recall@k over the positives of the reference, precision over the proposals the reference covers.
 * A proposal the reference does not judge is unknown, not wrong: counting it as a false positive
 * would make the precision depend on how many pairs were not labelled. A sheet with a missing label
 * is refused, since an empty verdict would otherwise count as a positive.
 */
export function evaluate(
  reference: readonly Judgement[],
  retrieved: ReadonlyMap<string, readonly string[]>,
  proposed: readonly { measureId: string; textId: string }[]
) {
  const unlabeled = reference.filter((j) => !REFERENCE_LABELS.has(j.expected));
  if (unlabeled.length > 0) {
    throw new Error(
      `${unlabeled.length} paire(s) de la feuille de référence sans verdict (SAME_OBJECT, BROADER_TEXT ou NONE)`
    );
  }
  const key = (j: { measureId: string; textId: string }) => `${j.measureId}|${j.textId}`;
  const judged = new Map(reference.map((j) => [key(j), j.expected] as const));
  const positives = reference.filter((j) => j.expected !== "NONE");
  const found = positives.filter((j) => retrieved.get(j.measureId)?.includes(j.textId)).length;
  const judgedProposals = proposed.filter((p) => judged.has(key(p)));
  const truePositives = judgedProposals.filter((p) => judged.get(key(p)) !== "NONE").length;
  return {
    recallAtK: positives.length === 0 ? null : found / positives.length,
    precision: judgedProposals.length === 0 ? null : truePositives / judgedProposals.length,
    positives: positives.length,
    proposed: proposed.length,
    judgedProposed: judgedProposals.length,
  };
}

export interface ProposalRecord {
  measureId: string;
  textId: string;
  measureText: string;
  textTitle: string;
  tier: ReviewTier;
  rank: number;
  q: Qualification;
}

export interface ReferenceCandidate {
  measureId: string;
  textId: string;
  measureText: string;
  textTitle: string;
  /** What the tool said, shown to the judge only as a hint. */
  proposedKind: ProposedLinkKind;
  /** To fill in by hand: SAME_OBJECT, BROADER_TEXT or NONE. */
  expected: "";
}

const byStableId = (l: ProposalRecord, r: ProposalRecord) =>
  `${l.measureId}|${l.textId}`.localeCompare(`${r.measureId}|${r.textId}`);

/**
 * Builds the sheet a human judges: every SAME_OBJECT (rejected ones included, they measure the
 * false rejects), a slice of BROADER_TEXT, and well-ranked pairs the model refused (the negatives).
 */
export function buildReferenceSheet(
  records: readonly ProposalRecord[],
  quota = { same: 9, broader: 10, negatives: 11 }
): ReferenceCandidate[] {
  const pick = (list: ProposalRecord[], n: number) => list.toSorted(byStableId).slice(0, n);
  const same = pick(
    records.filter((r) => r.q.kind === "SAME_OBJECT"),
    quota.same
  );
  const broader = pick(
    records.filter((r) => r.q.kind === "BROADER_TEXT" && r.tier !== "REJETE"),
    quota.broader
  );
  const negatives = pick(
    records.filter((r) => r.q.kind === "NO_VOTE_IDENTIFIED" && r.rank < 2),
    quota.negatives
  );
  return [...same, ...broader, ...negatives].map((r) => ({
    measureId: r.measureId,
    textId: r.textId,
    measureText: r.measureText,
    textTitle: r.textTitle,
    proposedKind: r.q.kind,
    expected: "",
  }));
}

/**
 * Embedding cache key: the id alone is not enough, a measure reworded after the cache was written
 * would keep its old vector and be matched on its old meaning. The text hash makes a changed text a
 * cache miss.
 */
export function embeddingCacheKey(kind: "m" | "d", id: string, text: string): string {
  return `${kind}:${id}:${createHash("sha1").update(text).digest("hex").slice(0, 12)}`;
}
