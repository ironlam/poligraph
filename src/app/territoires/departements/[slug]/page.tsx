import { Metadata } from "next";
import { getDepartmentBySlug, getDepartmentSlug, DEPARTMENTS } from "@/config/departments";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { DepartementPageBody } from "./departement-page";
import { territoireDepartementPath } from "@/lib/territoires/paths";

export const revalidate = 3600; // ISR: revalidate every hour

// Every department is prerendered, so an unknown slug (including one reached through the 308 from
// /departements) is a plain 404 instead of a rendered "not found" page.
export const dynamicParams = false;

// Slugs come from the name, as getDepartmentBySlug resolves them: the keys of DEPARTMENTS are
// codes, and prerendering those produced one 404 per department.
export function generateStaticParams() {
  return Object.values(DEPARTMENTS).map(({ name }) => ({ slug: getDepartmentSlug(name) }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const dept = getDepartmentBySlug(slug);

  if (!dept) {
    return missingEntityMetadata("Département introuvable");
  }

  const { name } = dept;

  return {
    title: name,
    description: `Députés et sénateurs du département ${name}. Liste complète des représentants politiques.`,
    openGraph: {
      title: `${name} | Poligraph`,
      description: `Découvrez les députés et sénateurs du département ${name}.`,
    },
    alternates: {
      canonical: territoireDepartementPath(slug),
    },
  };
}

// The A to Z and pagination variants of the commune list (?lettre=, ?page=) are served by
// ./communes/[lettre]/[page] through the proxy rewrite: this route must never read searchParams.
export default async function DepartmentPage({ params }: PageProps) {
  const { slug } = await params;
  return <DepartementPageBody slug={slug} query={{ letter: null, page: 1 }} />;
}
