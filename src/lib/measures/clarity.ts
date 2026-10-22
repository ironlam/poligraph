/**
 * Clarity lint for the text of a measure.
 *
 * A measure must be readable alone, in a list, by someone who has not read the source: the text
 * names who is targeted, what changes, by how much. These rules look for the patterns that broke
 * that in practice ("jeunes concernés", "ces derniers" with two possible referents, a five word
 * measure). They are indicators for a human to read, never a verdict: a match is a question to
 * ask, and only the text is scanned, not the context, which is allowed to carry caveats.
 */

export type ClarityRule =
  | "RENVOI_VAGUE"
  | "PRONOM_AMBIGU"
  | "TROP_COURT"
  | "QUANTITE_FLOUE"
  | "SIGLE_NON_DEFINI";

export type ClarityFinding = {
  rule: ClarityRule;
  /** What was found, as written in the text. */
  match: string;
  /** Severity: "A_RELIRE" blocks a first reading, "INDICATIF" is a hint. */
  severity: "A_RELIRE" | "INDICATIF";
  hint: string;
};

export type ClarityOptions = {
  /** Acronyms already explained by a published reader guide, matched case-sensitively. */
  knownAcronyms?: ReadonlySet<string>;
};

export const MIN_MEASURE_TEXT_LENGTH = 40;

// A letter or a digit on either side makes it part of another word ("visées", "TVAs").
const L = "(?<![\\p{L}\\d])";
const R = "(?![\\p{L}\\d])";
const word = (alternatives: string, flags = "giu") =>
  new RegExp(`${L}(?:${alternatives})${R}`, flags);

// "visé" is left out on purpose: it is mostly a legitimate participle ("l'objectif visé").
const VAGUE_REFERENT = word("concern(?:é|e)(?:e)?s?|intéressé(?:e)?s?");
const AMBIGUOUS_PRONOUN = word(
  "ces derniers|ces dernières|ce dernier|cette dernière|ceux-ci|celles-ci|celui-ci|celle-ci"
);
const VAGUE_QUANTIFIER = word("certain(?:e)?s|divers(?:es)?|plusieurs|différent(?:e)?s");
const ACRONYM = new RegExp(`${L}[A-ZÉ]{2,6}${R}`, "gu");

// Understood by any reader of a French public text, so they never need a guide.
const COMMON_ACRONYMS = new Set(["UE", "PIB", "SMIC", "RSA", "ONU", "OTAN", "CO2", "EUR", "ETAT"]);

function unique(findings: ClarityFinding[]): ClarityFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.rule}:${finding.match.toLocaleLowerCase("fr")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isExpanded(text: string, acronym: string): boolean {
  return text.includes(`(${acronym})`);
}

export function analyzeMeasureClarity(
  input: { text: string; details?: string | null },
  options: ClarityOptions = {}
): ClarityFinding[] {
  const text = input.text.replace(/\s+/g, " ").trim();
  const findings: ClarityFinding[] = [];

  // A short text with a figure is fine ("Porter le SMIC à 2 000 euros."): only a short text with
  // nothing to measure is a question.
  if (text.length < MIN_MEASURE_TEXT_LENGTH && !/\d/.test(text)) {
    findings.push({
      rule: "TROP_COURT",
      match: text,
      severity: "INDICATIF",
      hint: "Texte très court et sans chiffre : dit-il qui est visé, ce qui change, de combien ?",
    });
  }

  for (const hit of text.matchAll(VAGUE_REFERENT)) {
    findings.push({
      rule: "RENVOI_VAGUE",
      match: hit[0],
      severity: "A_RELIRE",
      hint: "Nommer à qui la mesure s'applique plutôt qu'écrire « concernés ».",
    });
  }

  for (const hit of text.matchAll(AMBIGUOUS_PRONOUN)) {
    findings.push({
      rule: "PRONOM_AMBIGU",
      match: hit[0],
      severity: "A_RELIRE",
      hint: "Répéter le nom : le pronom peut désigner plusieurs personnes ou objets de la phrase.",
    });
  }

  for (const hit of text.matchAll(VAGUE_QUANTIFIER)) {
    findings.push({
      rule: "QUANTITE_FLOUE",
      match: hit[0],
      severity: "INDICATIF",
      hint: "Donner un nombre ou la liste plutôt qu'une quantité floue.",
    });
  }

  const known = options.knownAcronyms ?? new Set<string>();
  for (const hit of text.matchAll(ACRONYM)) {
    const acronym = hit[0];
    if (COMMON_ACRONYMS.has(acronym) || known.has(acronym) || isExpanded(text, acronym)) continue;
    findings.push({
      rule: "SIGLE_NON_DEFINI",
      match: acronym,
      severity: "INDICATIF",
      hint: "Sigle sans repère publié ni développement : le développer ou créer un repère.",
    });
  }

  return unique(findings);
}
