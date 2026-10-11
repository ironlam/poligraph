import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDepartmentBySlug } from "@/config/departments";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { listingRobotsMetadata } from "@/lib/seo/listing-robots";
import { parseCommuneListSegments } from "@/lib/territoires/departement-communes";
import { DepartementPageBody } from "../../../departement-page";
import { territoireDepartementPath } from "@/lib/territoires/paths";

/**
 * Internal target of `/territoires/departements/<slug>?lettre=<A-Z>&page=<n>` (rewritten by src/proxy.ts).
 * One ISR entry per view of the list, rendered on demand: nothing is prerendered at build.
 * A day rather than the parent's hour: these slices are many, rarely visited, and refreshed by
 * the same cache tags as the bare page.
 */
export const revalidate = 86400;

export function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ slug: string; lettre: string; page: string }>;
}

/** "Eure : communes en E, page 2". Every variant is noindex,follow, canonical to the bare page. */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, lettre, page } = await params;
  const dept = getDepartmentBySlug(slug);
  const query = parseCommuneListSegments(lettre, page);
  if (!dept || !query) return missingEntityMetadata("Département introuvable");

  const parts = [
    query.letter ? `communes en ${query.letter}` : "communes",
    ...(query.page > 1 ? [`page ${query.page}`] : []),
  ];
  return {
    title: `${dept.name} : ${parts.join(", ")}`,
    description: `Communes du département ${dept.name}, par ordre alphabétique.`,
    alternates: { canonical: territoireDepartementPath(slug) },
    ...listingRobotsMetadata(true),
  };
}

export default async function DepartementCommunesPage({ params }: PageProps) {
  const { slug, lettre, page } = await params;
  const query = parseCommuneListSegments(lettre, page);
  if (!query) notFound();
  return <DepartementPageBody slug={slug} query={query} />;
}
