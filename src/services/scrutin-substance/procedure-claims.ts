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

// Aucun décryptage ne reçoit d'information de promulgation : dire qu'une mesure « entre en
// vigueur » est toujours inventé. Seule la forme affirmative est visée : « le droit en vigueur »,
// « reste en vigueur », « avant d'entrer en vigueur » et « n'entrera pas en vigueur » sont
// courants en base et justes (relevé sur 1 112 décryptages).
const EN_VIGUEUR = new RegExp(
  String.raw`(?<!n['’])(?<!${L})(?:entr(?:e|era|ent|erait)(?:\s+(?:donc|désormais|alors|immédiatement|aussitôt))?\s+en\s+(?:vigueur|application)|sera\s+en\s+vigueur)(?!${L})`,
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

// Spéculation propre à la procédure : aucune donnée officielle ne la porte, pour aucun vote.
const SUITE_STRICT = anyOf([
  String.raw`devra\s+(?:le\s+|la\s+|ce\s+|cette\s+)?(?:modifier|représenter|réexaminer|revoir|redéposer|retravailler)`,
  String.raw`doit\s+(?:maintenant|désormais)`,
]);

// « bloque / suspend / retarde » décrivent aussi les mesures d'un texte (« suspendre la hausse
// des loyers », « bloquer les prix ») : seul l'objet procédural trahit une spéculation sur la
// suite (« bloque l'adoption du budget », « suspend temporairement l'adoption »).
const PROCEDURE_OBJECT = String.raw`(?:\s+\S+){0,3}?\s+(?:l['’]|la\s+|le\s+)?(?:adoption|examen|procédure|suite|définition|discussion|vote|budget)(?!${L})`;
const SUITE_WIDE = anyOf([
  String.raw`bloqu(?:e|er|era|ent)${PROCEDURE_OBJECT}`,
  String.raw`retard(?:e|er|era|ent)${PROCEDURE_OBJECT}`,
  String.raw`suspen(?:d|dent|dra|du|dre)${PROCEDURE_OBJECT}`,
  String.raw`négociations?\s+entre\s+(?:l['’]Assemblée|le\s+Sénat|les\s+deux\s+chambres)`,
  String.raw`conditionne\s+(?:le\s+reste|la\s+suite|l['’]examen)`,
  String.raw`restent?\s+en\s+discussion`,
]);

// Déroulement de la procédure : permis seulement quand une donnée officielle le fournit.
// Seul le déroulement d'une assemblée vers une autre est visé : « sera soumis à une taxe » ne l'est pas.
const SUITE_DEROULEMENT = anyOf([
  String.raw`(?:sera|va\s+être)\s+(?:transmis|renvoyé|examiné|soumis|repris|réexaminé)\s+(?:à\s+l['’]Assemblée|au\s+Sénat|à\s+la\s+commission|en\s+commission|au\s+Gouvernement|devant\s+(?:l['’]Assemblée|le\s+Sénat)|à\s+une\s+(?:nouvelle|deuxième|seconde)\s+\p{L}+)`,
  String.raw`réexamin(?:é|ée|er)\s+(?:par\s+(?:l['’]Assemblée|le\s+Sénat)|au\s+Sénat|en\s+commission)`,
  String.raw`prochaine\s+(?:étape|lecture)`,
  String.raw`la\s+suite\s+de\s+la\s+procédure`,
]);

interface TimelineNode {
  code?: unknown;
  voteRefs?: unknown;
  children?: unknown;
}

/**
 * Code de l'acte de la timeline du dossier dont `voteRefs` cite ce scrutin (référence
 * officielle AN), ou null. La timeline est un JSON libre en base : tout est vérifié.
 */
export function findDecisionCodeForVote(
  timeline: unknown,
  scrutinExternalId: string
): string | null {
  if (!Array.isArray(timeline)) return null;
  for (const raw of timeline as TimelineNode[]) {
    if (
      typeof raw?.code === "string" &&
      Array.isArray(raw.voteRefs) &&
      raw.voteRefs.includes(scrutinExternalId)
    ) {
      return raw.code;
    }
    const inChildren = findDecisionCodeForVote(raw?.children, scrutinExternalId);
    if (inChildren) return inChildren;
  }
  return null;
}

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
  /** Code de l'acte de décision du dossier qui cite CE scrutin (voir findDecisionCodeForVote). */
  decisionCode: string | null;
}): string | null {
  if (
    input.scope === "PART" &&
    input.result === "REJECTED" &&
    input.chamber === "AN" &&
    input.dossierStatus === "REJETE_NAVETTE" &&
    // Le statut courant du dossier ne parle pas de ce vote : seule la décision de 1re
    // lecture à l'AN qui cite ce scrutin établit « texte entier rejeté, transmis au Sénat ».
    input.decisionCode === "AN1-DEBATS-DEC"
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
  const aboutTextVote = opts.scope !== "OTHER";
  if (aboutTextVote) check("JUGEMENT", JUGEMENT);
  const speculation = text.match(SUITE_STRICT) ?? (aboutTextVote ? text.match(SUITE_WIDE) : null);
  const deroulement =
    opts.hasProcedureFact || !aboutTextVote ? null : text.match(SUITE_DEROULEMENT);
  const suite = speculation ?? deroulement;
  if (suite) found.push({ code: "SUITE", excerpt: excerptAround(text, suite) });
  return found;
}
