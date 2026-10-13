import { Metadata } from "next";
import { ParlementHub } from "@/components/parlement";
import { getHubStats } from "@/lib/data/scrutins";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";

export const revalidate = 300;

// /parlement is a pure hub. The legacy /parlement?<filters> listing is
// canonicalized to /parlement/votes by middleware (HTTP 308), so this page never
// renders the scrutins listing and no longer reads searchParams.
export async function generateMetadata(): Promise<Metadata> {
  const stats = await getHubStats();
  return {
    title: "Le Parlement en données : scrutins et lois en construction",
    description: `Suivez les scrutins de l'Assemblée et du Sénat et les lois en construction : ${stats.totalScrutins.toLocaleString("fr-FR")} scrutins et ${stats.totalDossiers.toLocaleString("fr-FR")} dossiers législatifs suivis, à partir des données publiques.`,
    alternates: { canonical: "/parlement" },
  };
}

export default async function ParlementPage() {
  const stats = await getHubStats();

  return (
    <>
      <CollectionPageJsonLd
        name="Travail parlementaire"
        description="Suivez les scrutins et l'activité de l'Assemblée nationale et du Sénat."
        url="https://poligraph.fr/parlement"
        numberOfItems={stats.totalScrutins}
      />
      <ParlementHub />
    </>
  );
}
