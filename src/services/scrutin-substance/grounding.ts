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
    "pib",
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

// Words that do not start an acronym's expansion ("produit intérieur brut", "taxe sur les
// conventions d'assurance").
const EXPANSION_STOPWORDS = new Set([
  "de",
  "du",
  "des",
  "d",
  "la",
  "le",
  "les",
  "l",
  "et",
  "aux",
  "au",
  "en",
  "sur",
  "pour",
  "dans",
  "par",
  "un",
  "une",
]);

/**
 * True when the initials of the last words of `phrase` appear, in order, in `abbr`, the
 * first one opening it. An abbreviation may carry letters no word of the phrase gives
 * (Ehpad: "établissements pour personnes âgées dépendantes", the h is missing).
 */
function expandsTo(abbr: string, phrase: string[]): boolean {
  const letters = fold(abbr).replace(/[^a-z]/g, "");
  if (letters.length < 3) return false;
  const words = phrase.map(fold).filter((w) => !EXPANSION_STOPWORDS.has(w));
  for (let n = Math.max(2, letters.length - 2); n <= letters.length; n++) {
    if (words.length < n) break;
    const initials = words.slice(-n).map((w) => w[0]!);
    if (initials[0] !== letters[0]) continue;
    let at = 0;
    for (const ch of letters) if (ch === initials[at]) at++;
    if (at === initials.length) return true;
  }
  return false;
}

/** At least 60% of the expansion's words (4 letters or more) are known to the sources. */
function expansionIsSupported(phrase: string[], words: Set<string>): boolean {
  const content = phrase.map(fold).filter((w) => w.length >= 4 && !EXPANSION_STOPWORDS.has(w));
  if (content.length === 0) return false;
  return content.filter((w) => isInSources(w, words)).length / content.length >= 0.6;
}

/**
 * Names the text defines itself: "produit intérieur brut (PIB)" or "CSG (Contribution
 * sociale généralisée)". When the initials agree and the expansion rests on the sources
 * (or the abbreviation is in them), the abbreviation and the words of its expansion are
 * a definition, not an invented name.
 */
function definedInText(plain: string, words: Set<string>): Set<string> {
  const exempt = new Set<string>();
  const accept = (abbr: string, phrase: string[]) => {
    if (!expandsTo(abbr, phrase)) return;
    if (!isInSources(fold(abbr), words) && !expansionIsSupported(phrase, words)) return;
    exempt.add(fold(abbr));
    for (const w of phrase) exempt.add(fold(w));
  };
  // "expansion (ABBR)"
  for (const m of plain.matchAll(/([^()\n.]{3,160})\(([\p{L}][\p{L}-]{1,11})\)/gu)) {
    accept(m[2]!, m[1]!.match(WORD_RE) ?? []);
  }
  // "ABBR (expansion)"
  for (const m of plain.matchAll(/([\p{L}][\p{L}-]{1,11})\s*\(([^()\n]{5,160})\)/gu)) {
    accept(m[1]!, m[2]!.match(WORD_RE) ?? []);
  }
  return exempt;
}

/**
 * Names cited by `text` that appear in none of `sources`. A name is a capitalised
 * word in the middle of a sentence, or an acronym of three letters or more
 * anywhere. Sentence-initial words are ignored: their capital says nothing.
 */
export function findUngroundedNames(text: string, sources: string[]): string[] {
  const words = sourceWords(sources);
  const plain = stripMarkdown(text);
  const defined = definedInText(plain, words);
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
      // Sentence start: nothing before it, a line break (paragraph, heading, list item),
      // or a mark that ends a sentence/label. Spaces and opening marks are skipped, but
      // not newlines: they are what tells a paragraph opener from a mid-sentence word.
      const before = plain.slice(0, m.index).replace(/[ \t(«"]+$/u, "");
      if (before === "" || /[.!?:;\n»]$/.test(before)) continue;
    }

    const key = fold(word);
    if (GENERIC_CAPITALISED.has(key) || defined.has(key) || found.has(key)) continue;
    found.add(key);
    if (!isInSources(key, words)) out.push(word);
  }
  return out;
}
