import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Barres,
  Bloc,
  Depliant,
  LIEN_LIGNE,
  Lignes,
  Pied,
  type Barre,
} from "@/components/parrainages/ParrainagesBlocs";
import { TerritoireBandeau } from "@/components/territoires/TerritoireBandeau";
import { getDepartmentSlug, getDepartmentName } from "@/config/departments";
import {
  PARRAINAGES_ELECTIONS,
  PLAFOND_PAR_DEPARTEMENT,
  SEUIL_DEPARTEMENTS,
  SEUIL_PRESENTATIONS,
  parrainagesCandidatPath,
  parrainagesDepartementPath,
  parrainagesPath,
} from "@/config/parrainages";
import { getParrainagesCandidat, getParrainagesCandidats } from "@/lib/data/parrainages";
import { formatNombre, phraseCandidat } from "@/lib/parrainages/gabarits";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/config/site";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { parrainagesCandidatRobotsMetadata } from "@/lib/seo/parrainages-robots";

export const revalidate = 86400;

/** Departments shown before the fold-out: the largest counts, where the cap is at stake. */
const DEPARTEMENTS_VISIBLES = 10;

// Every candidate of the list is prerendered, so an unknown slug is a plain 404 and not a rendered
// "not found" page answering 200. A candidate added by a later import needs a new build.
export const dynamicParams = false;

export async function generateStaticParams() {
  const lists = await Promise.all(
    Object.keys(PARRAINAGES_ELECTIONS).map(async (slug) =>
      (await getParrainagesCandidats(slug)).map((candidat) => ({ slug, candidat: candidat.slug }))
    )
  );
  return lists.flat();
}

interface PageProps {
  params: Promise<{ slug: string; candidat: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, candidat } = await params;
  const election = PARRAINAGES_ELECTIONS[slug];
  const detail = election ? await getParrainagesCandidat(slug, candidat) : null;
  if (!election || !detail) return missingEntityMetadata("Parrainages introuvables");
  const name = detail.candidat.candidateName;
  return {
    title: `Parrainages de ${name}, présidentielle ${election.annee}`,
    description: `${phraseCandidat(detail.candidat)} Liste publiée par le Conseil constitutionnel pour la présidentielle de ${election.annee}.`,
    alternates: { canonical: parrainagesCandidatPath(slug, candidat) },
    ...parrainagesCandidatRobotsMetadata(detail.candidat.total),
  };
}

export default async function ParrainagesCandidatPage({ params }: PageProps) {
  const { slug, candidat: candidatSlug } = await params;
  const election = PARRAINAGES_ELECTIONS[slug];
  if (!election) notFound();
  const detail = await getParrainagesCandidat(slug, candidatSlug);
  if (!detail) notFound();
  const { candidat } = detail;
  // The latest lines come first: the first one carries the candidate's last publication date.
  const miseAJour = detail.dernieres[0]?.publishedOn ?? null;
  // One scale for every department of the page: the cap stays at the same place on each bar.
  const echelle = Math.max(candidat.maxParDepartement, PLAFOND_PAR_DEPARTEMENT);
  const departements: Barre[] = detail.parDepartement.map((departement) => {
    const name = getDepartmentName(departement.code);
    return {
      cle: departement.label,
      label: departement.label,
      valeur: formatNombre(departement.total),
      part: (departement.total / echelle) * 100,
      pleine: true,
      repere: (PLAFOND_PAR_DEPARTEMENT / echelle) * 100,
      href: name ? parrainagesDepartementPath(slug, getDepartmentSlug(name)) : undefined,
    };
  });

  return (
    <>
      <TerritoireBandeau
        titreId="parrainages-candidat-titre"
        filAriane={[
          { label: election.titre, href: `/elections/${slug}` },
          { label: "Parrainages", href: parrainagesPath(slug) },
          { label: candidat.candidateName },
        ]}
        nom={candidat.candidateName}
        code={String(election.annee)}
        identite={`Parrainages · ${election.titre}`}
        phrase={[{ text: phraseCandidat(candidat) }]}
        faits={[
          {
            label: "Présentations publiées",
            valeur: formatNombre(candidat.total),
            legende: `présentations, ${formatNombre(SEUIL_PRESENTATIONS)} requises`,
            legendeCourte: `sur ${formatNombre(SEUIL_PRESENTATIONS)} requises`,
          },
          {
            label: "Départements ou collectivités",
            valeur: formatNombre(candidat.departements),
            legende: `départements ou collectivités, ${SEUIL_DEPARTEMENTS} requis`,
            legendeCourte: `départ., ${SEUIL_DEPARTEMENTS} requis`,
          },
          {
            label: "Plus grand nombre dans un département",
            valeur: formatNombre(candidat.maxParDepartement),
            legende: "au plus dans un même département",
            legendeCourte: "max. par départ.",
          },
        ]}
      />
      <div className="container mx-auto max-w-3xl space-y-5 px-4 py-5 sm:py-8">
        {candidat.politicianSlug && candidat.politicianName && (
          <p className="text-sm">
            <Link
              href={`/politiques/${candidat.politicianSlug}`}
              prefetch={false}
              className={LIEN_LIGNE}
            >
              Fiche de {candidat.politicianName} sur Poligraph
            </Link>
          </p>
        )}
        <Bloc titre="Par mandat" id="parrainages-mandats">
          <Barres
            barres={detail.parMandat.map((mandat) => ({
              cle: mandat.mandat,
              label: mandat.label,
              valeur: formatNombre(mandat.total),
              part: (mandat.total / candidat.total) * 100,
              pleine: true,
            }))}
          />
        </Bloc>
        <Bloc titre="Par département" id="parrainages-candidat-departements">
          <Barres barres={departements.slice(0, DEPARTEMENTS_VISIBLES)} />
          {departements.length > DEPARTEMENTS_VISIBLES && (
            <Depliant
              resume={`Les ${formatNombre(departements.length - DEPARTEMENTS_VISIBLES)} autres départements ou collectivités`}
            >
              <Barres barres={departements.slice(DEPARTEMENTS_VISIBLES)} />
            </Depliant>
          )}
          <p className="border-l-2 border-primary/20 pl-2 text-xs leading-relaxed text-muted-foreground">
            Le trait vertical marque le plafond légal : {PLAFOND_PAR_DEPARTEMENT} présentations par
            candidat dans un même département.
          </p>
        </Bloc>
        <Bloc titre="Dernières présentations publiées" id="parrainages-dernieres">
          <Lignes electionSlug={slug} lignes={detail.dernieres} avecCandidat={false} />
        </Bloc>
        <Pied electionSlug={slug} miseAJour={miseAJour} />
      </div>
      <CollectionPageJsonLd
        name={`Parrainages de ${candidat.candidateName}, présidentielle ${election.annee}`}
        description={phraseCandidat(candidat)}
        url={`${SITE_URL}${parrainagesCandidatPath(slug, candidat.slug)}`}
        numberOfItems={candidat.total}
        dateModified={miseAJour ?? undefined}
      />
    </>
  );
}
