import { cache } from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { RelationsClient } from "./RelationsClient";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { politicianRobotsMetadata } from "@/lib/seo/politician-robots";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { getPoliticianIndexSignals } from "@/lib/seo/politician-index-signals";

export const revalidate = 86400; // ISR: 24h backstop; real changes propagate on-demand via revalidateTag

export async function generateStaticParams() {
  const politicians = await db.politician.findMany({
    select: { slug: true },
    orderBy: { prominenceScore: "desc" },
    take: 50,
  });
  return politicians.map((p) => ({ slug: p.slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

const getPoliticianBasic = cache(async function getPoliticianBasic(slug: string) {
  return db.politician.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      fullName: true,
      photoUrl: true,
      currentParty: {
        select: { shortName: true, color: true },
      },
    },
  });
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const [politician, signals] = await Promise.all([
    getPoliticianBasic(slug),
    getPoliticianIndexSignals(slug),
  ]);

  if (!politician) {
    return missingEntityMetadata("Non trouvé");
  }

  return {
    title: `Relations de ${politician.fullName}`,
    description: `Découvrez les relations politiques de ${politician.fullName} : gouvernement, entreprises, département, parcours partisan.`,
    // Same gate as the profile: a bare RNE-imported mayor has no relations to
    // show, so the tab must not be a second crawlable URL for a noindexed
    // profile (issue #385).
    ...(signals ? politicianRobotsMetadata(signals) : {}),
    alternates: { canonical: `/politiques/${slug}/relations` },
  };
}

export default async function RelationsPage({ params }: PageProps) {
  const { slug } = await params;

  const politician = await getPoliticianBasic(slug);

  if (!politician) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 pt-4 pb-8">
      <Breadcrumb
        items={[
          { label: "Politiques", href: "/politiques" },
          { label: politician.fullName, href: `/politiques/${slug}` },
          { label: "Relations" },
        ]}
      />

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-display font-extrabold tracking-tight mb-2">
          Relations de {politician.fullName}
        </h1>
        <p className="text-muted-foreground">
          Visualisez les connexions politiques : gouvernement, entreprises en commun, département,
          parcours partisan
        </p>
      </div>

      {/* Client component with graph */}
      <RelationsClient slug={slug} politicianName={politician.fullName} />
    </div>
  );
}
