import Link from "next/link";
import { Pied } from "@/components/parrainages/ParrainagesBlocs";
import { PARRAINAGES_ELECTIONS, parrainagesCandidatPath } from "@/config/parrainages";
import type { ProfileParrainage } from "@/lib/data/politician-profile-reads";
import { phraseFiche } from "@/lib/parrainages/gabarits";
import { generateSlug } from "@/lib/utils";

/**
 * Presidential presentations on a politician profile. Rendered only for a person whose link to a
 * published presentation was established; nothing at all otherwise.
 */
export function ParrainagesFiche({ parrainages }: { parrainages?: ProfileParrainage[] }) {
  const lignes = (parrainages ?? []).filter((p) => PARRAINAGES_ELECTIONS[p.electionSlug]);
  if (!lignes.length) return null;
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
      <Pied electionSlug={lignes[0]!.electionSlug} />
    </section>
  );
}
