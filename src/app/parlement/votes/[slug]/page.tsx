import { cache } from "react";
import { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VotingResultBadge, VotePositionBadge } from "@/components/votes";
import { ThemeVotesLink } from "@/components/votes/ThemeVotesLink";
import { DailyVotesPage } from "@/components/votes/DailyVotesPage";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { formatDate } from "@/lib/utils";
import {
  THEME_CATEGORY_LABELS,
  THEME_CATEGORY_COLORS,
  SCRUTIN_TYPE_LABELS,
  SCRUTIN_TYPE_COLORS,
} from "@/config/labels";
import { ExternalLink, Calendar, Users, FileText } from "lucide-react";
import { StatusBadge } from "@/components/legislation";
import { ArticleJsonLd } from "@/components/seo/JsonLd";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { getScrutinGroupPositions, getScrutinAnalysis } from "@/lib/data/groupes";
import { GroupPositions } from "@/components/votes/GroupPositions";
import { ScrutinContext } from "@/components/votes/ScrutinContext";
import type { VotePosition } from "@/types";
import { SITE_URL } from "@/config/site";
import { ShareBar } from "@/components/ui/ShareBar";
import { toPublicTitleView } from "@/lib/votes/to-public-title-view";
import { formatLegislature } from "@/lib/votes/legislature";
import { isVoteDateArchiveSlug, voteDateArchiveRobotsMetadata } from "@/lib/seo/parliament-robots";
import { scrutinRobotsMetadata } from "@/lib/seo/scrutin-robots";

/** Parse externalId into human-readable label: "VTANR5L17V5729" → "Vote n°5729" */
function formatExternalId(externalId: string, chamber: string): string {
  // AN format: VTANR5L17V5729 → extract vote number after last "V"
  const anMatch = externalId.match(/V(\d+)$/);
  if (anMatch) return `Vote n°${anMatch[1]}`;
  // Senate format: "2024-63" → extract number after dash
  const senatMatch = externalId.match(/-(\d+)$/);
  if (senatMatch) return `Vote n°${senatMatch[1]}`;
  return `Scrutin ${chamber === "AN" ? "AN" : "Sénat"} ${externalId}`;
}

/** Extract scrutin number for the kicker label: "VTANR5L17V5729" → "5729" */
function extractScrutinNumber(externalId: string): string | null {
  const anMatch = externalId.match(/V(\d+)$/);
  if (anMatch?.[1]) return anMatch[1];
  const senatMatch = externalId.match(/-(\d+)$/);
  if (senatMatch?.[1]) return senatMatch[1];
  return null;
}

export const revalidate = 86400; // ISR: 24h backstop; real changes propagate on-demand via revalidateTag

// ISR-only: return [] so no page is prerendered at build (too many scrutins to
// prerender, and it would OOM on Vercel), but the presence of generateStaticParams
// makes the route ISR-cacheable instead of fully dynamic. Each URL is rendered on
// first request, then served from cache until the next revalidation.
//
// This is only safe because the route does NOT access `searchParams`: combining
// generateStaticParams + searchParams + the "use cache" data functions triggers
// DYNAMIC_SERVER_USAGE. The date-archive `type` tab is therefore read client-side
// inside DailyVotesList (useSearchParams), so /parlement/votes/YYYY-MM-DD?type=
// still works while the route stays cacheable.
export async function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Get scrutin with redirect support for legacy URLs
 * Returns { scrutin, redirect } where redirect is the slug to redirect to
 */
const getScrutinWithRedirect = cache(async function getScrutinWithRedirect(slugOrId: string) {
  const includeOptions = {
    votes: {
      include: {
        politician: {
          include: {
            currentParty: true,
            mandates: {
              where: { isCurrent: true, parliamentaryData: { isNot: null } },
              take: 1,
              select: {
                parliamentaryData: {
                  select: {
                    parliamentaryGroup: { select: { code: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        politician: { lastName: "asc" },
      },
    },
    dossierLegislatif: {
      select: {
        slug: true,
        shortTitle: true,
        title: true,
        number: true,
        status: true,
      },
    },
    importance: { select: { isKeyVote: true } },
    // Plan 6: public policy title (shown only when APPROVED + valid).
    policyTitle: {
      select: {
        status: true,
        policyTitle: true,
        policySubtitle: true,
        officialSourceUrl: true,
        proceduralLabel: true,
      },
    },
  } as const;

  // 1. Try by slug first (canonical URL - most common case)
  let scrutin = await db.scrutin.findUnique({
    where: { slug: slugOrId },
    include: includeOptions,
  });
  if (scrutin) {
    return { scrutin, redirect: null };
  }

  // 2. Try by internal ID (CUID) - legacy URL
  scrutin = await db.scrutin.findUnique({
    where: { id: slugOrId },
    include: includeOptions,
  });
  if (scrutin) {
    return { scrutin, redirect: scrutin.slug };
  }

  // 3. Try by exact externalId (e.g., "VTANR5L17V5283") - legacy URL
  scrutin = await db.scrutin.findUnique({
    where: { externalId: slugOrId },
    include: includeOptions,
  });
  if (scrutin) {
    return { scrutin, redirect: scrutin.slug };
  }

  // 4. Try by numeric part of externalId (e.g., "5283") - legacy URL
  // External IDs are like "VTANR5L17V5283" - we match the number part
  if (/^\d+$/.test(slugOrId)) {
    scrutin = await db.scrutin.findFirst({
      where: {
        externalId: { endsWith: `V${slugOrId}` },
      },
      include: includeOptions,
    });
    if (scrutin) {
      return { scrutin, redirect: scrutin.slug };
    }
  }

  return { scrutin: null, redirect: null };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;

  // Date archive page (e.g., /votes/2026-03-04)
  if (isVoteDateArchiveSlug(slug)) {
    const date = new Date(slug + "T00:00:00Z");
    if (!isNaN(date.getTime())) {
      const formatted = date.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
      return {
        title: `Votes du ${formatted}`,
        description: `Scrutins de l'Assemblée nationale et du Sénat du ${formatted}. Résultats, résumés et détails des votes parlementaires.`,
        alternates: { canonical: `/parlement/votes/${slug}` },
        ...voteDateArchiveRobotsMetadata(slug),
      };
    }
  }

  const { scrutin } = await getScrutinWithRedirect(slug);

  if (!scrutin) {
    return missingEntityMetadata("Scrutin non trouvé");
  }

  // Prefer citizen impact for SEO description (more user-friendly)
  const citizenImpactFirstSentence = scrutin.citizenImpact
    ?.replace(/\*\*/g, "")
    .split(/[.!?]\s/)[0];
  const summaryFirstLine = scrutin.summary?.split("\n")[0];
  const description =
    (citizenImpactFirstSentence ? citizenImpactFirstSentence + "." : null) ||
    summaryFirstLine ||
    `Scrutin du ${formatDate(scrutin.votingDate)} - ${scrutin.result === "ADOPTED" ? "Adopté" : "Rejeté"} avec ${scrutin.votesFor} pour, ${scrutin.votesAgainst} contre et ${scrutin.votesAbstain} abstentions.`;

  // Public title: policy title iff APPROVED + valid, else official (no leak).
  const view = toPublicTitleView(scrutin);
  const displayTitle = view.mode === "policy" ? view.policyTitle : view.officialTitle;

  const scrutinNumber = extractScrutinNumber(scrutin.externalId);
  const chamberLabel = scrutin.chamber === "AN" ? "Assemblée nationale" : "Sénat";
  const seoTitle = scrutinNumber
    ? `Scrutin n° ${scrutinNumber} ${chamberLabel} - ${displayTitle}`
    : displayTitle;

  return {
    title: seoTitle,
    description,
    alternates: { canonical: `/parlement/votes/${scrutin.slug}` },
    ...scrutinRobotsMetadata({
      type: scrutin.type,
      totalVotes: scrutin.votesFor + scrutin.votesAgainst + scrutin.votesAbstain,
      citizenImpact: scrutin.citizenImpact,
      isKeyVote: scrutin.importance?.isKeyVote ?? false,
    }),
  };
}

export default async function ScrutinPage({ params }: PageProps) {
  const { slug } = await params;

  // Date archive page (e.g., /votes/2026-03-04). The `type` tab is handled
  // client-side in DailyVotesList, so this route never reads searchParams.
  if (isVoteDateArchiveSlug(slug)) {
    const date = new Date(slug + "T00:00:00Z");
    if (!isNaN(date.getTime())) {
      return <DailyVotesPage date={slug} />;
    }
  }

  const { scrutin, redirect } = await getScrutinWithRedirect(slug);

  // Redirect legacy URLs to canonical slug URL
  if (redirect && redirect !== slug) {
    permanentRedirect(`/parlement/votes/${redirect}`);
  }

  if (!scrutin) {
    notFound();
  }

  const [groupPositions, analysis] = await Promise.all([
    getScrutinGroupPositions(scrutin.id),
    getScrutinAnalysis(scrutin.id),
  ]);

  const isKeyVote = !!scrutin.importance?.isKeyVote;

  // Group votes by position
  const votesByPosition = scrutin.votes.reduce(
    (acc, vote) => {
      if (!acc[vote.position]) {
        acc[vote.position] = [];
      }
      acc[vote.position].push(vote);
      return acc;
    },
    {} as Record<VotePosition, typeof scrutin.votes>
  );

  const total = scrutin.votesFor + scrutin.votesAgainst + scrutin.votesAbstain;
  const forPercent = total > 0 ? (scrutin.votesFor / total) * 100 : 0;
  const againstPercent = total > 0 ? (scrutin.votesAgainst / total) * 100 : 0;
  const abstainPercent = total > 0 ? (scrutin.votesAbstain / total) * 100 : 0;

  // Public title: policy title iff APPROVED + valid, else official (no leak).
  const view = toPublicTitleView(scrutin);
  const displayTitle = view.mode === "policy" ? view.policyTitle : view.officialTitle;

  // Motion de censure: special threshold-based display (289 = absolute majority of 577 deputies).
  // Detected against the OFFICIAL title (logic, not display).
  const isMotionDeCensure = /motion\s+de\s+censure/i.test(scrutin.title);
  const CENSURE_THRESHOLD = 289;

  return (
    <>
      {scrutin.summary && (
        <ArticleJsonLd
          headline={displayTitle}
          description={scrutin.citizenImpact?.replace(/\*\*/g, "").split(/[.!?]\s/)[0] || undefined}
          datePublished={scrutin.votingDate.toISOString()}
          url={`${SITE_URL}/parlement/votes/${scrutin.slug}`}
          image={`${SITE_URL}/parlement/votes/${scrutin.slug}/opengraph-image`}
        />
      )}
      <ShareBar
        data={{
          title: displayTitle,
          text: `${formatExternalId(scrutin.externalId, scrutin.chamber)} : ${displayTitle} (${scrutin.result === "ADOPTED" ? "Adopté" : "Rejeté"}, ${scrutin.chamber === "AN" ? "Assemblée nationale" : "Sénat"})`,
          url: `${SITE_URL}/parlement/votes/${scrutin.slug}`,
        }}
      />
      <div className="container mx-auto px-4 pt-4 pb-8">
        <Breadcrumb
          items={[
            { label: "Parlement", href: "/parlement" },
            { label: "Votes", href: "/parlement/votes" },
            { label: formatExternalId(scrutin.externalId, scrutin.chamber) },
          ]}
        />

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <h1 className="text-2xl font-display font-extrabold tracking-tight">
              <span className="block text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {extractScrutinNumber(scrutin.externalId)
                  ? `Scrutin n° ${extractScrutinNumber(scrutin.externalId)}`
                  : formatExternalId(scrutin.externalId, scrutin.chamber)}
                {" · "}
                {scrutin.chamber === "AN" ? "Assemblée nationale" : "Sénat"}
              </span>
              <span className="inline-flex flex-wrap items-center gap-2 align-middle">
                {displayTitle}
                {view.mode === "policy" ? (
                  <Badge variant="accent" className="align-middle text-xs font-medium">
                    Titre explicatif
                  </Badge>
                ) : null}
              </span>
            </h1>
            <VotingResultBadge result={scrutin.result} />
          </div>

          {view.mode === "policy" ? (
            <div className="mb-4">
              {view.policySubtitle ? (
                <p className="text-base text-muted-foreground">{view.policySubtitle}</p>
              ) : null}
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-muted-foreground">Titre officiel</summary>
                <p className="mt-1">{view.officialTitle}</p>
              </details>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {scrutin.type && scrutin.type !== "AUTRE" && (
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${SCRUTIN_TYPE_COLORS[scrutin.type]}`}
              >
                {SCRUTIN_TYPE_LABELS[scrutin.type]}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDate(scrutin.votingDate)}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {total} votants
            </span>
            <Badge variant="outline">{formatLegislature(scrutin.legislature)}</Badge>
            {scrutin.theme && (
              <Link
                href={`/parlement/votes/themes/${scrutin.theme.toLowerCase().replace(/_/g, "-")}`}
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors hover:opacity-80 ${THEME_CATEGORY_COLORS[scrutin.theme]}`}
              >
                {THEME_CATEGORY_LABELS[scrutin.theme]}
              </Link>
            )}
            {scrutin.sourceUrl && (
              <a
                href={scrutin.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                {scrutin.sourceUrl.includes("assemblee-nationale.fr")
                  ? "Voir sur Assemblée nationale"
                  : scrutin.sourceUrl.includes("nosdeputes.fr")
                    ? "Voir sur NosDéputés.fr"
                    : "Voir la source"}
              </a>
            )}
          </div>
        </div>

        {/* Dossier législatif lié */}
        {scrutin.dossierLegislatif && (
          <Link
            href={`/parlement/dossiers/${scrutin.dossierLegislatif.slug}`}
            className="flex items-center gap-3 mb-8 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
          >
            <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">Dossier législatif</p>
              <p className="font-medium group-hover:underline">
                {scrutin.dossierLegislatif.shortTitle || scrutin.dossierLegislatif.title}
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              {scrutin.dossierLegislatif.number && (
                <Badge variant="secondary" className="font-mono text-xs">
                  {scrutin.dossierLegislatif.number}
                </Badge>
              )}
              <StatusBadge status={scrutin.dossierLegislatif.status} />
            </div>
          </Link>
        )}

        {/* Context: Citizen Impact, Analysis, Votes détaillés (tabbed) */}
        <ScrutinContext
          summary={scrutin.summary}
          citizenImpact={scrutin.citizenImpact}
          analysis={analysis}
          isKeyVote={isKeyVote}
          votesDetailSlot={
            scrutin.votes.length > 0 ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">
                {(["POUR", "CONTRE", "ABSTENTION", "NON_VOTANT", "ABSENT"] as VotePosition[]).map(
                  (position) => {
                    const votes = votesByPosition[position] || [];
                    return (
                      <Card key={position}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">
                              <VotePositionBadge position={position} />
                            </CardTitle>
                            <span className="text-sm text-muted-foreground">{votes.length}</span>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {votes.length > 0 ? (
                            <div className="space-y-2 max-h-[400px] overflow-y-auto">
                              {votes.map((vote) => (
                                <Link
                                  key={vote.id}
                                  href={`/politiques/${vote.politician.slug}`}
                                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors"
                                >
                                  <PoliticianAvatar
                                    photoUrl={vote.politician.photoUrl}
                                    firstName={vote.politician.firstName}
                                    lastName={vote.politician.lastName}
                                    size="sm"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">
                                      {vote.politician.fullName}
                                    </p>
                                    {(() => {
                                      const group =
                                        vote.politician.mandates[0]?.parliamentaryData
                                          ?.parliamentaryGroup;
                                      if (group) {
                                        return (
                                          <p
                                            className="text-xs text-muted-foreground"
                                            title={group.name}
                                          >
                                            {group.code}
                                          </p>
                                        );
                                      }
                                      if (vote.politician.currentParty) {
                                        return (
                                          <p
                                            className="text-xs text-muted-foreground"
                                            title={vote.politician.currentParty.name}
                                          >
                                            {vote.politician.currentParty.shortName}
                                          </p>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                </Link>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              Aucun député
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  }
                )}
              </div>
            ) : undefined
          }
        />

        {/* Group Positions */}
        {groupPositions.length > 0 && (
          <Card className="mb-8">
            <CardContent className="pt-6">
              <GroupPositions positions={groupPositions} />
            </CardContent>
          </Card>
        )}

        {/* Results summary */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Résultat du vote</CardTitle>
          </CardHeader>
          <CardContent>
            {isMotionDeCensure ? (
              <div className="space-y-4">
                {/* Threshold bar for motion de censure */}
                <div className="relative">
                  <div className="h-8 bg-muted rounded-lg overflow-hidden">
                    <div
                      className={`h-full flex items-center justify-center text-white text-sm font-medium ${
                        scrutin.result === "ADOPTED" ? "bg-red-500" : "bg-red-400"
                      }`}
                      style={{
                        width: `${Math.min((scrutin.votesFor / CENSURE_THRESHOLD) * 100, 100)}%`,
                      }}
                    >
                      {scrutin.votesFor}
                    </div>
                  </div>
                  {/* Threshold marker */}
                  <div
                    className="absolute top-0 h-8 border-r-2 border-dashed border-foreground/60"
                    style={{ left: "100%" }}
                  />
                </div>

                <div className="flex flex-wrap justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-400" />
                    <span>{scrutin.votesFor} voix pour la censure</span>
                  </div>
                  <span className="text-muted-foreground tabular-nums">
                    {CENSURE_THRESHOLD} nécessaires (majorité absolue)
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">
                  Une motion de censure n{"'"}est adoptée que si elle recueille la majorité absolue
                  des députés ({CENSURE_THRESHOLD}/577). Seuls les députés favorables à la censure
                  votent.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Vote bar */}
                <div className="flex h-8 rounded-lg overflow-hidden">
                  <div
                    className="bg-green-500 flex items-center justify-center text-white text-sm font-medium"
                    style={{ width: `${forPercent}%` }}
                  >
                    {scrutin.votesFor > 0 && scrutin.votesFor}
                  </div>
                  <div
                    className="bg-red-500 flex items-center justify-center text-white text-sm font-medium"
                    style={{ width: `${againstPercent}%` }}
                  >
                    {scrutin.votesAgainst > 0 && scrutin.votesAgainst}
                  </div>
                  <div
                    className="bg-yellow-500 flex items-center justify-center text-white text-sm font-medium"
                    style={{ width: `${abstainPercent}%` }}
                  >
                    {scrutin.votesAbstain > 0 && scrutin.votesAbstain}
                  </div>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap justify-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-green-500" />
                    <span>
                      Pour: {scrutin.votesFor} ({forPercent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500" />
                    <span>
                      Contre: {scrutin.votesAgainst} ({againstPercent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-yellow-500" />
                    <span>
                      Abstention: {scrutin.votesAbstain} ({abstainPercent.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contextual link to the thematic landing (descriptive anchor: the
            theme badge above only carries the bare label). */}
        {scrutin.theme && (
          <div className="mt-8 text-center">
            <ThemeVotesLink theme={scrutin.theme} />
          </div>
        )}

        {/* Back link */}
        <div className="mt-8 text-center">
          <Link href="/parlement/votes" className="text-primary hover:underline">
            ← Retour aux scrutins
          </Link>
        </div>
      </div>
    </>
  );
}
