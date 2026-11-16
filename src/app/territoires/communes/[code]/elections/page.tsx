import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  CommuneElectionsBandeau,
  CommuneElectionsSections,
  scrutinTypeFromParam,
} from "@/components/territoires/CommuneElectionsPage";
import { getCommuneElections } from "@/lib/data/territoire-elections";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { territoireCommuneRobotsMetadata } from "@/lib/seo/territoire-robots";
import {
  communeCodeFromSegment,
  isCommuneSegment,
  territoireCommuneElectionsPath,
} from "@/lib/territoires/paths";

// ISR: 24 h backstop; results import refreshes `territoire:<code>` and `elections`.
// No generateStaticParams: the `type` filter reads searchParams (see AGENTS.md, ISR gotchas).
export const revalidate = 86400;

interface PageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ type?: string }>;
}

/** The segment is `brest-29019` or the bare code. The code finds the commune, a wrong name is a 404. */
const loadElections = cache(async (segment: string) => {
  const code = communeCodeFromSegment(segment);
  const data = code ? await getCommuneElections(code) : null;
  return data && isCommuneSegment(segment, code!, data.commune.name) ? data : null;
});

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const [{ code }, { type }] = await Promise.all([params, searchParams]);
  const data = await loadElections(code);
  // No result: the page does not exist, it is never an empty indexable shell.
  if (!data) return missingEntityMetadata("Élections introuvables");

  const title = `Élections à ${data.commune.name}`;
  const description = `Résultats des scrutins de ${data.commune.name} (municipales, présidentielle), sourcés, sans étiquette politique.`;
  const verdict = territoireCommuneRobotsMetadata(data.indexSignals);
  return {
    title,
    description,
    // A sub-page inherits the verdict of its commune page (AGENTS.md §5). A filtered view is a
    // subset of the same content: it never competes with the unfiltered page.
    robots: verdict.robots ?? (type ? { index: false, follow: true } : undefined),
    openGraph: { title, description },
    alternates: {
      canonical: territoireCommuneElectionsPath(data.commune.inseeCode, data.commune.name),
    },
  };
}

export default async function CommuneElectionsPage({ params, searchParams }: PageProps) {
  const [{ code }, { type }] = await Promise.all([params, searchParams]);
  const data = await loadElections(code);
  if (!data) notFound();

  return (
    <>
      <CommuneElectionsBandeau inseeCode={data.commune.inseeCode} name={data.commune.name} />
      <div className="container mx-auto max-w-6xl px-4 py-6 md:py-8">
        <CommuneElectionsSections data={data} active={scrutinTypeFromParam(type)} />
      </div>
    </>
  );
}
