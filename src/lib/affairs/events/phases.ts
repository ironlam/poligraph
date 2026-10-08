/**
 * Barre de phases d'une affaire : seules les phases traversées par une étape tenue, dans leur
 * ordre d'apparition, plus la phase courante dérivée du statut si elle manque.
 */
import type { AffairEventType, AffairStatus, EventOccurrence } from "@/generated/prisma";

export type Phase = "ENQUETE" | "INSTRUCTION" | "JUGEMENT" | "APPEL" | "CASSATION";

export const PHASE_LABELS: Record<Phase, string> = {
  ENQUETE: "Enquête",
  INSTRUCTION: "Instruction",
  JUGEMENT: "Jugement",
  APPEL: "Appel",
  CASSATION: "Cassation",
};

/** INHERIT : prend la phase de l'étape précédente. `null` : hors phase. */
export const EVENT_TYPE_PHASE: Record<AffairEventType, Phase | "INHERIT" | null> = {
  PLAINTE: "ENQUETE",
  ENQUETE_PRELIMINAIRE: "ENQUETE",
  PERQUISITION: "ENQUETE",
  GARDE_A_VUE: "ENQUETE",
  CLASSEMENT_SANS_SUITE: "ENQUETE",
  INFORMATION_JUDICIAIRE: "INSTRUCTION",
  TEMOIN_ASSISTE: "INSTRUCTION",
  MISE_EN_EXAMEN: "INSTRUCTION",
  CONTROLE_JUDICIAIRE: "INSTRUCTION",
  DETENTION_PROVISOIRE: "INSTRUCTION",
  NON_LIEU: "INSTRUCTION",
  RENVOI_TRIBUNAL: "INSTRUCTION",
  CONVOCATION_TRIBUNAL: "JUGEMENT",
  COMPARUTION_IMMEDIATE: "JUGEMENT",
  CRPC: "JUGEMENT",
  PROCES: "JUGEMENT",
  JUGEMENT: "JUGEMENT",
  APPEL: "APPEL",
  PROCES_APPEL: "APPEL",
  ARRET_APPEL: "APPEL",
  POURVOI_CASSATION: "CASSATION",
  ARRET_CASSATION: "CASSATION",
  REQUISITOIRE: "INHERIT",
  RENVOI_AUDIENCE: "INHERIT",
  DECISION_DEFINITIVE: "INHERIT",
  PRESCRIPTION: "INHERIT",
  AUTRE: "INHERIT",
  CONDAMNATION: "INHERIT",
  RELAXE: "INHERIT",
  ACQUITTEMENT: "INHERIT",
  FAITS: null,
  REVELATION: null,
};

export const STATUS_PHASE: Record<AffairStatus, Phase | null> = {
  ENQUETE_PRELIMINAIRE: "ENQUETE",
  INSTRUCTION: "INSTRUCTION",
  MISE_EN_EXAMEN: "INSTRUCTION",
  INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN: "INSTRUCTION",
  RENVOI_TRIBUNAL: "JUGEMENT",
  PROCES_EN_COURS: "JUGEMENT",
  CONDAMNATION_PREMIERE_INSTANCE: "JUGEMENT",
  // Final outcomes can be reached at any stage (a relaxe on appeal, a non-lieu after an
  // appeal of the chambre de l'instruction): the status alone does not say which phase ended.
  CLASSEMENT_SANS_SUITE: null,
  NON_LIEU: null,
  RELAXE: null,
  ACQUITTEMENT: null,
  APPEL_EN_COURS: "APPEL",
  POURVOI_EN_CASSATION: "CASSATION",
  CONDAMNATION_DEFINITIVE: null,
  PRESCRIPTION: null,
};

/**
 * Les étapes doivent arriver triées (`sortEvents`). Une étape `incidental` (recours sur un acte
 * de procédure) hérite de la phase précédente au lieu d'ouvrir Appel ou Cassation.
 */
export function buildPhaseTrail(
  events: readonly { type: AffairEventType; occurrence: EventOccurrence; incidental: boolean }[],
  status: AffairStatus
): { phase: Phase; current: boolean }[] {
  const phases: Phase[] = [];
  for (const e of events) {
    if (e.occurrence !== "HELD") continue;
    const own = e.incidental ? "INHERIT" : EVENT_TYPE_PHASE[e.type];
    if (own === null || own === "INHERIT") continue; // hériter = rester dans la phase en cours
    if (phases[phases.length - 1] !== own) phases.push(own);
  }

  const statusPhase = STATUS_PHASE[status];
  if (statusPhase !== null && phases[phases.length - 1] !== statusPhase) phases.push(statusPhase);
  if (phases.length < 2) return [];

  const last = phases.length - 1;
  return phases.map((phase, i) => ({ phase, current: i === last && phase === statusPhase }));
}
