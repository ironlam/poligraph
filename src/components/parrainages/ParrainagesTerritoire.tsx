import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { LIEN_LIGNE, Pied } from "@/components/parrainages/ParrainagesBlocs";
import {
  PARRAINAGES_ELECTIONS,
  parrainagesCandidatPath,
  parrainagesDepartementPath,
  parrainagesPath,
} from "@/config/parrainages";
import type { ParrainagesCommuneBloc, ParrainagesDepartementResume } from "@/lib/data/parrainages";
import {
  formatDatePublication,
  mandatPublie,
  nomElu,
  phraseDepartement,
  phraseTableauDeBord,
} from "@/lib/parrainages/gabarits";
import { generateSlug } from "@/lib/utils";
import { SECTION } from "@/components/territoires/classes";

/**
 * Presentation blocks of the Territoires pages. Each renders nothing when the territory has no
 * published presentation: the pages never say that an elected official presented nobody.
 */

const CARD = "scroll-mt-32 space-y-3 rounded-2xl border bg-card p-4 sm:p-6";
/** On a Territoires page the block follows the sections of that page: edge to edge on a phone. */
const CARD_TERRITOIRE = `space-y-3 ${SECTION}`;
const TITRE = "font-display text-xl font-extrabold text-primary sm:text-2xl";
const INLINE = "py-3 font-semibold underline underline-offset-2 hover:text-primary";

/** Commune page: one sentence per presentation, the commune written as published. */
export function ParrainagesCommune({ blocs }: { blocs: ParrainagesCommuneBloc[] }) {
  const known = blocs.filter((bloc) => PARRAINAGES_ELECTIONS[bloc.electionSlug]);
  if (!known.length) return null;
  // Rendered inside the Élections section of the commune page, which the "Élections" tab opens:
  // a sub-block under a rule, not a card of its own.
  return (
    <section
      id="parrainages"
      aria-labelledby="parrainages-titre"
      className="mt-5 scroll-mt-32 border-t pt-5"
    >
      <details className="group rounded-xl border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <h3 id="parrainages-titre" className="font-display text-lg font-bold text-primary">
            Parrainages présidentiels
          </h3>
          <ChevronDown
            className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <div className="space-y-3 border-t px-4 py-3">
          {known.map(({ electionSlug, lignes }) => (
            <div key={electionSlug} className="space-y-2">
              <h4 className="font-bold">{PARRAINAGES_ELECTIONS[electionSlug]!.titre}</h4>
              <ul className="space-y-2">
                {lignes.map((ligne) => (
                  <li key={ligne.id}>
                    {ligne.politicianSlug ? (
                      <Link
                        href={`/politiques/${ligne.politicianSlug}`}
                        prefetch={false}
                        className={INLINE}
                      >
                        {nomElu(ligne)}
                      </Link>
                    ) : (
                      <span className="font-semibold">{nomElu(ligne)}</span>
                    )}{" "}
                    ({mandatPublie(ligne)}) a présenté{" "}
                    <Link
                      href={parrainagesCandidatPath(
                        electionSlug,
                        generateSlug(ligne.candidateName)
                      )}
                      prefetch={false}
                      className={INLINE}
                    >
                      {ligne.candidateName}
                    </Link>{" "}
                    (publié le {formatDatePublication(ligne.publishedOn)}).
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <Pied electionSlug={known[0]!.electionSlug} />
        </div>
      </details>
    </section>
  );
}

/** Election page: what the list holds, and the way to its dashboard. */
export function ParrainagesElection({
  electionSlug,
  tableau,
}: {
  electionSlug: string;
  tableau: { total: number; candidats: readonly { total: number }[] };
}) {
  if (!PARRAINAGES_ELECTIONS[electionSlug] || tableau.candidats.length === 0) return null;
  return (
    <section id="parrainages" aria-labelledby="parrainages-titre" className={CARD}>
      <h2 id="parrainages-titre" className={TITRE}>
        Parrainages
      </h2>
      <p>{phraseTableauDeBord(tableau)}</p>
      <p>
        <Link href={parrainagesPath(electionSlug)} prefetch={false} className={LIEN_LIGNE}>
          Voir les présentations par candidat et par département
        </Link>
      </p>
      <Pied electionSlug={electionSlug} />
    </section>
  );
}

/** Department page: the counts, and the way to the page that lists the elected officials. */
export function ParrainagesDepartement({
  resumes,
  departmentSlug,
}: {
  resumes: ParrainagesDepartementResume[];
  departmentSlug: string;
}) {
  const known = resumes.filter((resume) => PARRAINAGES_ELECTIONS[resume.electionSlug]);
  if (!known.length) return null;
  return (
    <section id="parrainages" aria-labelledby="parrainages-titre" className={CARD_TERRITOIRE}>
      <h2 id="parrainages-titre" className={TITRE}>
        Parrainages présidentiels
      </h2>
      {known.map((resume) => (
        <div key={resume.electionSlug} className="space-y-1">
          <h3 className="font-bold">{PARRAINAGES_ELECTIONS[resume.electionSlug]!.titre}</h3>
          <p>{phraseDepartement(resume)}</p>
          <p>
            <Link
              href={parrainagesDepartementPath(resume.electionSlug, departmentSlug)}
              prefetch={false}
              className={LIEN_LIGNE}
            >
              Élus et candidats présentés en {PARRAINAGES_ELECTIONS[resume.electionSlug]!.annee}
            </Link>
          </p>
        </div>
      ))}
      <Pied electionSlug={known[0]!.electionSlug} />
    </section>
  );
}
