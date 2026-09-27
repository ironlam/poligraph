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
 * Which existing mandate a Senate sync updates for one senator.
 *
 * The current Senate mandate first. Looking the `externalId` up first would pick a closed
 * mandate that carries the same `senat-{matricule}`, such as the 2020 term of a senator
 * re-elected in 2026, or the old term of someone returning to the Senate, and the update
 * (`isCurrent: true`) would reopen it next to the current one.
 */
export function pickSenateMandateToUpdate<
  M extends { type: string; isCurrent: boolean; externalId: string | null },
>(mandates: M[], externalId: string): M | undefined {
  return (
    mandates.find((m) => m.type === "SENATEUR" && m.isCurrent) ??
    mandates.find((m) => m.externalId === externalId)
  );
}
