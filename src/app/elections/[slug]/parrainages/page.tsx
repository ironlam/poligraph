import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidatsFiltrables } from "@/components/parrainages/CandidatsFiltrables";
import {
  BarreLigne,
  Bloc,
  Depliant,
  LIEN_LIGNE,
  Pied,
} from "@/components/parrainages/ParrainagesBlocs";
import { TerritoireBandeau } from "@/components/territoires/TerritoireBandeau";
import { getDepartmentName, getDepartmentSlug } from "@/config/departments";
import {
  PARRAINAGES_A_VENIR,
  PARRAINAGES_ELECTIONS,
  SEUIL_DEPARTEMENTS,
  SEUIL_PRESENTATIONS,
  parrainagesCandidatPath,
  parrainagesDepartementPath,
  parrainagesPath,
} from "@/config/parrainages";
import { getParrainagesTableauDeBord } from "@/lib/data/parrainages";
import {
  formatDatePublication,
  formatNombre,
  libelleDepartements,
  partDuSeuil,
  phraseTableauDeBord,
} from "@/lib/parrainages/gabarits";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/config/site";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { ParrainagesAVenir } from "./a-venir";

export const revalidate = 86400;

// Only the elections of the two tables of the config exist: any other slug is a plain 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return [...Object.keys(PARRAINAGES_ELECTIONS), ...Object.keys(PARRAINAGES_A_VENIR)].map(
    (slug) => ({ slug })
  );
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const election = PARRAINAGES_ELECTIONS[slug] ?? PARRAINAGES_A_VENIR[slug];
  if (!election) return missingEntityMetadata("Parrainages introuvables");
  if (slug in PARRAINAGES_A_VENIR) {
    return {
      title: `Parrainages de la présidentielle ${election.annee}`,
      description: `Le Conseil constitutionnel n'a pas encore publié de présentation pour l'élection présidentielle de ${election.annee}.`,
      alternates: { canonical: parrainagesPath(slug) },
      robots: { index: false, follow: true },
    };
  }
  return {
    title: `Parrainages de la présidentielle ${election.annee}`,
    description: `Les présentations d'élus publiées par le Conseil constitutionnel pour l'élection présidentielle de ${election.annee}, par candidat et par département.`,
    alternates: { canonical: parrainagesPath(slug) },
  };
}

export default async function ParrainagesPage({ params }: PageProps) {
  const { slug } = await params;
  const aVenir = PARRAINAGES_A_VENIR[slug];
  if (aVenir) return <ParrainagesAVenir slug={slug} election={aVenir} />;
  const election = PARRAINAGES_ELECTIONS[slug];
  if (!election) notFound();
  const tableau = await getParrainagesTableauDeBord(slug);
  if (!tableau.candidats.length) notFound();

  return (
    <>
      <TerritoireBandeau
        titreId="parrainages-titre"
        filAriane={[
          { label: "Élections", href: "/elections" },
          { label: election.titre, href: `/elections/${slug}` },
          { label: "Parrainages" },
        ]}
        nom="Parrainages"
        code={String(election.annee)}
        identite={`${election.titre} · présentations publiées par le Conseil constitutionnel`}
        phrase={[{ text: phraseTableauDeBord(tableau) }]}
        faits={[
          {
            label: "Présentations publiées",
            valeur: formatNombre(tableau.total),
            legende: "présentations",
          },
          {
            label: "Candidats présentés",
            valeur: formatNombre(tableau.candidats.length),
            legende: "candidats présentés",
            legendeCourte: "candidats",
          },
          {
            label: "Dernière publication",
            valeur: tableau.dernierePublication
              ? formatDatePublication(tableau.dernierePublication)
              : "Aucune",
            legende: "dernière publication",
            legendeCourte: "dernière liste",
          },
        ]}
      />
      <div className="container mx-auto max-w-3xl space-y-5 px-4 py-5 sm:py-8">
        <Bloc titre="Présentations par candidat" id="parrainages-candidats">
          <CandidatsFiltrables
            candidats={tableau.candidats.map((candidat) => ({
              cle: candidat.slug,
              nom: candidat.candidateName,
              ligne: (
                <BarreLigne
                  barre={{
                    cle: candidat.slug,
                    label: candidat.candidateName,
                    detail: libelleDepartements(candidat.departements),
                    valeur: formatNombre(candidat.total),
                    part: partDuSeuil(candidat.total),
                    pleine: candidat.total >= SEUIL_PRESENTATIONS,
                    href: parrainagesCandidatPath(slug, candidat.slug),
                  }}
                />
              ),
            }))}
          />
          <p className="border-l-2 border-primary/20 pl-2 text-xs leading-relaxed text-muted-foreground">
            La barre est pleine à {formatNombre(SEUIL_PRESENTATIONS)} présentations. La loi demande
            aussi des élus d{"'"}au moins {SEUIL_DEPARTEMENTS} départements ou collectivités d{"'"}
            outre-mer. Candidats classés par nombre de présentations, puis par ordre alphabétique.
          </p>
        </Bloc>
        <Bloc titre="Par département" id="parrainages-departements">
          <Depliant
            resume={`${libelleDepartements(tableau.departements.length)} avec au moins une présentation`}
          >
            <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {tableau.departements.flatMap((departement) => {
                const name = getDepartmentName(departement.code);
                if (!name) return [];
                return [
                  <li key={departement.code} className="flex items-baseline justify-between gap-3">
                    <Link
                      href={parrainagesDepartementPath(slug, getDepartmentSlug(name))}
                      prefetch={false}
                      className={`text-sm ${LIEN_LIGNE}`}
                    >
                      {name} ({departement.code})
                    </Link>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {formatNombre(departement.total)}
                    </span>
                  </li>,
                ];
              })}
            </ul>
          </Depliant>
        </Bloc>
        <Pied electionSlug={slug} miseAJour={tableau.dernierePublication} />
      </div>
      <CollectionPageJsonLd
        name={`Parrainages de la présidentielle ${election.annee}`}
        description={phraseTableauDeBord(tableau)}
        url={`${SITE_URL}${parrainagesPath(slug)}`}
        numberOfItems={tableau.candidats.length}
        dateModified={tableau.dernierePublication ?? undefined}
      />
    </>
  );
}
