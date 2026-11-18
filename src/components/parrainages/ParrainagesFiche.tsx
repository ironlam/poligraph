import Link from "next/link";
import { Pied } from "@/components/parrainages/ParrainagesBlocs";
import { PARRAINAGES_ELECTIONS, parrainagesCandidatPath } from "@/config/parrainages";
import type {
  ProfileParrainage,
  ProfileParrainagesRecus,
} from "@/lib/data/politician-profile-reads";
import { phraseFiche, phraseRecues } from "@/lib/parrainages/gabarits";
import { generateSlug } from "@/lib/utils";

/**
 * Presidential presentations on a politician profile. Rendered only for a person whose link to a
 * published presentation was established; nothing at all otherwise.
 */
export function ParrainagesFiche({
  parrainages,
  recus,
}: {
  parrainages?: ProfileParrainage[];
  /** Presentations received as a candidate, one count per election. */
  recus?: ProfileParrainagesRecus[];
}) {
  const lignes = (parrainages ?? []).filter((p) => PARRAINAGES_ELECTIONS[p.electionSlug]);
  const comptes = (recus ?? []).filter((r) => PARRAINAGES_ELECTIONS[r.electionSlug]);
  if (!lignes.length && !comptes.length) return null;
  const premiere = (comptes[0] ?? lignes[0])!.electionSlug;
  return (
    <section
      id="parrainages"
      aria-labelledby="parrainages-titre"
      className="mt-8 space-y-3 rounded-lg border bg-card p-4 sm:p-6"
    >
      <h2 id="parrainages-titre" className="font-display text-lg font-bold">
        Parrainages présidentiels
      </h2>
      <ul className="space-y-2">
        {comptes.map((compte) => {
          const phrase = phraseRecues({
            ...compte,
            annee: PARRAINAGES_ELECTIONS[compte.electionSlug]!.annee,
          });
          return (
            <li key={`recu-${compte.electionSlug}-${compte.candidateName}`}>
              {phrase.avant}
              <Link
                href={parrainagesCandidatPath(
                  compte.electionSlug,
                  generateSlug(compte.candidateName)
                )}
                prefetch={false}
                className="py-3 font-semibold underline underline-offset-2 hover:text-primary"
              >
                {phrase.lien}
              </Link>
              {phrase.apres}
            </li>
          );
        })}
        {lignes.map((ligne) => {
          const phrase = phraseFiche({
            ...ligne,
            annee: PARRAINAGES_ELECTIONS[ligne.electionSlug]!.annee,
          });
          return (
            <li key={`${ligne.electionSlug}-${ligne.candidateName}-${ligne.publishedOn}`}>
              {phrase.avant}
              <Link
                href={parrainagesCandidatPath(
                  ligne.electionSlug,
                  generateSlug(ligne.candidateName)
                )}
                prefetch={false}
                className="py-3 font-semibold underline underline-offset-2 hover:text-primary"
              >
                {phrase.candidat}
              </Link>
              {phrase.apres}
            </li>
          );
        })}
      </ul>
      <Pied electionSlug={premiere} />
    </section>
  );
}
