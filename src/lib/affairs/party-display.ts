import { isValidPartyAtTime } from "./party-at-time-validation";

/**
 * Choose which party to show alongside a judicial affair.
 *
 * Rules:
 *   1. If `partyAtTime` is set, always use it (authoritative historical data).
 *   2. Otherwise, fall back to `currentParty` — but only when doing so is
 *      chronologically plausible. If the current party was founded AFTER the
 *      affair's factsDate, the fallback would mis-attribute (e.g. "Reconquête"
 *      on a 2009 Zemmour case). In that scenario we return an `unknown`
 *      marker so the UI can show a neutral "non renseigné" label instead of
 *      lying to the reader.
 *   3. If neither party is available at all, return `unknown`.
 *
 * Keeps the affair visible (per the editorial rule: information is important)
 * while refusing to invent a party affiliation that cannot be true.
 */

export interface PartyDisplayRef {
  id: string;
  slug?: string | null;
  shortName: string;
  name: string;
  color?: string | null;
  foundedDate?: Date | null;
}

export type AffairPartyDisplay =
  | { kind: "at-time"; party: PartyDisplayRef; sameAsCurrent: boolean }
  | { kind: "current"; party: PartyDisplayRef }
  | {
      kind: "unknown";
      reason: "pre-dates-current-party" | "no-data";
      currentPartyName?: string;
      currentPartyFoundedDate?: Date | null;
    };

export function getAffairPartyDisplay(args: {
  factsDate: Date | null;
  partyAtTime: PartyDisplayRef | null;
  currentParty: PartyDisplayRef | null;
}): AffairPartyDisplay {
  const { factsDate, partyAtTime, currentParty } = args;

  if (partyAtTime) {
    return {
      kind: "at-time",
      party: partyAtTime,
      sameAsCurrent: currentParty?.id === partyAtTime.id,
    };
  }

  if (!currentParty) {
    return { kind: "unknown", reason: "no-data" };
  }

  const fallbackValid = isValidPartyAtTime({
    factsDate,
    partyFoundedDate: currentParty.foundedDate ?? null,
  });

  if (fallbackValid) {
    return { kind: "current", party: currentParty };
  }

  return {
    kind: "unknown",
    reason: "pre-dates-current-party",
    currentPartyName: currentParty.name,
    currentPartyFoundedDate: currentParty.foundedDate ?? null,
  };
}
