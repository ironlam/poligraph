/** Deterministic discussion boundaries over ordered official Syceron paragraphs.
 * A common discussion stays whole: neighbouring amendments are labelled, not
 * silently attributed to the target. Over-budget or ambiguous passages abstain.
 */
import type { DebateParagraph } from "@/services/sync/debate-transcript-parse";

export const MAX_DISCUSSION_CHARS = 24000;
export const DEBATE_PROMPT_VERSION = "an-paragraph-evidence-v1";
export type DiscussionScope = "target" | "shared" | "other" | "context";
export interface DiscussionParagraph extends DebateParagraph {
  scope: DiscussionScope;
}
export interface AmendmentDiscussion {
  amendmentNumbers: string[];
  paragraphs: DiscussionParagraph[];
  common: boolean;
}

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[  ]/g, " ");
}
const NUM = String.raw`(?:[a-z]{1,2}-)?[a-z]{0,3}\d+`;
/** Only numbers belonging to an explicit amendment list, never an article number. */
export function mentionedAmendments(text: string): string[] {
  const numbers: string[] = [];
  const re = new RegExp(
    String.raw`\bamendements?[\s,]+(?:identiques[\s,]+)?n\s*(?:os?|°|umeros?)?\s*(${NUM}(?:\s*\([^)]*\))?(?:\s*(?:,|et)\s*${NUM}(?:\s*\([^)]*\))?)*)`,
    "g"
  );
  for (const m of fold(text).matchAll(re)) {
    numbers.push(...[...m[1]!.matchAll(new RegExp(NUM, "g"))].map((n) => n[0]));
  }
  return [...new Set(numbers)];
}
function core(n: string): string {
  return fold(n.replace(/\s*\(.*?\)\s*$/, "").trim());
}
function matches(n: string, target: string): boolean {
  return core(n) === core(target) || core(n) === core(target).replace(/^ii?-/, "");
}

/** Exact séance + exact examined text number are required by the caller.
 * No fallback to a same-day transcript or unstructured legacy text.
 */
export function extractAmendmentDiscussion(
  paragraphs: DebateParagraph[],
  target: { number: string; texteRef: string; subAmendment?: boolean }
): AmendmentDiscussion | null {
  const textNumber = /B(\d+)$/.exec(target.texteRef)?.[1];
  if (!textNumber || new Set(paragraphs.map((p) => p.id)).size !== paragraphs.length) return null;
  const budgetPart = /^(II?)-/.exec(target.number)?.[1];
  const episodes: AmendmentDiscussion[] = [];
  let active: { numbers: string[]; rows: DebateParagraph[]; closed: Set<string> } | null = null;
  const finish = () => {
    if (!active) return;
    if (active.numbers.some((n) => matches(n, target.number))) {
      const numbers = active.numbers;
      const rows = active.rows.map((p) => {
        const declared = target.subAmendment ? p.subAmendments : p.amendments;
        const refs = declared.length ? declared.map(core) : mentionedAmendments(p.text);
        const scope: DiscussionScope =
          refs.length === 1 && matches(refs[0]!, target.number)
            ? "target"
            : refs.length && !refs.some((n) => matches(n, target.number))
              ? "other"
              : numbers.length === 1
                ? "target"
                : /ces amendements|les deux amendements|tous les amendements|ensemble des amendements/.test(
                      fold(p.text)
                    )
                  ? "shared"
                  : "context";
        return { ...p, scope };
      });
      if (rows.reduce((n, p) => n + p.text.length, 0) <= MAX_DISCUSSION_CHARS) {
        episodes.push({ amendmentNumbers: numbers, paragraphs: rows, common: numbers.length > 1 });
      }
    }
    active = null;
  };
  for (const p of paragraphs) {
    if (
      p.textNumber?.replace(/^0+/, "") !== textNumber.replace(/^0+/, "") ||
      (budgetPart && p.budgetPart !== budgetPart)
    ) {
      finish();
      continue;
    }
    const refs = mentionedAmendments(p.text);
    const f = fold(p.text);
    const president = p.role === "president";
    const opening =
      president &&
      refs.length > 0 &&
      /discussion commune|presentation commune|amendements? identiques|pour soutenir|nous en venons|je suis saisie|je suis saisi|est defendu|sont defendus/.test(
        f
      ) &&
      !/demande[s]? de scrutin/.test(f);
    if (opening) {
      if (active && refs.some((n) => !active!.numbers.includes(n))) finish();
      if (!active) active = { numbers: refs, rows: [], closed: new Set() };
    }
    if (!active) continue;
    active.rows.push(p);
    if (/\([^)]*amendement[^)]*(?:adopte|rejete|retire|tombe|pas adopte)/.test(f)) {
      for (const n of refs) active.closed.add(n);
      if (active.numbers.every((n) => active!.closed.has(n))) finish();
    }
  }
  // Do not emit an unterminated tail, which may include unrelated business.
  if (episodes.length !== 1) return null;
  const discussion = episodes[0]!;
  if (
    target.subAmendment &&
    !discussion.paragraphs.some((p) => p.subAmendments.some((n) => matches(n, target.number)))
  )
    return null;
  if (!discussion.paragraphs.some((p) => p.scope === "target" && p.role !== "president"))
    return null;
  return discussion;
}

export interface ArgumentCitation {
  paragraphId: string;
  quote: string;
  scope: "target" | "shared";
}
/** Validate citations verbatim against the exact supplied paragraphs. This is
 * evidence validation, not a claim that lexical overlap proves entailment.
 */
export function validateArgumentCitations(
  text: string,
  value: unknown,
  discussion: AmendmentDiscussion
): ArgumentCitation[] | null {
  if (!text.trim()) return Array.isArray(value) && value.length === 0 ? [] : null;
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) return null;
  const citations: ArgumentCitation[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const c = raw as Record<string, unknown>;
    if (
      typeof c.paragraphId !== "string" ||
      typeof c.quote !== "string" ||
      (c.scope !== "target" && c.scope !== "shared")
    )
      return null;
    const p = discussion.paragraphs.find((p) => p.id === c.paragraphId);
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
    if (
      !p ||
      p.role === "president" ||
      p.scope !== c.scope ||
      c.quote.trim().length < 20 ||
      c.quote.length > 600 ||
      !normalize(p.text).includes(normalize(c.quote))
    )
      return null;
    citations.push({ paragraphId: c.paragraphId, quote: c.quote, scope: c.scope });
  }
  return citations;
}
