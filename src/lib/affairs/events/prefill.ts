import type { AffairEventType, EventOutcome, EventSourceKind } from "@/generated/prisma";
import {
  AFFAIR_EVENT_TYPE_LABELS,
  EVENT_OUTCOME_LABELS,
  EVENT_SOURCE_KIND_LABELS,
  LEGACY_EVENT_TYPES,
} from "@/config/labels";

/** Valeurs préremplies du formulaire d'étape. La date n'en fait jamais partie. */
export type EventPrefill = {
  type: AffairEventType | null;
  outcome: EventOutcome | null;
  sourceUrl: string | null;
  sourceKind: EventSourceKind | null;
};

const PARAMS = { type: "etape", outcome: "issue", sourceUrl: "source", sourceKind: "nature" };

/** Lien vers la fiche admin, formulaire d'étape ouvert et prérempli. */
export function eventPrefillHref(affairId: string, prefill: EventPrefill): string {
  const query = new URLSearchParams({ [PARAMS.type]: prefill.type ?? "" });
  if (prefill.outcome) query.set(PARAMS.outcome, prefill.outcome);
  if (prefill.sourceUrl) query.set(PARAMS.sourceUrl, prefill.sourceUrl);
  if (prefill.sourceKind) query.set(PARAMS.sourceKind, prefill.sourceKind);
  return `/admin/affaires/${affairId}?${query.toString()}#etapes`;
}

function pick<T extends string>(value: unknown, allowed: Record<T, string>): T | null {
  return typeof value === "string" && Object.hasOwn(allowed, value) ? (value as T) : null;
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Relit les paramètres d'URL de la fiche admin. Toute valeur inconnue est ignorée : l'URL se
 * forge à la main, et le garde revalide tout à l'enregistrement. Null si le formulaire ne doit
 * pas s'ouvrir.
 */
export function parseEventPrefill(
  params: Record<string, string | string[] | undefined>
): EventPrefill | null {
  if (!(PARAMS.type in params)) return null;
  const type = pick<AffairEventType>(params[PARAMS.type], AFFAIR_EVENT_TYPE_LABELS);
  return {
    type: type && !LEGACY_EVENT_TYPES.includes(type) ? type : null,
    outcome: pick<EventOutcome>(params[PARAMS.outcome], EVENT_OUTCOME_LABELS),
    sourceUrl: httpsUrl(params[PARAMS.sourceUrl]),
    sourceKind: pick<EventSourceKind>(params[PARAMS.sourceKind], EVENT_SOURCE_KIND_LABELS),
  };
}
