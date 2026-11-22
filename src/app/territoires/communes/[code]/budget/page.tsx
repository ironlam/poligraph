import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BudgetPage } from "@/components/territoires/BudgetPage";
import { getCommuneDossier } from "@/lib/data/territoires";
import { getComptesTerritoire } from "@/lib/data/territoire-comptes";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { openGraph } from "@/lib/seo/open-graph";
import { TERRITOIRE_BUDGET_ROBOTS } from "@/lib/seo/territoire-robots";
import { TERRITOIRES_OG_IMAGE } from "@/lib/territoires/og-image";
import {
  communeCodeFromSegment,
  isCommuneSegment,
  territoireCommuneBudgetPath,
  territoireCommunePath,
} from "@/lib/territoires/paths";

// ISR: 24 h backstop, like the accounts reader (`synced`); a publication sets no tag.
export const revalidate = 86400;

export function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ code: string }>;
}

/** The commune and its published accounts; null while either is missing (a 404, never a shell). */
const loadBudget = cache(async (segment: string) => {
  const code = communeCodeFromSegment(segment);
  if (!code) return null;
  const [dossier, comptes] = await Promise.all([
    getCommuneDossier(code),
    getComptesTerritoire("COM", code),
  ]);
  if (!dossier || !isCommuneSegment(segment, code, dossier.identity.name)) return null;
  if (comptes.dernierExercice === null) return null;
  return { name: dossier.identity.name, code, comptes };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const data = await loadBudget(code);
  if (!data) return missingEntityMetadata("Comptes introuvables");
  const title = `${data.name} : comptes de la commune`;
  const description = `Dépenses, dette et épargne de la commune de ${data.name}, exercice par exercice jusqu'en ${data.comptes.dernierExercice}, d'après les comptes publiés par l'OFGL.`;
  return {
    title,
    description,
    ...TERRITOIRE_BUDGET_ROBOTS,
    openGraph: openGraph({ title, description, images: [TERRITOIRES_OG_IMAGE] }),
    alternates: { canonical: territoireCommuneBudgetPath(data.code, data.name) },
  };
}

export default async function CommuneBudgetPage({ params }: PageProps) {
  const { code } = await params;
  const data = await loadBudget(code);
  if (!data) notFound();
  return (
    <BudgetPage
      retour={{ label: data.name, href: territoireCommunePath(data.code, data.name) }}
      titre={`Les comptes de la commune de ${data.name}`}
      comptes={data.comptes}
      scale="COM"
    />
  );
}
