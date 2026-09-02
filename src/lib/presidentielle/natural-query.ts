const MAX_QUERY_LENGTH = 200;

// These words describe the question, not the political subject. The list is deliberately
// conservative: removing a domain noun would create broader results than the user requested.
const QUESTION_WORDS = new Set([
  "au",
  "aux",
  "avec",
  "candidat",
  "candidate",
  "candidates",
  "candidats",
  "ce",
  "ces",
  "comment",
  "dans",
  "de",
  "des",
  "du",
  "elle",
  "elles",
  "en",
  "est",
  "et",
  "font",
  "il",
  "ils",
  "la",
  "le",
  "les",
  "pour",
  "propose",
  "proposent",
  "qu",
  "que",
  "quel",
  "quelle",
  "quelles",
  "quels",
  "qui",
  "quoi",
  "sur",
  "un",
  "une",
]);

function normalize(value: string): string {
  return value
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_QUERY_LENGTH)
    .trim();
}

/**
 * Keep the nouns and verbs that carry the user's subject while removing only common question
 * scaffolding. This is a lexical bridge for full sentences, not a semantic interpretation.
 */
export function toPresidentialLexicalQuery(rawQuery: string): string {
  const normalized = normalize(rawQuery);
  if (normalized === "") return "";

  const meaningful = normalized
    .split(" ")
    .filter((term) => !QUESTION_WORDS.has(term.toLocaleLowerCase("fr")))
    .join(" ");

  return meaningful || normalized;
}
