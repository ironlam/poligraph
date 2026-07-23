import type { ParsedTitle, ParserWarning } from "./types";

// Supported amendment-number patterns inside scrutin titles:
//   1234              — plain (most common)
//   I-390, II-3410    — budget parts I and II
//   II-CF711, I-CF1764 — budget Finance Commission variant
// Committee prefixes (CL, AC, CS, CE, CD, AS) appear inside Amendment.number but
// rarely surface in scrutin titles, so we deliberately don't match them.
const NUMBER_RE = String.raw`(?:I{1,2}-)?(?:CF)?[0-9]+`;

// Regex statefulness notes (parser determinism):
//   - SUB_TO_PARENT_RE: called via .exec() expecting a single match → NO `g`
//     flag (a `g` regex would carry lastIndex between parseScrutinTitle calls
//     and intermittently skip the first match). Case-insensitive only.
//   - PRINCIPAL_RE: consumed via String.prototype.matchAll(), which REQUIRES
//     `g` but clones the regex internally and never mutates a shared lastIndex,
//     so it is deterministic across calls. Safe to keep at module scope.
//   - ENUMERATED_RE / IDENTIQUE_RE: no `g` flag, used via .exec()/.test() → no
//     statefulness. Safe at module scope.
const SUB_TO_PARENT_RE = new RegExp(
  String.raw`sous-amendement\s+(?:n°?\s*)?(${NUMBER_RE})(?:[^,]*?\s+à\s+l['']amendement\s+(?:n°?\s*)?(${NUMBER_RE}))?`,
  "i"
);

const PRINCIPAL_RE = new RegExp(
  String.raw`(?<!sous-)amendement(?:s)?(?:\s+identiques?)?\s+(?:n°?\s*)?(${NUMBER_RE})`,
  "gi"
);

const IDENTIQUE_RE = /amendements?\s+identiques?|identique\s+suivant/i;
const ENUMERATED_RE = new RegExp(String.raw`(${NUMBER_RE})\s+et\s+(?:n°?\s*)?(${NUMBER_RE})`, "i");

/**
 * Detects the délibération cited in the title. Accent-insensitive: diacritics
 * are stripped first so "seconde délibération" and "seconde deliberation" both
 * match. An unspecified title is an ordinary première-délibération vote (null).
 */
const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");
function detectDeliberation(title: string): 1 | 2 | null {
  const norm = title.normalize("NFD").replace(DIACRITICS_RE, "");
  if (/seconde\s+deliberation/i.test(norm)) return 2;
  if (/premiere\s+deliberation/i.test(norm)) return 1;
  return null;
}

export function parseScrutinTitle(title: string): ParsedTitle {
  const warnings: ParserWarning[] = [];
  let confidence = 1.0;

  let subAmendmentNumber: string | null = null;
  let parentAmendmentNumber: string | null = null;
  let sansSub = title;
  const subMatch = SUB_TO_PARENT_RE.exec(title);
  if (subMatch) {
    subAmendmentNumber = subMatch[1] ?? null;
    parentAmendmentNumber = subMatch[2] ?? null;
    sansSub = title.slice(0, subMatch.index) + title.slice(subMatch.index + subMatch[0].length);
    if (subAmendmentNumber && !parentAmendmentNumber) {
      warnings.push({
        code: "SUB_WITHOUT_PARENT",
        message: "Sous-amendement cited without an explicit parent amendment.",
      });
      confidence -= 0.1;
    }
  }

  const principalNumbers = new Set<string>();
  for (const m of sansSub.matchAll(PRINCIPAL_RE)) {
    if (m[1]) principalNumbers.add(m[1]);
  }

  const hasIdentique = IDENTIQUE_RE.test(title);
  const identiqueNumbers: string[] = [];
  if (hasIdentique) {
    const enumMatch = ENUMERATED_RE.exec(title);
    if (enumMatch && enumMatch[1] && enumMatch[2]) {
      identiqueNumbers.push(enumMatch[1], enumMatch[2]);
    } else {
      warnings.push({
        code: "IDENTIQUE_NOT_ENUMERATED",
        message:
          "Identical group implied (e.g. 'identique suivant') but not enumerated in the title.",
      });
      confidence -= 0.15;
    }
  }

  if (principalNumbers.size > 1 && !subAmendmentNumber) {
    warnings.push({
      code: "MULTIPLE_PRINCIPALS",
      message: `Title cites ${principalNumbers.size} distinct principal amendments.`,
    });
    confidence -= 0.1;
  }

  if (!subAmendmentNumber && principalNumbers.size === 0 && identiqueNumbers.length === 0) {
    warnings.push({ code: "NO_AMENDMENT_CITED", message: "No amendment number found in title." });
    confidence = 0.2;
  }

  return {
    principalNumbers: [...principalNumbers],
    subAmendmentNumber,
    parentAmendmentNumber,
    hasIdentique,
    identiqueNumbers,
    deliberation: detectDeliberation(title),
    warnings,
    confidence: Math.max(0, confidence),
  };
}
