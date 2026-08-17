import Image from "next/image";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getParty, getPartyLeadership, getPartyRoles } from "@/lib/data/partis";
import { getPartyPlatform } from "@/lib/data/platforms";
import { ProgrammeCTA, ProgrammeCTAEmpty } from "@/components/programmes/ProgrammeCTA";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import {
  PARTY_ROLE_LABELS,
  feminizePartyRole,
  AFFAIR_STATUS_LABELS,
  AFFAIR_STATUS_COLORS,
  POLITICAL_POSITION_LABELS,
} from "@/config/labels";
import {
  getCertaintyLevel,
  CERTAINTY_LABELS,
  CERTAINTY_COLORS,
  CERTAINTY_SORT_ORDER,
  isAccusedInvolvement,
  type CertaintyLevel,
} from "@/config/certainty";
import { getJudicialMaturity } from "@/config/judicial-maturity";
import type { AffairStatus } from "@/types";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { PoliticalPositionBadge } from "@/components/partis/PoliticalPositionBadge";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { OrganizationJsonLd } from "@/components/seo/JsonLd";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { ensureContrast } from "@/lib/contrast";
import { SITE_URL } from "@/config/site";
import { db } from "@/lib/db";
import { FollowButton } from "@/components/politicians/FollowButton";
import { PUBLIC_PARTY_WHERE, PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { getConvictionOnlyWhere } from "@/lib/affairs/public-filters";

export async function generateStaticParams() {
  const parties = await db.party.findMany({
    where: PUBLIC_PARTY_WHERE,
    select: { slug: true },
    orderBy: { name: "asc" },
    take: 50,
  });
  return parties.map((p) => ({ slug: p.slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const party = await getParty(slug);

  if (!party) {
    return { title: "Parti non trouvé" };
  }

  const memberCount = party.politicians.length;
  const affairCount = party.affairsAtTime.length;
  const positionLabel = party.politicalPosition
    ? POLITICAL_POSITION_LABELS[party.politicalPosition]
    : null;
  const description =
    party.description ||
    `${party.name} (${party.shortName})${positionLabel ? `, parti de ${positionLabel.toLowerCase()}` : ""} — ${memberCount} membre${memberCount > 1 ? "s" : ""} actuels.${affairCount > 0 ? ` ${affairCount} affaire${affairCount > 1 ? "s" : ""} judiciaire${affairCount > 1 ? "s" : ""} documentée${affairCount > 1 ? "s" : ""}.` : ""} Consultez la liste des élus et l'historique du parti.`;

  return {
    title: `${party.name} (${party.shortName})`,
    description,
    openGraph: {
      title: `${party.name} | Poligraph`,
      description,
      type: "profile",
      images: party.logoUrl
        ? [
            {
              url: party.logoUrl,
              alt: party.name,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary",
      title: `${party.name} (${party.shortName})`,
      description,
      images: party.logoUrl ? [party.logoUrl] : undefined,
    },
    alternates: { canonical: `/partis/${slug}` },
  };
}

export default async function PartyPage({ params }: PageProps) {
  const { slug } = await params;
  const party = await getParty(slug);

  if (!party) {
    notFound();
  }

  const [
    leadershipMandates,
    partyRoles,
    pressEnabled,
    programmeEnabled,
    partyPlatform,
    nCondamnesDef,
  ] = await Promise.all([
    getPartyLeadership(party.id, party.name),
    getPartyRoles(party.id),
    isFeatureEnabled("PRESS_SECTION"),
    isFeatureEnabled("PROGRAMMES_ENABLED"),
    getPartyPlatform(slug),
    db.affair.count({
      where: {
        ...getConvictionOnlyWhere(),
        status: "CONDAMNATION_DEFINITIVE",
        politician: PUBLIC_POLITICIAN_WHERE,
        OR: [
          { partyAtTime: { slug: party.slug } },
          { politician: { currentParty: { slug: party.slug } } },
        ],
      },
    }),
  ]);
  const currentLeaders = leadershipMandates.filter((m) => m.isCurrent);
  const pastLeaders = leadershipMandates.filter((m) => !m.isCurrent);

  // Group party roles by type (current = no endDate)
  const currentRoles = partyRoles.filter((r) => !r.endDate);
  // Deduplicate: exclude leaders already shown in currentLeaders
  const currentLeaderIds = new Set(currentLeaders.map((m) => m.politician.id));
  const filteredCurrentRoles = currentRoles.filter((r) => !currentLeaderIds.has(r.politician.id));

  // Get all politicians who were ever in this party (current + historical)
  const currentMemberIds = new Set(party.politicians.map((p) => p.id));
  const historicalMembers = party.partyMemberships
    .filter((m) => !currentMemberIds.has(m.politicianId))
    .reduce(
      (acc, m) => {
        // Deduplicate by politician
        if (!acc.find((x) => x.politician.id === m.politician.id)) {
          acc.push(m);
        }
        return acc;
      },
      [] as typeof party.partyMemberships
    );

  const sameAsUrls = party.externalIds
    .map((e) => e.url)
    .filter((url): url is string => url != null);

  return (
    <>
      {/* JSON-LD Structured Data */}
      <OrganizationJsonLd
        name={party.name}
        alternateName={party.shortName}
        description={party.description || undefined}
        logo={party.logoUrl || undefined}
        url={`${SITE_URL}/partis/${party.slug}`}
        foundingDate={party.foundedDate?.toISOString().split("T")[0]}
        dissolutionDate={party.dissolvedDate?.toISOString().split("T")[0]}
        sameAs={sameAsUrls.length > 0 ? sameAsUrls : undefined}
      />
      <div className="container mx-auto px-4 pt-4 pb-8">
        <Breadcrumb
          items={[{ label: "Partis", href: "/partis" }, { label: party.shortName || party.name }]}
        />

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            {party.logoUrl ? (
              <Image
                src={party.logoUrl}
                alt={party.name}
                width={64}
                height={64}
                className="w-16 h-16 object-contain"
              />
            ) : (
              <div
                className="w-16 h-16 rounded-lg flex items-center justify-center text-2xl font-bold text-white"
                style={{ backgroundColor: party.color || "#888" }}
              >
                {party.shortName.substring(0, 2)}
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-display font-extrabold tracking-tight">
                  {party.name}
                </h1>
                {party.slug && <FollowButton slug={party.slug} type="party" />}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  style={{
                    backgroundColor: party.color ? `${party.color}20` : undefined,
                    color: party.color ? ensureContrast(party.color, "#ffffff") : undefined,
                  }}
                >
                  {party.shortName}
                </Badge>
                {party.politicalPosition && (
                  <PoliticalPositionBadge
                    position={party.politicalPosition}
                    source={party.politicalPositionSource}
                  />
                )}
                {party.dissolvedDate && (
                  <Badge variant="outline" className="text-muted-foreground">
                    Dissous
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        {party.description && (
          <p className="text-muted-foreground leading-relaxed mb-8">{party.description}</p>
        )}

        {/* Programme CTA */}
        {programmeEnabled &&
          (partyPlatform ? (
            <div className="mb-8">
              <ProgrammeCTA
                partyName={party.name}
                partySlug={slug}
                sourceUrl={partyPlatform.sourceUrl}
                partyWebsite={party.website}
                electionTitle={partyPlatform.election?.title}
              />
            </div>
          ) : (
            <div className="mb-8">
              <ProgrammeCTAEmpty partyName={party.name} partyWebsite={party.website} />
            </div>
          ))}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Party leadership & roles */}
            {(leadershipMandates.length > 0 || currentRoles.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle>Direction</CardTitle>
                </CardHeader>
                <CardContent>
                  {currentLeaders.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        En fonction
                      </p>
                      <div className="space-y-3">
                        {currentLeaders.map((mandate) => (
                          <Link
                            key={mandate.id}
                            href={`/politiques/${mandate.politician.slug}`}
                            className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors"
                          >
                            <PoliticianAvatar
                              photoUrl={mandate.politician.photoUrl}
                              firstName={mandate.politician.firstName}
                              lastName={mandate.politician.lastName}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold">{mandate.politician.fullName}</p>
                              <p className="text-sm text-muted-foreground">{mandate.title}</p>
                            </div>
                            <Badge variant="secondary" className="shrink-0">
                              Depuis {mandate.startDate.getFullYear()}
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Significant party roles (founders, spokespersons, etc.) */}
                  {filteredCurrentRoles.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-medium text-muted-foreground mb-3">
                        Figures du parti
                      </p>
                      <div className="space-y-2">
                        {filteredCurrentRoles.map((membership) => (
                          <Link
                            key={membership.id}
                            href={`/politiques/${membership.politician.slug}`}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
                          >
                            <PoliticianAvatar
                              photoUrl={membership.politician.photoUrl}
                              firstName={membership.politician.firstName}
                              lastName={membership.politician.lastName}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">{membership.politician.fullName}</p>
                              <Badge variant="outline" className="text-xs mt-0.5">
                                {feminizePartyRole(
                                  PARTY_ROLE_LABELS[membership.role],
                                  membership.politician.civility
                                )}
                              </Badge>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {pastLeaders.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Anciens dirigeants
                      </p>
                      <div className="space-y-2">
                        {pastLeaders.map((mandate) => (
                          <Link
                            key={mandate.id}
                            href={`/politiques/${mandate.politician.slug}`}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <PoliticianAvatar
                                photoUrl={mandate.politician.photoUrl}
                                firstName={mandate.politician.firstName}
                                lastName={mandate.politician.lastName}
                                size="sm"
                              />
                              <div>
                                <span className="font-medium">{mandate.politician.fullName}</span>
                                <p className="text-xs text-muted-foreground">{mandate.title}</p>
                              </div>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {mandate.startDate.getFullYear()}
                              {mandate.endDate && ` - ${mandate.endDate.getFullYear()}`}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Current members */}
            <CollapsibleCard
              title="Membres actuels"
              count={party.politicians.length}
              defaultOpen={party.politicians.length > 0 && party.politicians.length <= 10}
            >
              {party.politicians.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {party.politicians.map((politician) => (
                    <div
                      key={politician.id}
                      className={`flex items-center gap-3 p-2 rounded-lg ${
                        politician._count.affairs > 0
                          ? "ring-1 ring-red-200 bg-red-50/50 dark:ring-red-900 dark:bg-red-950/30"
                          : ""
                      }`}
                    >
                      <Link
                        href={`/politiques/${politician.slug}`}
                        className="relative shrink-0 hover:opacity-80 transition-opacity"
                      >
                        <PoliticianAvatar
                          photoUrl={politician.photoUrl}
                          firstName={politician.firstName}
                          lastName={politician.lastName}
                          size="sm"
                        />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/politiques/${politician.slug}`}
                          className="font-medium block hover:text-primary transition-colors"
                        >
                          {politician.fullName}
                        </Link>
                        {politician.mandates[0] && (
                          <p className="text-xs text-muted-foreground">
                            {politician.mandates[0].title}
                          </p>
                        )}
                      </div>
                      {politician._count.affairs > 0 && (
                        <Link
                          href={`/politiques/${politician.slug}/affaires`}
                          className="shrink-0 flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-950/50 rounded-full hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                          title={`${politician._count.affairs} condamnation(s) définitive(s) pour atteinte à la probité`}
                        >
                          <span>{politician._count.affairs}</span>
                          <span className="hidden sm:inline">probité</span>
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">Aucun membre actuel</p>
              )}
            </CollapsibleCard>

            {/* Historical members */}
            {historicalMembers.length > 0 && (
              <CollapsibleCard
                title="Anciens membres"
                count={historicalMembers.length}
                defaultOpen={false}
              >
                <div className="space-y-2">
                  {historicalMembers.slice(0, 20).map((membership) => (
                    <Link
                      key={membership.id}
                      href={`/politiques/${membership.politician.slug}`}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <PoliticianAvatar
                          photoUrl={membership.politician.photoUrl}
                          firstName={membership.politician.firstName}
                          lastName={membership.politician.lastName}
                          size="sm"
                        />
                        <span className="font-medium">{membership.politician.fullName}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {membership.startDate ? formatDate(membership.startDate) : ""}
                        {membership.endDate &&
                          `${membership.startDate ? " - " : ""}${formatDate(membership.endDate)}`}
                      </span>
                    </Link>
                  ))}
                  {historicalMembers.length > 20 && (
                    <p className="text-sm text-muted-foreground text-center pt-2">
                      Et {historicalMembers.length - 20} autres...
                    </p>
                  )}
                </div>
              </CollapsibleCard>
            )}

            {/* Affairs */}
            {party.affairsAtTime.length > 0 &&
              (() => {
                // Certainty badges only describe affairs where the member is the
                // accused; victim/plaintiff/mentioned affairs must not be counted
                // as the party's condamnations (#383).
                const directAffairs = party.affairsAtTime.filter((a) =>
                  isAccusedInvolvement(a.involvement)
                );
                const affairsWithCertainty = directAffairs.map((a) => ({
                  ...a,
                  certainty: getCertaintyLevel(a.status as AffairStatus),
                }));
                const condamnations = directAffairs.filter(
                  (a) => getJudicialMaturity(a.status as AffairStatus) === "CONDAMNATION"
                ).length;
                const enCours = directAffairs.filter((a) => {
                  const m = getJudicialMaturity(a.status as AffairStatus);
                  return m === "PROCEDURE_VALIDEE" || m === "ENQUETE";
                }).length;
                const closesSansCondamnation = directAffairs.filter(
                  (a) => getJudicialMaturity(a.status as AffairStatus) === "CLOSE_SANS_CONDAMNATION"
                ).length;
                return (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <CardTitle>
                          {condamnations > 0
                            ? `${condamnations} condamnation${condamnations > 1 ? "s" : ""}`
                            : "Aucune condamnation"}
                        </CardTitle>
                        <Link
                          href="/methodologie#comment-nous-comptons"
                          className="text-muted-foreground hover:text-foreground"
                          title="Comment nous comptons"
                          aria-label="Comment nous comptons les affaires judiciaires"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </Link>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-4">
                        {enCours > 0 && (
                          <span>
                            {enCours} procédure{enCours > 1 ? "s" : ""} en cours (présomption d{"'"}
                            innocence)
                          </span>
                        )}
                        {closesSansCondamnation > 0 && (
                          <span>
                            {closesSansCondamnation} close{closesSansCondamnation > 1 ? "s" : ""}{" "}
                            sans condamnation
                          </span>
                        )}
                      </div>

                      {/* Certainty level breakdown badges */}
                      <div className="flex flex-wrap gap-2 mb-4">
                        {(Object.keys(CERTAINTY_LABELS) as CertaintyLevel[]).map((level) => {
                          const count = affairsWithCertainty.filter(
                            (a) => a.certainty === level
                          ).length;
                          if (count === 0) return null;
                          return (
                            <Badge
                              key={level}
                              variant="outline"
                              className={CERTAINTY_COLORS[level]}
                            >
                              {CERTAINTY_LABELS[level]} ({count})
                            </Badge>
                          );
                        })}
                      </div>

                      {/* Top 5 affairs sorted by certainty */}
                      <div className="space-y-3">
                        {[...affairsWithCertainty]
                          .sort(
                            (a, b) =>
                              CERTAINTY_SORT_ORDER[a.certainty] - CERTAINTY_SORT_ORDER[b.certainty]
                          )
                          .slice(0, 5)
                          .map((affair) => (
                            <Link
                              key={affair.id}
                              href={`/affaires/${affair.slug}`}
                              className={`block p-3 rounded-lg border hover:bg-muted transition-colors ${
                                affair.certainty === "ETABLI"
                                  ? "border-red-200 dark:border-red-900/50"
                                  : ""
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <Badge className={CERTAINTY_COLORS[affair.certainty]}>
                                      {CERTAINTY_LABELS[affair.certainty]}
                                    </Badge>
                                    <Badge
                                      variant="outline"
                                      className={
                                        AFFAIR_STATUS_COLORS[affair.status as AffairStatus]
                                      }
                                    >
                                      {AFFAIR_STATUS_LABELS[affair.status as AffairStatus]}
                                    </Badge>
                                    <span className="text-sm font-medium">
                                      {affair.politician.fullName}
                                    </span>
                                  </div>
                                  <p className="text-sm text-muted-foreground line-clamp-1">
                                    {affair.title}
                                  </p>
                                </div>
                                {affair.verdictDate && (
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                                    {formatDate(affair.verdictDate)}
                                  </span>
                                )}
                              </div>
                            </Link>
                          ))}
                      </div>

                      {/* CTA to satellite page */}
                      {party.slug && (
                        <Link
                          href={`/affaires/parti/${party.slug}`}
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-4"
                        >
                          Voir toutes les affaires ({party.affairsAtTime.length})
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </Link>
                      )}

                      {nCondamnesDef > 0 && party.slug && (
                        <p className="text-sm mt-2">
                          <Link
                            href={`/affaires/condamnations?parti=${party.slug}&certainty=etabli`}
                            className="text-primary hover:underline"
                            prefetch={false}
                          >
                            {nCondamnesDef} condamnation
                            {nCondamnesDef !== 1 ? "s" : ""} définitive
                            {nCondamnesDef !== 1 ? "s" : ""} →
                          </Link>
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })()}

            {/* Press mentions */}
            {pressEnabled && party.pressMentions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Dans la presse</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {party.pressMentions.map((mention) => (
                      <a
                        key={mention.id}
                        href={mention.article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-3 rounded-lg border hover:bg-muted transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm line-clamp-2">
                              {mention.article.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {mention.article.feedSource === "lemonde"
                                ? "Le Monde"
                                : mention.article.feedSource === "politico"
                                  ? "Politico"
                                  : mention.article.feedSource === "mediapart"
                                    ? "Mediapart"
                                    : mention.article.feedSource}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(mention.article.publishedAt)}
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                  <Link
                    href={`/presse?party=${party.id}`}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-4"
                  >
                    Voir tous les articles
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Informations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {party.foundedDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fondé</span>
                    <span className="font-semibold">{formatDate(party.foundedDate)}</span>
                  </div>
                )}
                {party.dissolvedDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dissous</span>
                    <span className="font-semibold">{formatDate(party.dissolvedDate)}</span>
                  </div>
                )}
                {party.ideology && (
                  <div>
                    <span className="text-muted-foreground block mb-1">Idéologie</span>
                    <span className="text-sm">{party.ideology}</span>
                  </div>
                )}
                {party.politicalPosition && party.politicalPositionSource && (
                  <div>
                    <span className="text-muted-foreground block mb-1">Position politique</span>
                    <div className="flex items-center gap-2">
                      <PoliticalPositionBadge position={party.politicalPosition} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Source : {party.politicalPositionSource}
                    </p>
                    {party.politicalPositionSourceUrl && (
                      <a
                        href={party.politicalPositionSourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        Voir la source
                      </a>
                    )}
                  </div>
                )}
                {party.headquarters && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Siège</span>
                    <span className="text-sm">{party.headquarters}</span>
                  </div>
                )}
                {party.website && (
                  <div>
                    <a
                      href={party.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      Site officiel
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Party evolution */}
            {(party.predecessor || party.successors.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Évolution</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {party.predecessor && (
                    <div>
                      <span className="text-sm text-muted-foreground block mb-1">Succède à</span>
                      <Link
                        href={
                          party.predecessor.slug ? `/partis/${party.predecessor.slug}` : "/partis"
                        }
                        className="inline-flex items-center gap-2 text-primary hover:underline"
                      >
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: party.predecessor.color || "#888" }}
                        />
                        {party.predecessor.name}
                      </Link>
                    </div>
                  )}
                  {party.successors.length > 0 && (
                    <div>
                      <span className="text-sm text-muted-foreground block mb-1">Précède</span>
                      <div className="space-y-1">
                        {party.successors.map((successor) => (
                          <Link
                            key={successor.id}
                            href={successor.slug ? `/partis/${successor.slug}` : "/partis"}
                            className="flex items-center gap-2 text-primary hover:underline"
                          >
                            <span
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: successor.color || "#888" }}
                            />
                            {successor.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">En bref</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Membres actuels</span>
                  <span className="font-semibold">{party.politicians.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Anciens membres</span>
                  <span className="font-semibold">{historicalMembers.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Affaires</span>
                  <span className="font-semibold">{party.affairsAtTime.length}</span>
                </div>
              </CardContent>
            </Card>

            {/* External links */}
            {party.externalIds.length > 0 && (
              <Card className="bg-muted">
                <CardContent className="pt-6">
                  <p className="text-xs text-muted-foreground mb-2">Liens externes</p>
                  <div className="flex flex-wrap gap-2">
                    {party.externalIds.map(
                      (ext) =>
                        ext.url && (
                          <a
                            key={ext.id}
                            href={ext.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            {ext.source.replace("_", " ")}
                          </a>
                        )
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
