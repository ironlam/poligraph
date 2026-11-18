import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LIEN_LIGNE, Pied } from "@/components/parrainages/ParrainagesBlocs";
import { BandeauFilAriane, RubriqueBandeau } from "@/components/ui/RubriqueBandeau";
import {
  PARRAINAGES_ELECTIONS,
  PLAFOND_PAR_DEPARTEMENT,
  SEUIL_DEPARTEMENTS,
  SEUIL_PRESENTATIONS,
  parrainagesMethodePath,
  parrainagesPath,
} from "@/config/parrainages";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";

export const revalidate = 86400;

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PARRAINAGES_ELECTIONS).map((slug) => ({ slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

const LOI_URL =
  "https://www.conseil-constitutionnel.fr/fondements-textuels/loi-n-62-1292-du-6-novembre-1962-relative-a-l-election-du-president-de-la-republique-au-suffrage";

/** Last time this page and the quoted law were checked. Change it with the text. */
const METHODE_MISE_A_JOUR = "2026-11-18";

/** Article 3, I of the law of 6 November 1962, quoted word for word. Read on 18 November 2026. */
const CITATION_LOI =
  "Une candidature ne peut être retenue que si, parmi les signataires de la présentation, figurent des élus d'au moins trente départements ou collectivités d'outre-mer, sans que plus d'un dixième d'entre eux puissent être les élus d'un même département ou d'une même collectivité d'outre-mer.";

const SECTIONS: { titre: string; paragraphes: string[] }[] = [
  {
    titre: "Ce que montrent les pages",
    paragraphes: [
      `Chaque candidat est comparé aux deux seuils de la loi : ${SEUIL_PRESENTATIONS} présentations et ${SEUIL_DEPARTEMENTS} départements ou collectivités. Les pages ne disent pas si une candidature a été retenue. Cette décision revient au Conseil constitutionnel, qui applique aussi la règle du dixième.`,
      `La liste publiée peut compter, pour un candidat, plus de ${PLAFOND_PAR_DEPARTEMENT} présentations dans un même département. Les pages affichent le nombre publié et marquent le plafond d'un trait sur la barre.`,
      "Tous les candidats ayant au moins une présentation apparaissent, sous le nom publié par le Conseil, classés par nombre de présentations puis par ordre alphabétique. La teinte est la même pour tous.",
    ],
  },
  {
    titre: "Ce qui est repris tel que publié",
    paragraphes: [
      "Le nom de l'élu, son mandat, sa circonscription, son département, le candidat présenté et la date de publication sont ceux du fichier. Poligraph ne les corrige pas.",
      "Les pages ne listent que des présentations publiées. Elles ne disent rien des élus qui ne figurent pas dans la liste.",
    ],
  },
  {
    titre: "Ce que Poligraph ajoute",
    paragraphes: [
      "Le fichier ne donne ni code de commune ni identifiant d'élu. La commune d'un maire est retrouvée par son nom exact dans son département. Si elle a fusionné ou changé de nom depuis, c'est le Code officiel géographique de l'INSEE qui donne la commune actuelle. Un nom ambigu ou introuvable reste sans lien.",
      "Un élu n'est relié à sa fiche Poligraph que si la base connaît son mandat, dans ce territoire, à la date de publication, sous le même nom et le même prénom. Les autres élus restent affichés tels que publiés.",
    ],
  },
];

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const election = PARRAINAGES_ELECTIONS[slug];
  if (!election) return missingEntityMetadata("Parrainages introuvables");
  return {
    title: `Parrainages de la présidentielle ${election.annee} : méthode`,
    description: `Source, règles de la loi et limites des pages de parrainages de la présidentielle de ${election.annee}.`,
    alternates: { canonical: parrainagesMethodePath(slug) },
    robots: { index: false, follow: true },
  };
}

export default async function ParrainagesMethodePage({ params }: PageProps) {
  const { slug } = await params;
  const election = PARRAINAGES_ELECTIONS[slug];
  if (!election) notFound();

  return (
    <>
      <RubriqueBandeau labelledBy="parrainages-methode-titre" contentClassName="max-w-3xl sm:py-8">
        <BandeauFilAriane
          items={[
            { label: election.titre, href: `/elections/${slug}` },
            { label: "Parrainages", href: parrainagesPath(slug) },
            { label: "Méthode" },
          ]}
        />
        <h1
          id="parrainages-methode-titre"
          className="font-display text-3xl font-extrabold tracking-tight sm:mt-2 md:text-5xl"
        >
          Méthode
        </h1>
        <p className="mt-1 text-sm text-white/85">Parrainages · {election.titre}</p>
      </RubriqueBandeau>
      <div className="container mx-auto max-w-3xl space-y-6 px-4 py-5 sm:py-8">
        <section aria-labelledby="methode-source" className="space-y-2">
          <h2 id="methode-source" className="font-display text-lg font-bold text-primary">
            La source
          </h2>
          <p>
            Le Conseil constitutionnel publie le nom des élus qui ont présenté un candidat, avec
            leur mandat et leur circonscription. Poligraph reprend la liste complète déposée sur{" "}
            <a
              href={election.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-primary"
            >
              data.gouv.fr
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
            .
          </p>
        </section>
        <section aria-labelledby="methode-loi" className="space-y-2">
          <h2 id="methode-loi" className="font-display text-lg font-bold text-primary">
            Ce que dit la loi
          </h2>
          <p>
            Un candidat doit être présenté par au moins cinq cents élus. La loi du 6 novembre 1962
            ajoute :
          </p>
          <blockquote className="border-l-2 border-primary/30 pl-3 text-sm">
            « {CITATION_LOI} »
          </blockquote>
          <p className="text-sm">
            <a href={LOI_URL} target="_blank" rel="noopener noreferrer" className={LIEN_LIGNE}>
              Loi du 6 novembre 1962, article 3, sur le site du Conseil constitutionnel
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          </p>
        </section>
        {SECTIONS.map((section, i) => (
          <section key={section.titre} aria-labelledby={`methode-${i}`} className="space-y-2">
            <h2 id={`methode-${i}`} className="font-display text-lg font-bold text-primary">
              {section.titre}
            </h2>
            {section.paragraphes.map((paragraphe) => (
              <p key={paragraphe}>{paragraphe}</p>
            ))}
          </section>
        ))}
        <p>
          <Link href={parrainagesPath(slug)} prefetch={false} className={LIEN_LIGNE}>
            Retour aux parrainages
          </Link>
        </p>
        <Pied
          electionSlug={slug}
          methode={false}
          miseAJour={METHODE_MISE_A_JOUR}
          precision="date de la dernière relecture du texte de loi"
        />
      </div>
    </>
  );
}
