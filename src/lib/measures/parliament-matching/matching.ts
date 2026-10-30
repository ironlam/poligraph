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

/** A quote counts only if it is long enough to mean something and sits verbatim in the source. */
export function isQuoteVerified(quote: string, source: string, minWords = 4): boolean {
  const q = normalizeForMatch(quote);
  if (q.split(" ").filter(Boolean).length < minWords) return false;
  return normalizeForMatch(source).includes(q);
}

export function assignReviewTier(
  q: Qualification,
  verified: { measure: boolean; text: boolean }
): ReviewTier {
  if (q.kind === "NO_VOTE_IDENTIFIED") return "REJETE";
  if (!verified.measure || !verified.text) return "REJETE";
  return q.confidence === "high" ? "LOT_PRET" : "A_EXAMINER";
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

/** recall@k over measures that have a positive reference, precision over what the tool proposed. */
export function evaluate(
  reference: readonly Judgement[],
  retrieved: ReadonlyMap<string, readonly string[]>,
  proposed: readonly { measureId: string; textId: string }[]
) {
  const positives = reference.filter((j) => j.expected !== "NONE");
  const found = positives.filter((j) => retrieved.get(j.measureId)?.includes(j.textId)).length;
  const goodKey = new Set(positives.map((j) => `${j.measureId}|${j.textId}`));
  const truePositives = proposed.filter((p) => goodKey.has(`${p.measureId}|${p.textId}`)).length;
  return {
    recallAtK: positives.length === 0 ? null : found / positives.length,
    precision: proposed.length === 0 ? null : truePositives / proposed.length,
    positives: positives.length,
    proposed: proposed.length,
  };
}
