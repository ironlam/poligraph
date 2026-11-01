/**
 * Deterministic check that the proper names a generated text cites exist in the
 * sources the model was given. The lexical coherence guard cannot see an invented
 * company or person ("Orange ou Free" in a text about a tax whose sources never
 * name an internet provider), so a text citing a name found in no source is refused.
 *
 * Limits: it only sees capitalised names and acronyms. A lowercase invented example
 * ("streaming") passes. It is a net for the most visible invention, not a proof.
 * No DB, no model, no I/O.
 */

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(DIACRITICS_RE, "");
}

/** Capitalised words that are not names of anything the sources must mention. */
const GENERIC_CAPITALISED = new Set(
  [
    "assemblee",
    "nationale",
    "senat",
    "etat",
    "france",
    "francais",
    "francaise",
    "francaises",
    "gouvernement",
    "republique",
    "parlement",
    "constitution",
    "europe",
    "europeen",
    "europeenne",
    "europeens",
    "europeennes",
    "union",
    "commission",
    "conseil",
    "ministre",
    "president",
    "presidente",
    "monsieur",
    "madame",
    "mme",
    "poligraph",
    // Acronyms of public life every reader knows, not names a source must carry.
    "tva",
    "csg",
    "crds",
    "rsa",
    "smic",
    "insee",
    "urssaf",
    "caf",
    "apl",
    "plf",
    "plfss",
    "lfss",
    "otan",
    "onu",
    "sncf",
    "edf",
    "janvier",
    "fevrier",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "aout",
    "septembre",
    "octobre",
    "novembre",
    "decembre",
    "lundi",
    "mardi",
    "mercredi",
    "jeudi",
    "vendredi",
    "samedi",
    "dimanche",
  ].map(fold)
);

// Apostrophes split words: "L'Assemblée" is the word "Assemblée" after an elision.
const WORD_RE = /[\p{L}][\p{L}-]*/gu;

function sourceWords(sources: string[]): Set<string> {
  const words = new Set<string>();
  for (const src of sources) {
    for (const w of fold(src).match(WORD_RE) ?? []) words.add(w);
  }
  return words;
}

/** A source word equal to the name, or sharing its first 6 letters (inflection). */
function isInSources(name: string, words: Set<string>): boolean {
  if (words.has(name)) return true;
  if (name.length < 6) return false;
  const stem = name.slice(0, 6);
  for (const w of words) if (w.length >= 6 && w.startsWith(stem)) return true;
  return false;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>]/g, " ")
    .replace(/^\s*[-•]\s+/gm, "");
}

/**
 * Names cited by `text` that appear in none of `sources`. A name is a capitalised
 * word in the middle of a sentence, or an acronym of three letters or more
 * anywhere. Sentence-initial words are ignored: their capital says nothing.
 */
export function findUngroundedNames(text: string, sources: string[]): string[] {
  const words = sourceWords(sources);
  const plain = stripMarkdown(text);
  const found = new Set<string>();
  const out: string[] = [];

  for (const m of plain.matchAll(WORD_RE)) {
    const word = m[0].replace(/^-+|-+$/g, "");
    if (word.length < 3) continue;
    const first = word[0]!;
    const isAcronym = word.length >= 3 && word === word.toUpperCase() && /\p{Lu}/u.test(first);
    const isCapitalised = first === first.toUpperCase() && first !== first.toLowerCase();
    if (!isAcronym && !isCapitalised) continue;

    if (!isAcronym) {
      // Sentence start: nothing before it, or the previous mark ends a sentence/label.
      const before = plain.slice(0, m.index).replace(/[\s(«"]+$/u, "");
      if (before === "" || /[.!?:;\n]$/.test(before)) continue;
    }

    const key = fold(word);
    if (GENERIC_CAPITALISED.has(key) || found.has(key)) continue;
    found.add(key);
    if (!isInSources(key, words)) out.push(word);
  }
  return out;
}
