import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BudgetPage } from "@/components/territoires/BudgetPage";
import { REGIONS } from "@/config/regions";
import { getComptesTerritoire } from "@/lib/data/territoire-comptes";
import { getRapportsCrcTerritoire } from "@/lib/data/territoire-fil";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { openGraph } from "@/lib/seo/open-graph";
import { territoireBudgetRobotsMetadata } from "@/lib/seo/territoire-robots";
import { TERRITOIRES_OG_IMAGE } from "@/lib/territoires/og-image";
import { territoireRegionBudgetPath, territoireRegionPath } from "@/lib/territoires/paths";

// ISR: 24 h backstop, like the accounts reader (`synced`); a publication sets no tag.
export const revalidate = 86400;

export function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** The region and its published accounts; null while either is missing (a 404). */
const loadBudget = cache(async (slug: string) => {
  const region = REGIONS.find((r) => r.slug === slug);
  if (!region) return null;
  const comptes = await getComptesTerritoire("REG", region.code);
  return comptes.dernierExercice === null
    ? null
    : { name: region.name, code: region.code, comptes };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadBudget(slug);
  if (!data) return missingEntityMetadata("Comptes introuvables");
  const title = `${data.name} : comptes de la région`;
  const description = `Dépenses, dette et épargne de la région ${data.name}, exercice par exercice jusqu'en ${data.comptes.dernierExercice}, d'après les comptes publiés par l'OFGL.`;
  return {
    title,
    description,
    ...territoireBudgetRobotsMetadata("REG", data.code),
    openGraph: openGraph({ title, description, images: [TERRITOIRES_OG_IMAGE] }),
    alternates: { canonical: territoireRegionBudgetPath(slug) },
  };
}

export default async function RegionBudgetPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await loadBudget(slug);
  if (!data) notFound();
  const rapports = await getRapportsCrcTerritoire("REG", data.code);
  return (
    <BudgetPage
      retour={{ label: data.name, href: territoireRegionPath(slug) }}
      titre={`Les comptes de la région : ${data.name}`}
      comptes={data.comptes}
      scale="REG"
      rapports={rapports}
    />
  );
}
