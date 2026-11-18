import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  BarreLigne,
  Bloc,
  Depliant,
  LIEN_LIGNE,
  Lignes,
  Pied,
} from "@/components/parrainages/ParrainagesBlocs";
import { TerritoireBandeau } from "@/components/territoires/TerritoireBandeau";
import { DEPARTMENTS, getDepartmentBySlug, getDepartmentSlug } from "@/config/departments";
import {
  PARRAINAGES_ELECTIONS,
  PLAFOND_PAR_DEPARTEMENT,
  parrainagesCandidatPath,
  parrainagesDepartementPath,
  parrainagesPath,
} from "@/config/parrainages";
import { getParrainagesDepartement } from "@/lib/data/parrainages";
import { formatNombre, phraseDepartement } from "@/lib/parrainages/gabarits";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/config/site";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";

export const revalidate = 86400;

// Every department is prerendered, so an unknown slug is a plain 404. A department without any
// presentation is a 404 too, decided at build time.
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PARRAINAGES_ELECTIONS).flatMap((slug) =>
    Object.values(DEPARTMENTS).map(({ name }) => ({ slug, departement: getDepartmentSlug(name) }))
  );
}

interface PageProps {
  params: Promise<{ slug: string; departement: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, departement } = await params;
  const election = PARRAINAGES_ELECTIONS[slug];
  const dept = getDepartmentBySlug(departement);
  if (!election || !dept) return missingEntityMetadata("Parrainages introuvables");
  return {
    title: `Parrainages dans le département ${dept.name} (${dept.code}), présidentielle ${election.annee}`,
    description: `Les élus du département ${dept.name} qui ont présenté un candidat à la présidentielle de ${election.annee}, d'après la liste du Conseil constitutionnel.`,
    alternates: { canonical: parrainagesDepartementPath(slug, departement) },
    robots: { index: false, follow: true },
  };
}

export default async function ParrainagesDepartementPage({ params }: PageProps) {
  const { slug, departement } = await params;
  const election = PARRAINAGES_ELECTIONS[slug];
  const dept = getDepartmentBySlug(departement);
  if (!election || !dept) notFound();
  const data = await getParrainagesDepartement(slug, dept.code);
  if (!data.total) notFound();
  const miseAJour =
    data.lignes
      .map((ligne) => ligne.publishedOn)
      .sort()
      .at(-1) ?? null;

  return (
    <>
      <TerritoireBandeau
        titreId="parrainages-departement-titre"
        filAriane={[
          { label: election.titre, href: `/elections/${slug}` },
          { label: "Parrainages", href: parrainagesPath(slug) },
          { label: dept.name },
        ]}
        nom={dept.name}
        code={dept.code}
        identite={`Parrainages · ${election.titre} · département ${dept.code}`}
        phrase={[
          { text: phraseDepartement({ total: data.total, candidats: data.candidats.length }) },
        ]}
        faits={[
          {
            label: "Présentations publiées",
            valeur: formatNombre(data.total),
            legende: "présentations",
          },
          {
            label: "Candidats présentés",
            valeur: formatNombre(data.candidats.length),
            legende: "candidats présentés",
            legendeCourte: "candidats",
          },
          {
            label: "Plafond par candidat dans un département",
            valeur: String(PLAFOND_PAR_DEPARTEMENT),
            legende: "plafond légal par candidat",
            legendeCourte: "plafond légal",
          },
        ]}
      />
      <div className="container mx-auto max-w-3xl space-y-5 px-4 py-5 sm:py-8">
        <Bloc titre="Candidats présentés et élus" id="parrainages-departement-candidats">
          <ul className="divide-y">
            {data.candidats.map((candidat) => (
              <li key={candidat.slug}>
                <Depliant
                  resume={
                    <BarreLigne
                      barre={{
                        cle: candidat.slug,
                        label: candidat.candidateName,
                        valeur: formatNombre(candidat.total),
                        part: (candidat.total / PLAFOND_PAR_DEPARTEMENT) * 100,
                        pleine: true,
                      }}
                    />
                  }
                >
                  <Lignes
                    electionSlug={slug}
                    lignes={data.lignes.filter((l) => l.candidateName === candidat.candidateName)}
                    avecCandidat={false}
                  />
                  <p className="text-sm">
                    <Link
                      href={parrainagesCandidatPath(slug, candidat.slug)}
                      prefetch={false}
                      className={LIEN_LIGNE}
                    >
                      Toutes les présentations de {candidat.candidateName}
                    </Link>
                  </p>
                </Depliant>
              </li>
            ))}
          </ul>
          <p className="border-l-2 border-primary/20 pl-2 text-xs leading-relaxed text-muted-foreground">
            Échelle des barres : {PLAFOND_PAR_DEPARTEMENT}, le plafond légal par candidat dans un
            même département. Ouvrir une ligne pour lire les élus.
          </p>
        </Bloc>
        <Pied electionSlug={slug} miseAJour={miseAJour} />
      </div>
      <CollectionPageJsonLd
        name={`Parrainages dans le département ${dept.name}, présidentielle ${election.annee}`}
        description={phraseDepartement({ total: data.total, candidats: data.candidats.length })}
        url={`${SITE_URL}${parrainagesDepartementPath(slug, departement)}`}
        numberOfItems={data.total}
        dateModified={miseAJour ?? undefined}
      />
    </>
  );
}
