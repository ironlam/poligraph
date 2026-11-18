import Link from "next/link";
import { LIEN_LIGNE, MiseAJour } from "@/components/parrainages/ParrainagesBlocs";
import { BandeauFilAriane, RubriqueBandeau } from "@/components/ui/RubriqueBandeau";
import { PARRAINAGES_ELECTIONS, parrainagesPath } from "@/config/parrainages";
import { getParrainagesTableauDeBord } from "@/lib/data/parrainages";
import { formatDatePublication, phraseTableauDeBord } from "@/lib/parrainages/gabarits";

const LOI_URL =
  "https://www.conseil-constitutionnel.fr/fondements-textuels/loi-n-62-1292-du-6-novembre-1962-relative-a-l-election-du-president-de-la-republique-au-suffrage";

/**
 * Page of an election whose list is not published yet. It states what is known (the legal
 * deadline, the previous list) and nothing about dates the Conseil constitutionnel has not set.
 */
export async function ParrainagesAVenir({
  slug,
  election,
}: {
  slug: string;
  election: { annee: number; titre: string; precedente: string; verifieLe: string };
}) {
  const precedente = PARRAINAGES_ELECTIONS[election.precedente];
  const tableau = precedente ? await getParrainagesTableauDeBord(election.precedente) : null;

  return (
    <>
      <RubriqueBandeau labelledBy="parrainages-titre" contentClassName="max-w-3xl sm:py-8">
        <BandeauFilAriane
          items={[
            { label: "Élections", href: "/elections" },
            { label: election.titre, href: `/elections/${slug}` },
            { label: "Parrainages" },
          ]}
        />
        <h1
          id="parrainages-titre"
          className="font-display text-3xl font-extrabold tracking-tight sm:mt-2 md:text-5xl"
        >
          Parrainages
        </h1>
        <p className="mt-1 text-sm text-white/85">{election.titre}</p>
        <p className="mt-3 max-w-2xl sm:text-lg">
          Le Conseil constitutionnel n{"'"}a pas encore publié de présentation pour l{"'"}élection
          présidentielle de {election.annee}.
        </p>
      </RubriqueBandeau>
      <div className="container mx-auto max-w-3xl space-y-6 px-4 py-5 sm:py-8">
        <section aria-labelledby="a-venir-quand" className="space-y-2">
          <h2 id="a-venir-quand" className="font-display text-lg font-bold text-primary">
            Quand la liste sera-t-elle publiée ?
          </h2>
          <p>
            Les dates du recueil des présentations pour {election.annee} ne sont pas encore
            publiées. La loi fixe la date limite : les présentations doivent parvenir au Conseil
            constitutionnel au plus tard le sixième vendredi avant le premier tour, à 18 heures.
          </p>
          <p>
            Le Conseil publie ensuite les noms des élus au fil du recueil. Cette page les affichera
            dès la première publication.
          </p>
          <p className="text-sm">
            <a href={LOI_URL} target="_blank" rel="noopener noreferrer" className={LIEN_LIGNE}>
              Loi du 6 novembre 1962, article 3, sur le site du Conseil constitutionnel
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          </p>
        </section>
        {precedente && tableau && tableau.dernierePublication && (
          <section aria-labelledby="a-venir-precedente" className="space-y-2">
            <h2 id="a-venir-precedente" className="font-display text-lg font-bold text-primary">
              La liste de {precedente.annee}
            </h2>
            <p>
              {phraseTableauDeBord(tableau)} La dernière liste a été publiée le{" "}
              {formatDatePublication(tableau.dernierePublication)}.
            </p>
            <p>
              <Link
                href={parrainagesPath(election.precedente)}
                prefetch={false}
                className={LIEN_LIGNE}
              >
                Voir les parrainages de la présidentielle {precedente.annee}
              </Link>
            </p>
          </section>
        )}
        <MiseAJour iso={election.verifieLe} />
      </div>
    </>
  );
}
