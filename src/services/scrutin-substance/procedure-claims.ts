/**
 * Affirmations de procédure qu'un décryptage ne peut pas tirer de ses sources.
 *
 * Le prompt les interdit, mais un modèle glisse : « le gouvernement devra le
 * modifier », « bloque temporairement le budget » sont des spéculations sur la
 * suite, et « le projet de loi dans son intégralité » décrit mal un vote sur la
 * première partie. Un texte qui en contient n'est pas écrit en base, il reste
 * à régénérer (même doctrine que la cohérence et l'ancrage des noms).
 */

import type { VoteScope } from "@/lib/scrutin-scope";

export type ProceduralOverclaimCode = "EN_VIGUEUR" | "PORTEE" | "SUITE" | "JUGEMENT";

export interface ProceduralOverclaim {
  code: ProceduralOverclaimCode;
  excerpt: string;
}

// `\b` ne marche pas autour d'une lettre accentuée en JavaScript : lookarounds Unicode.
const L = String.raw`\p{L}`;

// Aucun décryptage ne reçoit d'information de promulgation : « en vigueur » est toujours inventé.
const EN_VIGUEUR = new RegExp(
  String.raw`(?<!${L})(?:en\s+vigueur|entr(?:e|era|ent|erait)\s+en\s+application)(?!${L})`,
  "iu"
);

const PORTEE = new RegExp(
  String.raw`(?<!${L})(?:dans\s+son\s+(?:intégralité|ensemble)|en\s+intégralité|en\s+bloc)(?!${L})`,
  "iu"
);

const anyOf = (patterns: string[]) =>
  new RegExp(patterns.map((p) => `(?<!${L})${p}`).join("|"), "iu");

// Jugements de valeur déguisés en fait ; la neutralité les interdit déjà dans le prompt.
const JUGEMENT = anyOf([String.raw`indispensables?`, String.raw`essentiel(?:le)?s?`]);

// Spéculation sur les conséquences : aucune donnée officielle ne la porte, jamais.
const SUITE_SPECULATION = anyOf([
  String.raw`devra\s+(?:le\s+|la\s+|ce\s+|cette\s+)?(?:modifier|représenter|réexaminer|revoir|redéposer|retravailler)`,
  String.raw`bloqu(?:e|er|era|ent|age)`,
  String.raw`retarde(?:r|ra)?`,
  String.raw`doit\s+(?:maintenant|désormais)`,
  String.raw`suspen(?:d|dent|dra|du|dre)`,
  String.raw`temporairement`,
  String.raw`négociations?`,
  String.raw`pourr(?:ait|aient)\s+(?:évoluer|changer|être\s+modifié)`,
  String.raw`conditionne`,
  String.raw`restent?\s+en\s+discussion`,
]);

// Déroulement de la procédure : permis seulement quand une donnée officielle le fournit.
const SUITE_DEROULEMENT = anyOf([
  String.raw`(?:sera|va\s+être)\s+(?:transmis|renvoyé|examiné|soumis|repris|réexaminé)`,
  String.raw`réexamin`,
  String.raw`prochaine\s+(?:étape|lecture)`,
  String.raw`la\s+suite\s+de\s+la\s+procédure`,
]);

/**
 * Seule suite de procédure que le décryptage a le droit d'énoncer : le rejet de la
 * première partie d'une loi de finances vaut rejet du texte en première lecture, et le
 * texte initial du Gouvernement part au Sénat. Conditionné au statut du dossier
 * (REJETE_NAVETTE, calculé sur la décision officielle de l'AN), jamais déduit du titre.
 */
export function buildProcedureFact(input: {
  scope: VoteScope;
  result: "ADOPTED" | "REJECTED";
  chamber: "AN" | "SENAT";
  dossierStatus: string | null;
}): string | null {
  if (
    input.scope === "PART" &&
    input.result === "REJECTED" &&
    input.chamber === "AN" &&
    input.dossierStatus === "REJETE_NAVETTE"
  ) {
    return "L'Assemblée nationale n'ayant pas adopté cette partie, le texte entier est considéré comme rejeté en première lecture. Le texte initial du Gouvernement est transmis au Sénat, sans les modifications votées par les députés.";
  }
  return null;
}

function excerptAround(text: string, match: RegExpMatchArray): string {
  const start = Math.max(0, (match.index ?? 0) - 30);
  return text.slice(start, (match.index ?? 0) + match[0].length + 30).trim();
}

export function findProceduralOverclaims(
  text: string,
  opts: { scope: VoteScope; hasProcedureFact: boolean }
): ProceduralOverclaim[] {
  const found: ProceduralOverclaim[] = [];
  const check = (code: ProceduralOverclaimCode, re: RegExp) => {
    const m = text.match(re);
    if (m) found.push({ code, excerpt: excerptAround(text, m) });
  };

  check("EN_VIGUEUR", EN_VIGUEUR);
  // Avec une donnée officielle sur la suite, le texte entier peut légitimement être dit rejeté.
  if ((opts.scope === "PART" || opts.scope === "ARTICLE") && !opts.hasProcedureFact) {
    check("PORTEE", PORTEE);
  }
  check("JUGEMENT", JUGEMENT);
  const speculation = text.match(SUITE_SPECULATION);
  const deroulement = opts.hasProcedureFact ? null : text.match(SUITE_DEROULEMENT);
  const suite = speculation ?? deroulement;
  if (suite) found.push({ code: "SUITE", excerpt: excerptAround(text, suite) });
  return found;
}
