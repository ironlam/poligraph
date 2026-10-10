// Display helpers for the « Gouvernements » section. Pure, no directive: usable from server and
// client components. Dates are `YYYY-MM-DD` calendar days already resolved by the mapping layer,
// so they are formatted in UTC to avoid shifting them a second time.

import { addDays, lastCaretakerDay } from "@/lib/governments/composition";
import { formatDateFrUTC } from "@/lib/utils";
import type { GovernmentEpisode, PublishedGovernment } from "@/lib/governments/mapping";
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

/** Neutral « Nomination le … » (no per-civility agreement). */
export function appointedOn(day: string): string {
  return `Nomination le ${formatDay(day)}`;
}

/**
 * Display form of a function title: « d'Etat » becomes « d'État » and the first letter is
 * uppercased. Other casing is left alone. Display only, never used for exports.
 */
export function displayTitle(title: string): string {
  const fixed = title.replace(/d(['\u2019])Etat/g, "d$1État");
  return fixed.charAt(0).toUpperCase() + fixed.slice(1);
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
  gov:
    | Pick<PublishedGovernment, "currentAffairsAttested" | "resignedEvidence" | "endedAt">
    | undefined
): string {
  if (ep.end) {
    let text = `du ${formatDay(ep.start)} au ${formatDay(ep.end)}`;
    const caretakerEnd = gov ? lastCaretakerDay(gov, ep) : null;
    if (caretakerEnd) text += `, puis affaires courantes jusqu'au ${formatDay(caretakerEnd)}`;
    return text;
  }
  const head = appointedOn(ep.start);
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
    const resignedFirst = gov.resignedAt && gov.resignedAt !== gov.endedAt;
    if (resignedFirst && !gov.currentAffairsAttested) {
      line += `. Démission le ${formatDay(gov.resignedAt!)}, remplacé le ${formatDay(gov.endedAt)}.`;
    } else {
      line += ` · fin des fonctions le ${formatDay(gov.endedAt)}`;
      if (resignedFirst) {
        line += `. Démission le ${formatDay(gov.resignedAt!)}, affaires courantes jusqu'au ${formatDay(addDays(gov.endedAt, -1))}.`;
      }
    }
  } else if (gov.resignedAt) {
    line += ` · démission le ${formatDay(gov.resignedAt)}`;
  }
  return line;
}

/**
 * Short period of a government for the directory cards: « Du 5 au 12 octobre 2025 », « Du 21
 * septembre au 23 décembre 2024 », « Du 6 décembre 2016 au 10 mai 2017 », or « Équipe nommée le
 * 12 octobre 2025 » while in office. The start is the team date, else the Prime Minister's
 * appointment. `null` when one of the government's dates is estimated (DERIVED): the card then
 * shows only its « Dates estimées » badge, never an estimate written as a fact. The full dates
 * line stays on the government page.
 */
export function governmentPeriod(
  gov: Pick<
    PublishedGovernment,
    | "formedAt"
    | "primeMinisterAppointedAt"
    | "endedAt"
    | "resignedAt"
    | "primeMinister"
    | "hasDerivedDate"
  >
): string | null {
  if (gov.hasDerivedDate) return null;
  if (gov.endedAt) {
    const start = gov.formedAt ?? gov.primeMinisterAppointedAt;
    const sameYear = start.slice(0, 4) === gov.endedAt.slice(0, 4);
    const sameMonth = start.slice(0, 7) === gov.endedAt.slice(0, 7);
    const from = sameMonth
      ? formatDay(start).split(" ")[0]!
      : sameYear
        ? formatDay(start).replace(/ \d{4}$/, "")
        : formatDay(start);
    return `Du ${from} au ${formatDay(gov.endedAt)}`;
  }
  let line: string;
  if (gov.formedAt) line = `Équipe nommée le ${formatDay(gov.formedAt)}`;
  else {
    const head =
      gov.primeMinister.gender === "F"
        ? "Première ministre nommée le"
        : gov.primeMinister.gender === "M"
          ? "Premier ministre nommé le"
          : "Nomination du Premier ministre le";
    line = `${head} ${formatDay(gov.primeMinisterAppointedAt)}`;
  }
  if (gov.resignedAt) line += `, démission le ${formatDay(gov.resignedAt)}`;
  return line;
}

/** Source URLs come from the database: only http(s) links are rendered as links. */
export function safeExternalUrl(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}
