import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCompactCurrency } from "@/lib/utils";
import { MANDATE_TYPE_LABELS, PARTY_ROLE_LABELS, feminizePartyRole } from "@/config/labels";
import { ensureContrast } from "@/lib/contrast";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { PersonJsonLd } from "@/components/seo/JsonLd";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { DeclarationCard } from "@/components/declarations/DeclarationCard";
import { MarkdownText } from "@/components/ui/markdown";
import type { DeclarationDetails } from "@/types/hatvp";
import { FileText, Mail, Globe, Facebook } from "lucide-react";
import { StatusBadge } from "@/components/legislation";
import { BetaDisclaimer } from "@/components/BetaDisclaimer";
import { ProfileTabs } from "@/components/politicians/ProfileTabs";
import { FactChecksTab } from "@/components/politicians/FactChecksTab";
import { CareerTimeline } from "@/components/politicians/CareerTimeline";
import { AffairsSection } from "@/components/politicians/AffairsSection";
import { VotesSection } from "@/components/politicians/VotesSection";
import {
  getPoliticianVotingStats,
  getPoliticianParliamentaryCard,
  voteStatsService,
} from "@/services/voteStats";
import { getPolitician } from "@/lib/data/politicians";
import { politicianRobotsMetadata } from "@/lib/seo/politician-robots";
import { FollowButton } from "@/components/politicians/FollowButton";
import { CopyableId } from "@/components/politicians/CopyableId";
import { SITE_URL } from "@/config/site";
import { ShareBar } from "@/components/ui/ShareBar";
import { computeJudicialCounts } from "@/lib/politicians/judicial-counts";
import { buildPoliticianSignals } from "@/lib/politicians/signals";
import { buildSourceLinks } from "@/lib/politicians/external-sources";
import { PoliticianSignals } from "@/components/politicians/PoliticianSignals";
import { PresumptionNotice } from "@/components/politicians/PresumptionNotice";
import { PoliticianSummary } from "@/components/politicians/PoliticianSummary";

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

async function getVoteStats(politicianId: string) {
  "use cache";
  cacheTag("votes", "politicians");
  cacheLife("synced");

  const [stats, recentVotes, themeDistribution] = await Promise.all([
    getPoliticianVotingStats(politicianId),
    db.vote.findMany({
      where: { politicianId },
      include: {
        scrutin: {
          select: {
            id: true,
            title: true,
            votingDate: true,
            result: true,
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
          },
        },
      },
      orderBy: { votingDate: "desc" },
      take: 5,
    }),
    voteStatsService.getPoliticianThemeDistribution(politicianId),
  ]);

  return { stats, recentVotes, themeDistribution };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const politician = await getPolitician(slug);

  if (!politician) {
    return { title: "Politicien non trouvé" };
  }

  const currentMandate = politician.mandates.find((m) => m.isCurrent);
  const role = currentMandate
    ? `${currentMandate.type === "DEPUTE" ? "Député" : currentMandate.type === "SENATEUR" ? "Sénateur" : "Représentant"}`
    : "Représentant politique";

  // Find latest DIA declaration with details for SEO
  const latestDIA = politician.declarations.find((d) => d.type === "INTERETS" && d.details);
  const details = latestDIA?.details as DeclarationDetails | null;

  let hatvpDescription = "";
  if (details) {
    const parts: string[] = [];
    if (details.totalPortfolioValue && details.totalPortfolioValue > 0) {
      parts.push(
        `${formatCompactCurrency(details.totalPortfolioValue)} de participations financières`
      );
    }
    if (details.totalCompanies > 0) {
      parts.push(`${details.totalCompanies} sociétés déclarées`);
    }
    if (parts.length > 0) {
      hatvpDescription = ` ${parts.join(", ")}.`;
    }
  }

  const description = `${role} ${politician.currentParty ? `(${politician.currentParty.shortName})` : ""} - Consultez ses mandats, déclarations d'intérêts et affaires judiciaires.${hatvpDescription}`;

  // Bare profiles (RNE-imported mayors with no content) get noindex,follow (issue #385).
  const robots = politicianRobotsMetadata({
    mandates: politician.mandates.map((m) => ({
      type: m.type,
      communePopulation: m.localData?.commune?.population ?? null,
    })),
    publishedAffairsCount: politician.affairs.length,
    factCheckMentionsCount: politician.factCheckMentions.length,
    declarationsCount: politician.declarations.length,
    biography: politician.biography,
  });

  return {
    title: politician.fullName,
    description,
    ...robots,
    alternates: { canonical: `/politiques/${slug}` },
    openGraph: {
      title: `${politician.fullName} | Poligraph`,
      description,
      type: "profile",
      images: politician.photoUrl
        ? [
            {
              url: politician.photoUrl,
              width: 200,
              height: 200,
              alt: politician.fullName,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary",
      title: politician.fullName,
      description,
      images: politician.photoUrl ? [politician.photoUrl] : undefined,
    },
  };
}

export default async function PoliticianPage({ params }: PageProps) {
  const { slug } = await params;
  const politician = await getPolitician(slug);

  if (!politician) {
    notFound();
  }

  const currentMandate = politician.mandates.find((m) => m.isCurrent);
  const currentGroup = (
    currentMandate as typeof currentMandate & {
      parliamentaryData?: {
        parliamentaryGroup?: { code: string; name: string; color: string | null } | null;
      } | null;
    }
  )?.parliamentaryData?.parliamentaryGroup;
  const isActiveParliamentarian = politician.mandates.some(
    (m) => m.isCurrent && (m.type === "DEPUTE" || m.type === "SENATEUR")
  );
  const isChamberPresident = politician.mandates.some(
    (m) => m.isCurrent && m.role != null && /^Président /.test(m.role)
  );

  // Get vote stats (for deputies and senators - both have votes tracked)
  const isParliamentarian =
    currentMandate?.type === "DEPUTE" || currentMandate?.type === "SENATEUR";
  const mandateType = currentMandate?.type as "DEPUTE" | "SENATEUR" | undefined;
  const [voteData, parliamentaryCard] = await Promise.all([
    isParliamentarian ? getVoteStats(politician.id) : null,
    isParliamentarian && mandateType
      ? getPoliticianParliamentaryCard(politician.id, mandateType)
      : null,
  ]);

  // directAffairs still feeds the Carrière timeline.
  const directAffairs = politician.affairs.filter((a) => a.involvement === "DIRECT");

  // Judicial counters: "mis en cause" = DIRECT only (no double count with
  // mentions; enquêtes préliminaires excluded, RGPD art. 10 invariant).
  const judicial = computeJudicialCounts(
    politician.affairs.map((a) => ({ involvement: a.involvement, status: a.status }))
  );

  // Extract companies where politician is a board member for JSON-LD
  const latestDIAForLD = politician.declarations.find((d) => d.type === "INTERETS" && d.details);
  const detailsForLD = latestDIAForLD?.details as DeclarationDetails | null;
  const memberOfOrgs =
    detailsForLD?.financialParticipations
      .filter((p) => p.isBoardMember)
      .map((p) => ({ name: p.company }))
      .slice(0, 10) ?? [];

  // Dashboard signals + verification sources (single source of truth, passed
  // to both PoliticianSignals and the two responsive PoliticianSummary mounts).
  const portfolioValue = detailsForLD?.totalPortfolioValue ?? null;
  const signals = buildPoliticianSignals({
    slug: politician.slug,
    mandatesCount: politician.mandates.length,
    votesTotal: voteData ? voteData.stats.total : null,
    hasVotesTab: Boolean((voteData && voteData.stats.total > 0) || parliamentaryCard),
    hasFactchecksTab: politician.factCheckMentions.length > 0,
    factchecksCount: politician.factCheckMentions.length,
    dossiersCount: politician.dossierAuthors.length,
    declarationsCount: politician.declarations.length,
    portfolioValue,
    patrimoineHref: `/politiques/${politician.slug}#declarations`, // PR B: ?tab=patrimoine
    judicial,
  });
  const sourceLinks = buildSourceLinks(
    politician.externalIds.map((e) => ({ source: e.source, url: e.url }))
  );
  const osEntry = politician.externalIds.find((e) => e.source === "OPENSANCTIONS");
  const osMeta = (osEntry?.metadata ?? null) as { datasets?: string[] } | null;
  const registres = [
    ...new Set(
      (osMeta?.datasets ?? [])
        .map((d) => OS_DATASET_LABELS[d])
        .filter((l): l is string => l != null)
    ),
  ];
  const lastUpdated = formatDate(politician.updatedAt);
  const relationsHref = `/politiques/${politician.slug}/relations`;

  return (
    <>
      <ShareBar
        data={{
          title: politician.fullName,
          text: `${politician.fullName}${currentMandate ? `, ${MANDATE_TYPE_LABELS[currentMandate.type]}` : ""}${politician.currentParty ? ` (${politician.currentParty.shortName})` : ""}`,
          url: `${SITE_URL}/politiques/${politician.slug}`,
        }}
      />
      {/* JSON-LD Structured Data */}
      <PersonJsonLd
        name={politician.fullName}
        givenName={politician.firstName}
        familyName={politician.lastName}
        jobTitle={currentMandate ? MANDATE_TYPE_LABELS[currentMandate.type] : undefined}
        affiliation={politician.currentParty?.name}
        image={politician.photoUrl || undefined}
        birthDate={politician.birthDate?.toISOString().split("T")[0]}
        deathDate={politician.deathDate?.toISOString().split("T")[0]}
        birthPlace={politician.birthPlace || undefined}
        url={`${SITE_URL}/politiques/${politician.slug}`}
        sameAs={politician.externalIds
          .map((e) => e.url)
          .filter((url): url is string => url != null)}
        memberOf={memberOfOrgs.length > 0 ? memberOfOrgs : undefined}
      />
      <div className="container mx-auto px-4 pt-4 pb-8">
        <Breadcrumb
          items={[{ label: "Politiques", href: "/politiques" }, { label: politician.fullName }]}
        />

        {/* Header */}
        <div className="flex items-start gap-6 mb-8">
          <PoliticianAvatar
            photoUrl={politician.photoUrl}
            firstName={politician.firstName}
            lastName={politician.lastName}
            size="lg"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-display font-extrabold tracking-tight">
                {politician.fullName}
              </h1>
              <FollowButton slug={politician.slug} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {politician.currentParty && (
                <Link
                  href={
                    politician.currentParty.slug
                      ? `/partis/${politician.currentParty.slug}`
                      : "/partis"
                  }
                >
                  <Badge
                    className="text-sm hover:opacity-80 transition-opacity cursor-pointer whitespace-normal text-center"
                    style={{
                      backgroundColor: politician.currentParty.color
                        ? `${politician.currentParty.color}20`
                        : undefined,
                      color: politician.currentParty.color
                        ? ensureContrast(politician.currentParty.color, "#ffffff")
                        : undefined,
                    }}
                  >
                    <span className="opacity-70 mr-1">Parti :</span>
                    {politician.currentParty.name}
                  </Badge>
                </Link>
              )}
              {currentGroup && (
                <Badge
                  variant="outline"
                  className="text-sm"
                  style={{
                    borderColor: currentGroup.color || undefined,
                    color: currentGroup.color
                      ? ensureContrast(currentGroup.color, "#ffffff")
                      : undefined,
                  }}
                  title={currentGroup.name}
                >
                  Groupe : {currentGroup.name} ({currentGroup.code})
                </Badge>
              )}
              {politician.partyHistory
                .filter((ph) => !ph.endDate && ph.role !== "MEMBRE")
                .map((ph) => (
                  <Badge key={ph.id} variant="outline" className="text-sm">
                    {feminizePartyRole(PARTY_ROLE_LABELS[ph.role], politician.civility)}
                    {ph.party.shortName !== politician.currentParty?.shortName &&
                      ` · ${ph.party.shortName}`}
                  </Badge>
                ))}
            </div>
            {(politician.contactEmail ||
              politician.contactTwitter ||
              politician.contactFacebook ||
              politician.contactWebsite) && (
              <div className="flex items-center gap-1 mt-2">
                {politician.contactEmail && (
                  <a
                    href={`mailto:${politician.contactEmail}`}
                    aria-label={`Envoyer un email à ${politician.fullName}`}
                    title="Email"
                    className="inline-flex items-center justify-center h-11 w-11 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                  >
                    <Mail className="h-4 w-4" />
                  </a>
                )}
                {politician.contactTwitter && (
                  <a
                    href={
                      politician.contactTwitter.startsWith("http")
                        ? politician.contactTwitter
                        : `https://x.com/${politician.contactTwitter.replace("@", "")}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Profil X de ${politician.fullName}`}
                    title="X (Twitter)"
                    className="inline-flex items-center justify-center h-11 w-11 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                  >
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                )}
                {politician.contactFacebook && (
                  <a
                    href={
                      politician.contactFacebook.startsWith("http")
                        ? politician.contactFacebook
                        : `https://facebook.com/${politician.contactFacebook}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Page Facebook de ${politician.fullName}`}
                    title="Facebook"
                    className="inline-flex items-center justify-center h-11 w-11 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                  >
                    <Facebook className="h-4 w-4" />
                  </a>
                )}
                {politician.contactWebsite && (
                  <a
                    href={
                      politician.contactWebsite.startsWith("http")
                        ? politician.contactWebsite
                        : `https://${politician.contactWebsite}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Site web de ${politician.fullName}`}
                    title="Site web"
                    className="inline-flex items-center justify-center h-11 w-11 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                  >
                    <Globe className="h-4 w-4" />
                  </a>
                )}
              </div>
            )}
            {politician.birthDate && (
              <p className="text-muted-foreground mt-2">
                {politician.civility === "Mme" ? "Née" : "Né"} le {formatDate(politician.birthDate)}
                {politician.birthPlace && ` à ${politician.birthPlace}`}
                {politician.deathDate && (
                  <span className="text-gray-500">
                    {" "}
                    - Décédé{politician.civility === "Mme" ? "e" : ""} le{" "}
                    {formatDate(politician.deathDate)}
                  </span>
                )}
              </p>
            )}
            {politician.publicId && (
              <div className="mt-1">
                <CopyableId value={politician.publicId} />
              </div>
            )}
          </div>
        </div>

        {/* Summary before the tabbed body on mobile (DOM order matches reading order). */}
        <div className="lg:hidden mb-8">
          <PoliticianSummary
            signals={signals}
            sources={sourceLinks}
            registres={registres}
            relationsHref={relationsHref}
            lastUpdated={lastUpdated}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2">
            <ProfileTabs
              affairsCount={judicial.badgeCount}
              profileContent={
                <div className="space-y-8">
                  {/* Dashboard: clickable signals + computed presumption note */}
                  <PoliticianSignals signals={signals} />
                  <PresumptionNotice
                    proceduresEnCours={judicial.proceduresEnCours}
                    condamnationsNonDefinitives={judicial.condamnationsNonDefinitives}
                  />

                  {/* Biography */}
                  {politician.biography && (
                    <Card id="biographie">
                      <CardContent className="pt-6">
                        <MarkdownText className="text-muted-foreground leading-relaxed">
                          {politician.biography}
                        </MarkdownText>
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-dashed text-xs text-muted-foreground">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            className="w-3.5 h-3.5 shrink-0 text-primary/50"
                            aria-hidden="true"
                          >
                            <path d="M8 1a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 1ZM10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM12.95 4.11a.75.75 0 1 0-1.06-1.06l-1.062 1.06a.75.75 0 0 0 1.061 1.062l1.06-1.062ZM15 8a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 15 8ZM11.889 12.95a.75.75 0 0 0 1.06-1.06l-1.06-1.062a.75.75 0 0 0-1.062 1.061l1.062 1.06ZM8 12a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 12ZM5.172 11.889a.75.75 0 0 0-1.061-1.062L3.05 11.89a.75.75 0 1 0 1.06 1.06l1.062-1.06ZM4 8a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 4 8ZM4.11 5.172A.75.75 0 0 0 5.173 4.11L4.11 3.05a.75.75 0 1 0-1.06 1.06l1.06 1.062Z" />
                          </svg>
                          <span>
                            Résumé généré automatiquement à partir de sources publiques
                            {politician.biographyGeneratedAt &&
                              ` — ${formatDate(politician.biographyGeneratedAt)}`}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Authored Dossiers */}
                  {politician.dossierAuthors.length > 0 && (
                    <Card id="dossiers">
                      <CardHeader>
                        <h2 className="leading-none font-semibold flex items-center gap-2">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          Propositions de loi ({politician.dossierAuthors.length})
                        </h2>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {politician.dossierAuthors.map((da) => (
                            <Link
                              key={da.dossier.slug}
                              href={`/parlement/dossiers/${da.dossier.slug}`}
                              prefetch={false}
                              className="flex items-start justify-between gap-3 py-2 border-b last:border-0 hover:bg-muted/50 -mx-2 px-2 rounded transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium leading-snug">
                                  {da.dossier.shortTitle || da.dossier.title}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  {da.dossier.number && (
                                    <span className="text-xs text-muted-foreground font-mono">
                                      {da.dossier.number}
                                    </span>
                                  )}
                                  {da.dossier.filingDate && (
                                    <span className="text-xs text-muted-foreground">
                                      {formatDate(da.dossier.filingDate)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <StatusBadge status={da.dossier.status} />
                            </Link>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* HATVP Declarations */}
                  {politician.declarations.length > 0 ? (
                    <DeclarationCard
                      id="declarations"
                      declarations={politician.declarations.map((d) => ({
                        id: d.id,
                        type: d.type,
                        year: d.year,
                        hatvpUrl: d.hatvpUrl,
                        pdfUrl: d.pdfUrl,
                        details: d.details as DeclarationDetails | null,
                      }))}
                      politicianHatvpUrl={
                        politician.externalIds.find((e) => e.source === "HATVP")?.url ?? null
                      }
                    />
                  ) : isActiveParliamentarian ? (
                    <Card id="declarations">
                      <CardHeader>
                        <h2 className="text-lg font-semibold">
                          Déclarations d&apos;intérêts et d&apos;activités
                        </h2>
                      </CardHeader>
                      <CardContent>
                        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                          <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
                            Aucune déclaration publiée
                          </p>
                          <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed">
                            Tout député et sénateur est tenu de déposer une déclaration
                            d&apos;intérêts et d&apos;activités dans les 2 mois suivant son élection
                            (loi n°2013-907 du 11 octobre 2013). Le non-dépôt est passible de 3 ans
                            d&apos;emprisonnement, 45 000 € d&apos;amende et 10 ans
                            d&apos;inéligibilité. Seules les déclarations publiées par la HATVP sont
                            affichées ici.
                          </p>
                          <a
                            href="https://www.hatvp.fr/consulter-les-declarations/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block mt-3 text-sm text-amber-700 dark:text-amber-300 underline hover:text-amber-900 dark:hover:text-amber-100"
                          >
                            Consulter le site de la HATVP →
                          </a>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
              }
              factchecksContent={
                politician.factCheckMentions.length > 0 ? (
                  <FactChecksTab
                    mentions={politician.factCheckMentions}
                    politicianSlug={politician.slug}
                  />
                ) : null
              }
              careerContent={
                <CareerTimeline
                  mandates={politician.mandates}
                  partyHistory={politician.partyHistory}
                  affairs={directAffairs}
                  birthDate={politician.birthDate}
                  deathDate={politician.deathDate}
                />
              }
              votesContent={
                (voteData && voteData.stats.total > 0) || parliamentaryCard ? (
                  <VotesSection
                    slug={politician.slug}
                    voteData={voteData!}
                    parliamentaryCard={parliamentaryCard}
                    currentMandate={
                      currentMandate
                        ? {
                            type: currentMandate.type,
                            title: currentMandate.title,
                            constituency: currentMandate.constituency,
                          }
                        : null
                    }
                    currentGroup={currentGroup ?? null}
                    isChamberPresident={isChamberPresident}
                    themeDistribution={voteData?.themeDistribution}
                  />
                ) : null
              }
              affairsContent={
                <AffairsSection affairs={politician.affairs} civility={politician.civility} />
              }
            />
          </div>

          {/* Sidebar (desktop): same summary component, hidden on mobile where it renders above the tabs. */}
          <div className="hidden lg:block space-y-6">
            <PoliticianSummary
              signals={signals}
              sources={sourceLinks}
              registres={registres}
              relationsHref={relationsHref}
              lastUpdated={lastUpdated}
            />
            <BetaDisclaimer variant="profile" />
          </div>
        </div>

        {(() => {
          const isDepute = currentMandate?.type === "DEPUTE";
          const isSenateur = currentMandate?.type === "SENATEUR";
          const statsHref = isDepute
            ? "/statistiques?chamber=AN"
            : isSenateur
              ? "/statistiques?chamber=SENAT"
              : "/statistiques";
          const statsLabel = isDepute
            ? "les statistiques de l'Assemblée nationale"
            : isSenateur
              ? "les statistiques du Sénat"
              : "les statistiques générales";
          const statsAria = `Voir ${statsLabel} pour comparer ${politician.firstName} ${politician.lastName}`;
          return (
            <aside className="mt-12 p-4 rounded-lg border bg-muted/30">
              <p className="text-sm text-muted-foreground">
                Comparez {politician.firstName} {politician.lastName} avec les autres représentants
                dans{" "}
                <Link
                  href={statsHref}
                  aria-label={statsAria}
                  className="text-primary hover:underline"
                  prefetch={false}
                >
                  {statsLabel}
                </Link>
                .
              </p>
            </aside>
          );
        })()}
      </div>
    </>
  );
}

const OS_DATASET_LABELS: Record<string, string> = {
  fr_assemblee: "Assemblée nationale",
  fr_senat: "Sénat",
  fr_maires: "Maires",
  wd_peps: "PEPs",
  ann_pep_positions: "PEPs",
  everypolitician: "EveryPolitician",
};
