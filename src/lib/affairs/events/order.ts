import type { AffairEventType } from "@/generated/prisma";

/**
 * Ordre canonique des types pour départager deux étapes du même jour (plainte avant enquête,
 * jugement avant appel). Explicite : l'ordre de déclaration de l'enum ne suit pas la procédure,
 * les types récents y ont été ajoutés à la fin.
 */
const CANONICAL_ORDER: readonly AffairEventType[] = [
  "FAITS",
  "PLAINTE",
  "REVELATION",
  "ENQUETE_PRELIMINAIRE",
  "PERQUISITION",
  "GARDE_A_VUE",
  "CLASSEMENT_SANS_SUITE",
  "INFORMATION_JUDICIAIRE",
  "TEMOIN_ASSISTE",
  "MISE_EN_EXAMEN",
  "CONTROLE_JUDICIAIRE",
  "DETENTION_PROVISOIRE",
  "NON_LIEU",
  "RENVOI_TRIBUNAL",
  "CONVOCATION_TRIBUNAL",
  "COMPARUTION_IMMEDIATE",
  "CRPC",
  "RENVOI_AUDIENCE",
  "PROCES",
  "REQUISITOIRE",
  "JUGEMENT",
  "CONDAMNATION",
  "RELAXE",
  "ACQUITTEMENT",
  "APPEL",
  "PROCES_APPEL",
  "ARRET_APPEL",
  "POURVOI_CASSATION",
  "ARRET_CASSATION",
  "DECISION_DEFINITIVE",
  "PRESCRIPTION",
  "AUTRE",
];

export const EVENT_TYPE_ORDER = Object.fromEntries(
  CANONICAL_ORDER.map((type, i) => [type, i])
) as Record<AffairEventType, number>;

/** Date croissante, puis ordre canonique du type ; stable à égalité. Ne modifie pas l'entrée. */
export function sortEvents<T extends { date: Date; type: AffairEventType }>(
  events: readonly T[]
): T[] {
  return [...events].sort(
    (a, b) =>
      a.date.getTime() - b.date.getTime() || EVENT_TYPE_ORDER[a.type] - EVENT_TYPE_ORDER[b.type]
  );
}
