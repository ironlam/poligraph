/**
 * Prompt for the short AI summary of a scrutin. Kept free of database imports
 * so the prompt contract is unit-testable.
 */

import { escapeXmlText } from "@/lib/text/escape-xml";
import type { SubstanceTextBlock } from "@/services/scrutin-policy-title/types";

export const SYSTEM_PROMPT = `Tu es un assistant parlementaire expert. Résume ce scrutin en 2-3 phrases concises pour un citoyen français.
Inclus: le sujet du vote, le résultat (adopté/rejeté), et les principaux enjeux.
Écris en français courant, sans jargon technique. Ne mentionne pas les numéros d'articles.
Si un bloc <texte-amendement> est fourni, c'est le texte officiel de l'amendement voté : décris UNIQUEMENT la mesure qu'il contient. N'ajoute aucune mesure, aucun chiffre ni aucun enjeu absent de ce bloc.
N'invente jamais le contenu d'un amendement à partir de son numéro ou du sujet général de la loi.
Une source role="contexte" est l'amendement qu'un sous-amendement modifie : elle explique ce qui est modifié, mais le vote porte UNIQUEMENT sur la modification (role="vote"). Ne présente jamais l'adoption ou le rejet du sous-amendement comme celui de l'amendement modifié.`;

/** Official amendment text sent to the model, per block. */
const MAX_SUBSTANCE_CHARS_PER_BLOCK = 3000;

export interface ScrutinSummaryPromptInput {
  title: string;
  result: "ADOPTED" | "REJECTED";
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  chamber: "AN" | "SENAT";
  /** Amendment-level official blocks; empty for non-amendment votes. */
  amendmentBlocks: SubstanceTextBlock[];
}

export function buildSummaryPrompt(input: ScrutinSummaryPromptInput): string {
  const resultLabel = input.result === "ADOPTED" ? "Adopté" : "Rejeté";
  const chamberLabel = input.chamber === "AN" ? "Assemblée nationale" : "Sénat";
  const lines = [
    `Scrutin: ${input.title}`,
    `Chambre: ${chamberLabel}`,
    `Résultat: ${resultLabel} (Pour: ${input.votesFor}, Contre: ${input.votesAgainst}, Abstention: ${input.votesAbstain})`,
  ];
  if (input.amendmentBlocks.length > 0) {
    lines.push("", "<texte-amendement>");
    for (const b of input.amendmentBlocks) {
      lines.push(
        `  <source role="${blockRole(b)}" champ="${fieldLabel(b)}">${escapeXmlText(b.text, MAX_SUBSTANCE_CHARS_PER_BLOCK)}</source>`
      );
    }
    lines.push("</texte-amendement>");
  }
  return lines.join("\n");
}

/** The amendment a sous-amendement modifies is context; everything else is what was voted. */
function blockRole(b: SubstanceTextBlock): "vote" | "contexte" {
  return b.sourceType === "parentAmendment" ? "contexte" : "vote";
}

function fieldLabel(b: SubstanceTextBlock): string {
  return b.field === "Amendment.summary" ? "exposé sommaire" : "dispositif";
}
