/** At most this many words are matched, so a pasted paragraph cannot build a huge query. */
const MAX_TOKENS = 8;

/**
 * French function words: they appear in nearly every scrutin title, so keeping them would only
 * widen the match (every id of the base for "de") without narrowing the subject.
 */
const STOP_WORDS = new Set([
  "au",
  "aux",
  "ce",
  "ces",
  "dans",
  "de",
  "des",
  "du",
  "en",
  "et",
  "la",
  "le",
  "les",
  "leur",
  "par",
  "pour",
  "sa",
  "se",
  "ses",
  "son",
  "sur",
  "un",
  "une",
]);

/**
 * Accent variants per base letter, upper case included so the match does not depend on the
 * database locale. Matching variants in the pattern keeps the scan on the raw columns: calling
 * unaccent() on every summary cost about 1 s per search, the pattern about 330 ms.
 */
const ACCENT_CLASSES: Record<string, string> = {
  a: "aàâäAÀÂÄ",
  c: "cçCÇ",
  e: "eéèêëEÉÈÊË",
  i: "iîïIÎÏ",
  o: "oôöOÔÖ",
  u: "uùûüUÙÛÜ",
  y: "yÿYŸ",
};

/**
 * Splits a scrutin search into the words that must each appear somewhere in the scrutin: "retraite
 * 64 ans" matches a title holding the three words in any order, not only that exact phrase.
 * Single letters and function words are dropped (they match nearly everything); a lone digit is
 * kept.
 */
export function scrutinSearchTokens(search: string): string[] {
  const words = search
    .trim()
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => (w.length >= 2 || /^[0-9]$/.test(w)) && !STOP_WORDS.has(w));
  return [...new Set(words)].slice(0, MAX_TOKENS);
}

/**
 * Case-insensitive (`~*`) regular expression matching a word with or without its accents:
 * "securite" and "sécurité" both match "Sécurité". Regex metacharacters are escaped, so "49.3"
 * or "50%" are searched literally.
 */
export function accentInsensitivePattern(word: string): string {
  const base = word.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return [...base]
    .map((ch) => {
      const variants = ACCENT_CLASSES[ch];
      return variants ? `[${variants}]` : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
}
