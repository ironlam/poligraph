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
