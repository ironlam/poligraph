/** Lexical check that every sentence of a generated argument rests on the quotes
 * cited for it. It catches claims borrowed from the amendment text or invented
 * by the model, not a change of meaning: it does not prove entailment.
 */
import type { ArgumentCitation } from "./debate-discussion";

/** Minimum share of a sentence's content words found in the cited quotes. */
export const MIN_SENTENCE_SUPPORT = 0.6;

const STOP = new Set(
  "cette ainsi aussi entre leurs comme serait devrait pourrait selon alors parce aucun chaque toute toutes tous faire être avoir mais donc dont avec pour sont plutôt".split(
    " "
  )
);
/** Reporting verbs and roles a faithful summary needs to say who speaks. */
const FRAME = new Set(
  "estime juge considère explique affirme indique précise soutient souligne rappelle demande propose suggère rapporteur général gouvernement commission ministre députée député auteur amendement défavorable favorable avis retrait sagesse".split(
    " "
  )
);

function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function stems(text: string): string[] {
  return fold(text)
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 5)
    .map((w) => w.slice(0, 5));
}
const frameStems = new Set(
  [...FRAME].flatMap((w) => stems(w)).concat([...STOP].flatMap((w) => stems(w)))
);

export interface UnsupportedSentence {
  sentence: string;
  /** Share of content words found in the cited quotes, 0 to 1. */
  support: number;
}

/** Sentences of `text` whose content words are not covered by `citations`
 * (plus the cited speakers' names and the usual reporting frame). */
export function findUnsupportedSentences(
  text: string,
  citations: ArgumentCitation[],
  speakerById: Map<string, string>
): UnsupportedSentence[] {
  const allowed = new Set(frameStems);
  for (const c of citations) {
    for (const s of stems(c.quote)) allowed.add(s);
    for (const s of stems(speakerById.get(c.paragraphId) ?? "")) allowed.add(s);
  }
  const out: UnsupportedSentence[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/).filter((s) => s.trim())) {
    const words = stems(sentence).filter((s) => !frameStems.has(s));
    if (words.length === 0) continue;
    const covered = words.filter((s) => allowed.has(s)).length;
    const support = covered / words.length;
    if (support < MIN_SENTENCE_SUPPORT) out.push({ sentence, support });
  }
  return out;
}
