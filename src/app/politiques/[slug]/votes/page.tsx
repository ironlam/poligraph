import { cache } from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SimplePagination } from "@/components/ui/SimplePagination";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { VoteStats, VotePositionBadge, VotingResultBadge } from "@/components/votes";
import { ScrutinTypeTabs } from "@/components/votes/ScrutinTypeTabs";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, ExternalLink, Info } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { feminizeRole, SCRUTIN_TYPE_LABELS, SCRUTIN_TYPE_COLORS } from "@/config/labels";
import { getPoliticianVotingStats } from "@/services/voteStats";
import type { ScrutinType } from "@/generated/prisma";
import type { Prisma } from "@/generated/prisma";

export const revalidate = 300; // ISR: revalidate every 5 minutes (paginated content)

const TYPE_TAB_MAP: Record<string, { type?: ScrutinType; excludeType?: ScrutinType }> = {
  votes: { excludeType: "AMENDEMENT" },
  amendements: { type: "AMENDEMENT" },
};

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
  searchParams: Promise<{ page?: string; type?: string }>;
}

const getPolitician = cache(async function getPolitician(slug: string) {
  return db.politician.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      fullName: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      civility: true,
      currentParty: true,
      mandates: {
        where: { isCurrent: true, role: { not: null } },
        select: { role: true, type: true },
      },
    },
  });
});

async function getVotes(
  politicianId: string,
  page: number,
  limit: number,
  typeFilter: { type?: ScrutinType; excludeType?: ScrutinType }
) {
  const skip = (page - 1) * limit;

  const scrutinWhere: Prisma.ScrutinWhereInput = {
    ...(typeFilter.type && { type: typeFilter.type }),
    ...(typeFilter.excludeType && { type: { not: typeFilter.excludeType } }),
  };
  const hasScrutinFilter = Object.keys(scrutinWhere).length > 0;

  const where: Prisma.VoteWhereInput = {
    politicianId,
    ...(hasScrutinFilter && { scrutin: scrutinWhere }),
  };

  const [votes, total, stats, totalAll, amendmentCount] = await Promise.all([
    db.vote.findMany({
      where,
      include: { scrutin: true },
      orderBy: { votingDate: "desc" },
      skip,
      take: limit,
    }),
    db.vote.count({ where }),
    getPoliticianVotingStats(politicianId),
    db.vote.count({ where: { politicianId } }),
    db.vote.count({ where: { politicianId, scrutin: { type: "AMENDEMENT" } } }),
  ]);

  return {
    votes,
    total,
    totalPages: Math.ceil(total / limit),
    stats,
    totalAll,
    amendmentCount,
    nonAmendmentCount: totalAll - amendmentCount,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const politician = await getPolitician(slug);

  if (!politician) {
    return { title: "Politicien non trouvé" };
  }

  return {
    title: `Votes de ${politician.fullName}`,
    description: `Historique complet des votes parlementaires de ${politician.fullName} à l'Assemblée nationale.`,
    alternates: { canonical: `/politiques/${slug}/votes` },
  };
}

export default async function PoliticianVotesPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || "1", 10));
  const limit = 20;
  const typeTab = sp.type || "votes";

  const politician = await getPolitician(slug);

  if (!politician) {
    notFound();
  }

  const typeFilter = TYPE_TAB_MAP[typeTab] ?? {};
  const { votes, total, totalPages, stats, totalAll, amendmentCount, nonAmendmentCount } =
    await getVotes(politician.id, page, limit, typeFilter);

  const buildUrl = (p: number, tabKey: string) => {
    const params = new URLSearchParams();
    if (tabKey && tabKey !== "votes") params.set("type", tabKey);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/politiques/${slug}/votes${qs ? `?${qs}` : ""}`;
  };

  const tabs = [
    {
      key: "votes",
      label: "Textes de loi",
      count: nonAmendmentCount,
      href: buildUrl(1, "votes"),
    },
    {
      key: "amendements",
      label: "Amendements",
      count: amendmentCount,
      href: buildUrl(1, "amendements"),
    },
    { key: "tous", label: "Tous", count: totalAll, href: buildUrl(1, "tous") },
  ];

  const hasMultipleTypes = amendmentCount > 0 && nonAmendmentCount > 0;

  return (
    <div className="container mx-auto px-4 pt-4 pb-8">
      <Breadcrumb
        items={[
          { label: "Politiques", href: "/politiques" },
          { label: politician.fullName, href: `/politiques/${slug}` },
          { label: "Votes" },
        ]}
      />

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href={`/politiques/${slug}`} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <PoliticianAvatar
          photoUrl={politician.photoUrl}
          firstName={politician.firstName}
          lastName={politician.lastName}
          size="md"
        />
        <div>
          <h1 className="text-2xl font-display font-extrabold tracking-tight">
            Votes de {politician.fullName}
          </h1>
          <p className="text-muted-foreground">{total} votes enregistrés</p>
        </div>
      </div>

      {/* NON_VOTANT context note for president of chamber */}
      {(() => {
        const presidentMandate = politician.mandates.find(
          (m) => m.role && /^Président /.test(m.role)
        );
        if (presidentMandate) {
          const roleLabel = feminizeRole(presidentMandate.role!, politician.civility);
          return (
            <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg mb-8">
              <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-blue-800 dark:text-blue-200">
                En tant que <strong>{roleLabel}</strong>, {politician.fullName} ne participe
                traditionnellement pas aux votes afin de garantir l&apos;impartialité de la
                présidence. Les statistiques de participation ne sont pas significatives.
              </p>
            </div>
          );
        }
        return null;
      })()}

      {/* Type tabs */}
      {hasMultipleTypes && <ScrutinTypeTabs tabs={tabs} activeKey={typeTab} />}

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2">
          {votes.length > 0 ? (
            <div className="space-y-3">
              {votes.map((vote) => (
                <Card key={vote.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/parlement/votes/${vote.scrutin.slug || vote.scrutin.id}`}
                          className="font-medium hover:underline line-clamp-2"
                        >
                          {vote.scrutin.title}
                        </Link>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {vote.scrutin.type && vote.scrutin.type !== "AUTRE" && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs font-medium ${SCRUTIN_TYPE_COLORS[vote.scrutin.type]}`}
                            >
                              {SCRUTIN_TYPE_LABELS[vote.scrutin.type]}
                            </span>
                          )}
                          <span>{formatDate(vote.scrutin.votingDate)}</span>
                          <VotingResultBadge result={vote.scrutin.result} />
                          {vote.scrutin.sourceUrl && (
                            <a
                              href={vote.scrutin.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 hover:text-foreground"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                      <VotePositionBadge position={vote.position} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Aucun vote enregistré pour ce représentant
              </CardContent>
            </Card>
          )}

          {/* Pagination */}
          <SimplePagination
            page={page}
            totalPages={totalPages}
            buildUrl={(p) => buildUrl(p, typeTab)}
          />
        </div>

        {/* Sidebar */}
        <div>
          <VoteStats
            stats={stats}
            isChamberPresident={politician.mandates.some(
              (m) => m.role != null && /^Président /.test(m.role)
            )}
          />
        </div>
      </div>
    </div>
  );
}
