import { normalizeForMatching } from "./normalize";

/**
 * Procedure guard.
 *
 * `AffairStatus` is non-nullable and its fourteen values are all steps of a
 * criminal procedure, so the press extraction has no correct output for an
 * article that describes none. On affair AF-000515 it emitted MISE_EN_EXAMEN,
 * with a confidence of 95, on a political controversy where no procedure ever
 * existed. Under RGPD article 10 that is the one category of claim we cannot
 * get wrong.
 *
 * This guard answers a single question: does the article evidence that a
 * judicial procedure EXISTS? It says nothing about who it targets, which is
 * `attribution-guard`'s job. An affair may legitimately target a third party
 * (`subjectLabel`), so a procedure aimed at someone else still passes.
 *
 * Deliberately generous: a false pass reproduces the current behaviour (a draft
 * a moderator reviews), a false block diverts a real affair into
 * PressAnalysisRejection. Known limitation: the scan is article-wide, so an
 * article covering both a real procedure and an unrelated controversy passes
 * for both. Narrowing the person axis is attribution-guard's role.
 *
 * Pure: no DB, no AI.
 */

export type ProcedureVerdict = "HAS_PROCEDURE" | "NO_PROCEDURE";

export interface ProcedureGuardInput {
  /** Full text of the article analysed by the press pipeline. */
  text: string;
}

export interface ProcedureGuardResult {
  verdict: ProcedureVerdict;
  /** True when the pipeline may go on creating an affair. */
  hasProcedure: boolean;
  /** Source of the pattern that decided a pass, null on a block. */
  matched: string | null;
  reason: string;
}

/**
 * A procedure has been opened.
 *
 * "enquête" alone is absent on purpose: a journalistic investigation ("selon
 * une enquête de la rédaction") is not a judicial one, and that phrasing is
 * common in the very articles this guard has to reject.
 */
const PROCEDURE_OUVERTE: RegExp[] = [
  /\benquete preliminaire\b/,
  /\benquete judiciaire\b/,
  /\benquete (?:a ete|est|avait ete) ouverte\b/,
  /\bouvert une enquete\b/,
  /\bouverture d'une enquete\b/,
  /\binformation judiciaire\b/,
  /\binstruction judiciaire\b/,
  /\bjuge d'instruction\b/,
  /\bparquet\b/,
  /\bprocureur\b/,
  /\bplainte\b/,
  /\bperquisition/,
  /\bgarde a vue\b/,
  /\bdetention provisoire\b/,
  /\bcontrole judiciaire\b/,
];

/** A named person is a party to the procedure. */
const PERSONNE_VISEE: RegExp[] = [
  /\bmise?s? en examen\b/,
  /\bmis(?:e|es)? en cause\b/,
  /\bpoursuivi(?:e|s|es)?\b/,
  /\bprevenu(?:e|s|es)?\b/,
  /\binculp(?:e|ee|es|ees)\b/,
  /\bdefere(?:e|s|es)?\b/,
  /\becroue(?:e|s|es)?\b/,
  /\bmandat de depot\b/,
];

/**
 * A court is seized or has ruled.
 *
 * "condamné" is matched only in passive or sentence forms. A speech act
 * ("a condamné ces propos", "a condamné le recul") must NOT count, which is why
 * `le`, `les` and `ces` are absent from the follower list.
 */
const JURIDICTION_DECISION: RegExp[] = [
  /\btribunal\b/,
  /\bcour d'appel\b/,
  /\bcour de cassation\b/,
  /\bcour de justice de la republique\b/,
  /\bproces\b/,
  /\baudience\b/,
  /\brequisitoire\b/,
  /\brequisitions\b/,
  /\bcomparution\b/,
  /\b(?:a ete|ont ete|est|sont|sera|seront|fut|furent|avait ete|avaient ete) condamne(?:e|s|es)?\b/,
  /\bcondamne(?:e|s|es)? (?:a|pour)\b/,
  /\bjuge(?:e|s|es)? pour\b/,
  /\brelaxe\b/,
  /\bacquitte(?:e|s|es)?\b/,
  /\bacquittement\b/,
  /\bnon lieu\b/,
  /\bclassement sans suite\b/,
  /\bclasse sans suite\b/,
];

const FAMILIES: ReadonlyArray<{ name: string; patterns: RegExp[] }> = [
  { name: "procedure-ouverte", patterns: PROCEDURE_OUVERTE },
  { name: "personne-visee", patterns: PERSONNE_VISEE },
  { name: "juridiction-decision", patterns: JURIDICTION_DECISION },
];

/**
 * Decide whether the article evidences an existing judicial procedure.
 * Pure function, no DB/AI access.
 */
export function assessProcedureEvidence(input: ProcedureGuardInput): ProcedureGuardResult {
  const text = normalizeForMatching(input.text);

  if (!text) {
    return {
      verdict: "NO_PROCEDURE",
      hasProcedure: false,
      matched: null,
      reason: "Empty article text",
    };
  }

  for (const family of FAMILIES) {
    const hit = family.patterns.find((pattern) => pattern.test(text));
    if (hit) {
      return {
        verdict: "HAS_PROCEDURE",
        hasProcedure: true,
        matched: `${family.name}:${hit.source}`,
        reason: `Judicial procedure marker found (${family.name})`,
      };
    }
  }

  return {
    verdict: "NO_PROCEDURE",
    hasProcedure: false,
    matched: null,
    reason: "No judicial procedure marker in the article",
  };
}
