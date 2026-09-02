import { cache } from "react";
import { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { db } from "@/lib/db";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarkdownText } from "@/components/ui/markdown";
import {
  StatusBadge,
  CategoryBadge,
  DossierTimeline,
  DossierAuthors,
  DossierVotesList,
  DossierAmendments,
} from "@/components/legislation";
import type { DossierTimelineEntry } from "@/types/legislation";
import { getAmendmentStats, getCuratedAmendments } from "@/lib/data/dossier-amendments";

import { ExternalLink, Calendar, Vote } from "lucide-react";
import { LegislationJsonLd } from "@/components/seo/JsonLd";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SITE_URL } from "@/config/site";
import { formatDate } from "@/lib/utils";
import type { MandateType } from "@/generated/prisma";

export const revalidate = 86400; // ISR: 24h backstop; real changes propagate on-demand via revalidateTag

export async function generateStaticParams() {
  const dossiers = await db.legislativeDossier.findMany({
    select: { slug: true },
    orderBy: { filingDate: "desc" },
    take: 50,
  });
  return dossiers.map((d) => ({ slug: d.slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

const includeOptions = {
  authors: {
    select: {
      role: true,
      chamber: true,
      commission: true,
      politician: {
        select: {
          slug: true,
          fullName: true,
          photoUrl: true,
          civility: true,
          currentParty: { select: { shortName: true, color: true } },
          mandates: {
            where: {
              type: { in: ["DEPUTE", "SENATEUR"] as MandateType[] },
              parliamentaryData: { isNot: null },
            },
            orderBy: { startDate: "desc" as const },
            take: 1,
            select: {
              parliamentaryData: {
                select: {
                  parliamentaryGroup: {
                    select: { code: true, name: true, shortName: true, color: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  scrutins: {
    select: {
      slug: true,
      title: true,
      votingDate: true,
      result: true,
      votesFor: true,
      votesAgainst: true,
      votesAbstain: true,
      type: true,
    },
    orderBy: { votingDate: "desc" },
  },
} as const;

/**
 * Get dossier with redirect support for legacy URLs
 * Returns { dossier, redirect } where redirect is the slug to redirect to
 */
const getDossierWithRedirect = cache(async function getDossierWithRedirect(slugOrId: string) {
  // 1. Try by slug first (canonical URL - most common case)
  let dossier = await db.legislativeDossier.findUnique({
    where: { slug: slugOrId },
    include: includeOptions,
  });
  if (dossier) {
    return { dossier, redirect: null };
  }

  // 2. Try by internal ID (CUID) - legacy URL
  dossier = await db.legislativeDossier.findUnique({
    where: { id: slugOrId },
    include: includeOptions,
  });
  if (dossier) {
    return { dossier, redirect: dossier.slug };
  }

  // 3. Try by externalId (e.g., DLR5L17N12345) - legacy URL
  dossier = await db.legislativeDossier.findUnique({
    where: { externalId: slugOrId },
    include: includeOptions,
  });
  if (dossier) {
    return { dossier, redirect: dossier.slug };
  }

  // 4. Try by exact number (e.g., "PPL 3196") - legacy URL
  dossier = await db.legislativeDossier.findFirst({
    where: { number: slugOrId },
    include: includeOptions,
  });
  if (dossier) {
    return { dossier, redirect: dossier.slug };
  }

  // 5. Try by partial number match (e.g., "3196" matches "PPL 3196") - legacy URL
  // This handles cases where the chatbot extracts just the numeric part
  if (/^\d+$/.test(slugOrId)) {
    dossier = await db.legislativeDossier.findFirst({
      where: {
        number: { endsWith: slugOrId },
      },
      include: includeOptions,
    });
    if (dossier) {
      return { dossier, redirect: dossier.slug };
    }
  }

  return { dossier: null, redirect: null };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { dossier } = await getDossierWithRedirect(slug);

  if (!dossier) {
    return missingEntityMetadata("Dossier non trouvé");
  }

  return {
    title: dossier.title,
    description: dossier.summary || `Dossier législatif ${dossier.number || dossier.externalId}`,
    alternates: { canonical: `/parlement/dossiers/${dossier.slug}` },
  };
}

export default async function DossierDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const { dossier, redirect } = await getDossierWithRedirect(slug);

  // Redirect legacy URLs to canonical slug URL
  if (redirect && redirect !== slug) {
    permanentRedirect(`/parlement/dossiers/${redirect}`);
  }

  if (!dossier) {
    notFound();
  }

  // Curated amendments: stats + the first "adopted" page rendered server-side
  // (SEO / no-JS); the client component paginates and switches filters from there.
  const [amendmentStats, initialAmendments] = await Promise.all([
    getAmendmentStats(dossier.id),
    getCuratedAmendments(dossier.id, "adopted", 1),
  ]);

  return (
    <>
      <LegislationJsonLd
        name={dossier.shortTitle || dossier.title}
        description={dossier.summary || undefined}
        datePublished={dossier.filingDate?.toISOString().split("T")[0]}
        legislationIdentifier={dossier.number || dossier.externalId}
        url={`${SITE_URL}/parlement/dossiers/${dossier.slug || dossier.externalId}`}
      />
      <div className="container mx-auto px-4 pt-4 pb-8">
        <Breadcrumb
          items={[
            { label: "Parlement", href: "/parlement" },
            { label: "Dossiers législatifs", href: "/parlement/dossiers" },
            { label: dossier.shortTitle || dossier.title },
          ]}
        />

        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {dossier.number && (
              <Badge variant="secondary" className="font-mono text-base">
                {dossier.number}
              </Badge>
            )}
            <StatusBadge status={dossier.status} showIcon />
            <CategoryBadge category={dossier.category} theme={dossier.theme} />
          </div>

          <h1 className="text-2xl md:text-3xl font-display font-extrabold tracking-tight mb-4">
            {dossier.title}
          </h1>

          {/* Dates */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {dossier.filingDate && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Déposé le {formatDate(dossier.filingDate)}
              </div>
            )}
            {dossier.adoptionDate && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Adopté le {formatDate(dossier.adoptionDate)}
              </div>
            )}
          </div>
        </div>

        {/* Summary */}
        {dossier.summary && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-lg">En bref</CardTitle>
            </CardHeader>
            <CardContent>
              <MarkdownText className="text-foreground">{dossier.summary}</MarkdownText>
              {dossier.summaryDate && (
                <p className="text-xs text-muted-foreground mt-4">
                  Résumé généré le {formatDate(dossier.summaryDate)}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Authors */}
        <DossierAuthors authors={dossier.authors} />

        {/* Legislative Timeline */}
        <div className="mb-8">
          <DossierTimeline
            entries={(dossier.timeline as unknown as DossierTimelineEntry[]) ?? []}
          />
        </div>

        {/* Related votes */}
        {dossier.scrutins.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Vote className="h-5 w-5" />
                Votes liés ({dossier.scrutins.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DossierVotesList votes={dossier.scrutins} />
            </CardContent>
          </Card>
        )}

        {/* Amendments */}
        {amendmentStats.total > 0 && (
          <DossierAmendments
            dossierId={dossier.id}
            stats={amendmentStats}
            sourceUrl={dossier.sourceUrl}
            initial={initialAmendments}
          />
        )}

        {/* External link */}
        {dossier.sourceUrl && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium mb-1">Consulter le dossier complet</h3>
                  <p className="text-sm text-muted-foreground">
                    Retrouvez tous les détails sur le site de l&apos;Assemblée nationale
                  </p>
                </div>
                <a
                  href={dossier.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Voir sur AN.fr
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info */}
        <p className="text-xs text-muted-foreground mt-8 text-center">
          Données issues du portail Open Data de l&apos;Assemblée nationale
          (data.assemblee-nationale.fr)
        </p>
      </div>
    </>
  );
}
