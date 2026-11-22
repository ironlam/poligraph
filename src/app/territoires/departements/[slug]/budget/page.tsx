import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BudgetPage } from "@/components/territoires/BudgetPage";
import { getDepartmentBySlug } from "@/config/departments";
import { getComptesTerritoire } from "@/lib/data/territoire-comptes";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { openGraph } from "@/lib/seo/open-graph";
import { territoireBudgetRobotsMetadata } from "@/lib/seo/territoire-robots";
import { TERRITOIRES_OG_IMAGE } from "@/lib/territoires/og-image";
import {
  territoireDepartementBudgetPath,
  territoireDepartementPath,
} from "@/lib/territoires/paths";

// ISR: 24 h backstop, like the accounts reader (`synced`); a publication sets no tag.
export const revalidate = 86400;

export function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** The department and its published accounts; null while either is missing (a 404). */
const loadBudget = cache(async (slug: string) => {
  const dept = getDepartmentBySlug(slug);
  if (!dept) return null;
  const comptes = await getComptesTerritoire("DEP", dept.code);
  return comptes.dernierExercice === null ? null : { name: dept.name, code: dept.code, comptes };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadBudget(slug);
  if (!data) return missingEntityMetadata("Comptes introuvables");
  const title = `${data.name} : comptes du département`;
  const description = `Dépenses, dette et épargne du département ${data.name}, exercice par exercice jusqu'en ${data.comptes.dernierExercice}, d'après les comptes publiés par l'OFGL.`;
  return {
    title,
    description,
    ...territoireBudgetRobotsMetadata("DEP", data.code),
    openGraph: openGraph({ title, description, images: [TERRITOIRES_OG_IMAGE] }),
    alternates: { canonical: territoireDepartementBudgetPath(slug) },
  };
}

export default async function DepartementBudgetPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await loadBudget(slug);
  if (!data) notFound();
  return (
    <BudgetPage
      retour={{ label: data.name, href: territoireDepartementPath(slug) }}
      titre={`Les comptes du département : ${data.name}`}
      comptes={data.comptes}
      scale="DEP"
    />
  );
}
