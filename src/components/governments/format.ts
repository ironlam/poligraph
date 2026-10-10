// Display helpers for the « Gouvernements » section. Pure, no directive: usable from server and
// client components. Dates are `YYYY-MM-DD` calendar days already resolved by the mapping layer,
// so they are formatted in UTC to avoid shifting them a second time.

import { formatDateFrUTC } from "@/lib/utils";
import type { Gender, GovernmentEpisode, PublishedGovernment } from "@/lib/governments/mapping";
import type { FunctionType } from "@/lib/governments/types";

/** « 1er janvier 2017 », « 7 janvier 2024 ». */
export function formatDay(day: string): string {
  return formatDateFrUTC(day).replace(/^1 /, "1er ");
}

/** « mai 2017 ». */
export function formatMonth(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * « Nommé le … » / « Nommée le … » from the person's civility. Unknown civility: « Nomination le … »
 * (no inclusive-writing fallback).
 */
export function appointedOn(gender: Gender, day: string, capitalize = true): string {
  const word = gender === "F" ? "nommée" : gender === "M" ? "nommé" : "nomination";
  const head = capitalize ? word.charAt(0).toUpperCase() + word.slice(1) : word;
  return `${head} le ${formatDay(day)}`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}

export function personsLabel(n: number): string {
  return plural(n, "personne", "personnes");
}

/**
 * Date range of one function. An unknown end is never written as an ongoing period: either the
 * last confirmation date or « fin de fonction non documentée ».
 */
export function episodeDates(
  ep: Pick<
    GovernmentEpisode,
    "start" | "end" | "endKind" | "currentAffairsEndedAt" | "lastConfirmedAt"
  >,
  gender: Gender,
  gov: Pick<PublishedGovernment, "currentAffairsAttested" | "resignedEvidence"> | undefined
): string {
  if (ep.end) {
    let text = `du ${formatDay(ep.start)} au ${formatDay(ep.end)}`;
    // Same rule as the composition: the regime must be attested by an act, resignation included.
    if (
      ep.endKind === "COLLECTIVE_RESIGNATION" &&
      ep.currentAffairsEndedAt &&
      gov?.currentAffairsAttested &&
      gov.resignedEvidence === "ACT"
    ) {
      text += `, puis affaires courantes jusqu'au ${formatDay(ep.currentAffairsEndedAt)}`;
    }
    return text;
  }
  const head = appointedOn(gender, ep.start);
  return ep.lastConfirmedAt
    ? `${head} ; fonction confirmée au ${formatDay(ep.lastConfirmedAt)}`
    : `${head} ; fin de fonction non documentée`;
}

export const FUNCTION_ORDER: FunctionType[] = [
  "PREMIER_MINISTRE",
  "MINISTRE",
  "MINISTRE_DELEGUE",
  "SECRETAIRE_ETAT",
];

export const FUNCTION_SECTION_LABEL: Record<FunctionType, string> = {
  PREMIER_MINISTRE: "Premier ministre",
  MINISTRE: "Ministres",
  MINISTRE_DELEGUE: "Ministres délégués",
  SECRETAIRE_ETAT: "Secrétaires d'État",
};

/** Participant count wording (§6): « documentées » only when the coverage is partial. */
export function participantsLabel(
  gov: Pick<PublishedGovernment, "participantCount" | "hiddenCount" | "completeness">
): string {
  const partial = gov.completeness === "PARTIAL" || gov.hiddenCount > 0;
  const n = gov.participantCount;
  return partial
    ? `au moins ${plural(n, "personne documentée", "personnes documentées")}`
    : `${personsLabel(n)} ${n > 1 ? "ont" : "a"} participé`;
}

export function isPartial(gov: Pick<PublishedGovernment, "completeness" | "hiddenCount">): boolean {
  return gov.completeness === "PARTIAL" || gov.hiddenCount > 0;
}

/**
 * Dates line of a government (2a, 2b). The team date is `formedAt`; when it differs from the
 * Prime Minister's appointment, both are named.
 */
export function governmentDatesLine(gov: PublishedGovernment): string {
  const pmHead =
    gov.primeMinister.gender === "F"
      ? "Première ministre nommée le"
      : gov.primeMinister.gender === "M"
        ? "Premier ministre nommé le"
        : "Nomination du Premier ministre le";
  const pm = `${pmHead} ${formatDay(gov.primeMinisterAppointedAt)}`;

  let line: string;
  if (!gov.formedAt) line = `${pm} ; date de l'équipe non documentée`;
  else if (gov.formedAt === gov.primeMinisterAppointedAt)
    line = `Nommé le ${formatDay(gov.formedAt)}`;
  else line = `${pm}, équipe nommée le ${formatDay(gov.formedAt)}`;

  if (gov.endedAt) {
    line += ` · fin des fonctions le ${formatDay(gov.endedAt)}`;
    if (gov.resignedAt && gov.resignedAt !== gov.endedAt) {
      line += `. Démission le ${formatDay(gov.resignedAt)}`;
      if (gov.currentAffairsAttested)
        line += `, affaires courantes jusqu'au ${formatDay(gov.endedAt)}`;
      line += ".";
    }
  } else if (gov.resignedAt) {
    line += ` · démission le ${formatDay(gov.resignedAt)}`;
  }
  return line;
}

/** Source URLs come from the database: only http(s) links are rendered as links. */
export function safeExternalUrl(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}
