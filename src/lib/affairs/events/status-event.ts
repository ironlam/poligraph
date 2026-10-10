import type { AffairEventType, AffairStatus, EventOutcome } from "@/generated/prisma";

export type StatusEventSuggestion = { type: AffairEventType; outcome: EventOutcome | null };

type Rule =
  | StatusEventSuggestion
  | ((from: AffairStatus | null) => StatusEventSuggestion | null)
  | null;

const step = (type: AffairEventType, outcome: EventOutcome | null = null) => ({ type, outcome });

/** Une relaxe ou un acquittement venant d'un appel est un arrêt ; après un pourvoi, on ne devine pas. */
function decision(outcome: EventOutcome) {
  return (from: AffairStatus | null) => {
    if (from === "APPEL_EN_COURS") return step("ARRET_APPEL", outcome);
    if (from === "POURVOI_EN_CASSATION") return null;
    return step("JUGEMENT", outcome);
  };
}

// Exhaustif : un nouveau statut doit trancher ici. `null` quand l'acte n'est pas déductible
// (une condamnation devient définitive par un arrêt, un désistement ou l'expiration d'un délai).
const RULES: Record<AffairStatus, Rule> = {
  PLAINTE_DEPOSEE: step("PLAINTE"),
  ENQUETE_PRELIMINAIRE: step("ENQUETE_PRELIMINAIRE"),
  INSTRUCTION: step("INFORMATION_JUDICIAIRE"),
  INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN: null,
  MISE_EN_EXAMEN: step("MISE_EN_EXAMEN"),
  RENVOI_TRIBUNAL: step("RENVOI_TRIBUNAL"),
  PROCES_EN_COURS: (from) => step(from === "APPEL_EN_COURS" ? "PROCES_APPEL" : "PROCES"),
  CONDAMNATION_PREMIERE_INSTANCE: step("JUGEMENT", "CONDAMNATION"),
  APPEL_EN_COURS: step("APPEL"),
  POURVOI_EN_CASSATION: step("POURVOI_CASSATION"),
  CONDAMNATION_DEFINITIVE: null,
  RELAXE: decision("RELAXE"),
  ACQUITTEMENT: decision("ACQUITTEMENT"),
  NON_LIEU: step("NON_LIEU"),
  PRESCRIPTION: step("PRESCRIPTION"),
  CLASSEMENT_SANS_SUITE: step("CLASSEMENT_SANS_SUITE"),
};

/** Étape à proposer après un changement de statut, ou null si l'admin doit choisir seul. */
export function suggestEventForStatus(
  to: AffairStatus,
  from: AffairStatus | null
): StatusEventSuggestion | null {
  const rule = RULES[to];
  return typeof rule === "function" ? rule(from) : rule;
}
