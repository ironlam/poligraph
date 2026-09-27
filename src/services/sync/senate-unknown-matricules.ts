/**
 * Guard against attaching a newly elected senator to the wrong record.
 *
 * `syncSenator()` looks a senator up by Senate matricule, then falls back to the slug and
 * to an exact first name + last name match. After a renewal, the incoming senators have no
 * matricule on our side yet, and a homonym elsewhere in the base (a mayor, a former MP)
 * would receive the mandate, the party and the photo. Until the incoming senators are
 * mapped to their own election result, the sync refuses to write at all when the Senate
 * API lists a matricule we do not know.
 */

import { normalizeForMatching } from "@/lib/affair-matching/normalize";
import { FEHF_FEED_CODE } from "@/lib/senatoriales/results-feed";

export class UnknownSenateMatriculesError extends Error {
  constructor(readonly unknown: Array<{ matricule: string; name: string }>) {
    super(
      `${unknown.length} sénateur(s) inconnu(s) de la base, synchronisation interrompue avant ` +
        `toute écriture : ${unknown.map((s) => `${s.name} (${s.matricule})`).join(", ")}`
    );
    this.name = "UnknownSenateMatriculesError";
  }
}

export function findUnknownMatricules(
  apiMatricules: string[],
  knownMatricules: Set<string>
): string[] {
  return apiMatricules.filter((matricule) => !knownMatricules.has(matricule));
}

export function assertNoUnknownSenateMatricules(
  unknown: Array<{ matricule: string; name: string }>
): void {
  if (unknown.length > 0) throw new UnknownSenateMatriculesError(unknown);
}

export interface Elected2026 {
  politicianId: string | null;
  /** `Candidacy.candidateName`, as the Ministry spells it ("Marc LAMÉNIE"). */
  name: string;
  /** Ministry constituency code; `ZZ` for French citizens abroad. */
  constituencyCode: string;
  /** Whether `senatoriales:apply-mandates` already opened this person's 2026 term. */
  hasOpenedTerm: boolean;
}

export type MatriculeMapping = { politicianId: string } | { unresolved: true; reason: string };

/**
 * Map a matricule the base does not know to the person elected on 27 September 2026.
 *
 * Only inside the same constituency, only on full equality after normalisation, only when
 * exactly one elected person matches, and only once that person's 2026 term is open: a
 * sync running before the switch of mandates would create the mandate itself, with the
 * series fallback date of 2020 and the outgoing senators closed on the sync date.
 */
export function mapUnknownMatricule(
  api: { matricule: string; prenom: string; nom: string; departmentCode: string | null },
  elected2026: Elected2026[]
): MatriculeMapping {
  const code = api.departmentCode ?? FEHF_FEED_CODE;
  const target = normalizeForMatching(`${api.prenom} ${api.nom}`);
  const matches = elected2026.filter(
    (e) => e.constituencyCode === code && normalizeForMatching(e.name) === target
  );
  if (matches.length !== 1) {
    return { unresolved: true, reason: `${matches.length} élu(s) 2026 correspondant(s)` };
  }
  const match = matches[0]!;
  if (match.politicianId === null) {
    return { unresolved: true, reason: "élu 2026 sans fiche rattachée" };
  }
  if (!match.hasOpenedTerm) {
    return { unresolved: true, reason: "bascule des mandats 2026 non appliquée" };
  }
  return { politicianId: match.politicianId };
}

/**
 * What a Senate sync does with one senator's mandates.
 *
 * It updates the current Senate mandate, or creates one for someone who never held a seat.
 * It never reopens a closed Senate mandate: after the switch of 1 October, the 2020 terms of
 * the outgoing senators are closed, and a sync run while `senateurs.json` still lists them
 * would otherwise set them current again (and the same for someone returning to the Senate,
 * whose old term carries the same `senat-{matricule}`). Such a senator is skipped and reported.
 */
export type SenateMandateDecision<M> =
  | { kind: "update"; mandate: M }
  | { kind: "create" }
  | { kind: "skip" };

export function pickSenateMandateToUpdate<
  M extends { type: string; isCurrent: boolean; externalId: string | null },
>(mandates: M[], externalId: string): SenateMandateDecision<M> {
  const current = mandates.find((m) => m.type === "SENATEUR" && m.isCurrent);
  if (current) return { kind: "update", mandate: current };
  const closed = mandates.some((m) => m.type === "SENATEUR" || m.externalId === externalId);
  return closed ? { kind: "skip" } : { kind: "create" };
}

/** First day of the 2026 to 2032 term, as written by `senatoriales:apply-mandates`. */
export const SENATE_TERM_2026_START = new Date("2026-10-01T00:00:00Z");

/**
 * Whether a sync keeps the start date already stored on a mandate.
 *
 * Without an API date, always. With one, the API may correct a pre-2026 date (the series
 * fallback it was meant to replace), but not move a 2026 term back: `mandat_debut` comes from
 * a frozen archive and, for a re-elected senator, holds the start of an earlier term.
 */
export function keepExistingStartDate(existingStart: Date, apiStart: Date | null): boolean {
  if (apiStart === null) return true;
  return existingStart >= SENATE_TERM_2026_START && apiStart < existingStart;
}
